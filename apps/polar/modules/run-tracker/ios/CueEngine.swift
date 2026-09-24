import Foundation

/// A single pace target for one planned segment, from the brief's `targets`.
struct CueTarget {
  let segmentIndex: Int
  let kind: String
  let paceMinSPerKm: Int?
  let paceMaxSPerKm: Int?
}

/// Brief `fallback_lines`, spoken locally when Olaf can't be reached (or
/// returns null/late) so a cue is still always said.
struct CueFallbackLines {
  let tooFast: String
  let tooSlow: String
  let toRun: String
  let toWalk: String
  let kmSplit: String
  let halfway: String
  let finish: String
  let encourage: String
}

/// Decides when to speak a live cue, asks the backbone (`POST /v1/running/cue`)
/// for Olaf's line, and always falls back to a brief-provided (or built-in)
/// line so a moment is never announced silently. All methods are expected to
/// be called from the same serial context as RunSessionController (main
/// queue) - this class does no locking of its own.
final class CueEngine {
  var baseUrl: String?
  var token: String?
  var sessionId: String?
  var runClientId: String = ""
  var openingLine: String?
  var targets: [CueTarget] = []
  var fallback: CueFallbackLines?

  /// Fired for every cue actually spoken (live or fallback).
  var onCue: ((_ text: String, _ trigger: String, _ source: String) -> Void)?
  /// Fired for every cue actually spoken, to also log a `cue_spoken` run event.
  var onCueSpoken: ((_ trigger: String, _ text: String, _ source: String) -> Void)?
  var speak: ((String) -> Void)?

  private struct RecentCue { let trigger: String; let text: String }

  private var recentCues: [RecentCue] = []
  private var lastCueAt = Date.distantPast
  private var lastPaceCueAt = Date.distantPast
  private var lastFallbackSpokenAt: [String: Date] = [:]
  private var inFlight = false
  private var outOfRangeSince: Double?
  private var firedOnce = Set<String>()
  private var lastKmSplitS: [Int: Double] = [:]
  private var lastElapsedS: Double = 0

  private var prefetchedSay: String?
  private var prefetchedForSegmentIndex: Int?

  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 4
    config.timeoutIntervalForResource = 4
    return URLSession(configuration: config)
  }()

  func reset() {
    recentCues.removeAll()
    lastCueAt = Date()
    lastPaceCueAt = .distantPast
    outOfRangeSince = nil
    firedOnce.removeAll()
    lastKmSplitS.removeAll()
    lastFallbackSpokenAt.removeAll()
    prefetchedSay = nil
    prefetchedForSegmentIndex = nil
    inFlight = false
  }

  func start() {
    reset()
    if let line = openingLine, !line.isEmpty {
      speakLocal(line, trigger: "opening", source: "opening")
    }
  }

  func stop() {
    session.invalidateAndCancel()
  }

  private func target(for segmentIndex: Int) -> CueTarget? {
    targets.first { $0.segmentIndex == segmentIndex }
  }

  // MARK: - Per-tick evaluation

  /// `snapshot` is the same payload sent as the JS `tick` event, plus
  /// planned_total_s (added by the caller, not part of the JS payload).
  func evaluate(snapshot: [String: Any]) {
    let elapsedS = (snapshot["elapsed_s"] as? Double) ?? 0
    lastElapsedS = elapsedS
    let plannedTotalS = (snapshot["planned_total_s"] as? Double) ?? 0
    let segment = snapshot["segment"] as? [String: Any]
    let segmentIndex = (segment?["index"] as? Int) ?? 0
    let pace30s = snapshot["pace_30s"] as? Double

    if Date().timeIntervalSince(lastCueAt) >= 240 {
      // Reset the timer immediately so a slow/failed response doesn't spam checkins.
      lastCueAt = Date()
      trigger("checkin", snapshot: snapshot)
    }

    if plannedTotalS > 0, elapsedS >= plannedTotalS / 2 {
      once("halfway") { trigger("halfway", snapshot: snapshot) }
    }

    if plannedTotalS > 0, elapsedS >= plannedTotalS {
      once("finish") { trigger("finish", snapshot: snapshot) }
    }

    guard let pace = pace30s, let t = target(for: segmentIndex),
          (t.paceMinSPerKm != nil || t.paceMaxSPerKm != nil)
    else {
      outOfRangeSince = nil
      return
    }

    var outTrigger: String?
    if let minPace = t.paceMinSPerKm, pace < Double(minPace) {
      outTrigger = "too_fast"
    } else if let maxPace = t.paceMaxSPerKm, pace > Double(maxPace) {
      outTrigger = "too_slow"
    }

    if let outTrigger {
      if outOfRangeSince == nil { outOfRangeSince = elapsedS }
      let since = outOfRangeSince ?? elapsedS
      if elapsedS - since >= 20, Date().timeIntervalSince(lastPaceCueAt) >= 60 {
        lastPaceCueAt = Date()
        trigger(outTrigger, snapshot: snapshot)
      }
    } else {
      outOfRangeSince = nil
    }
  }

  // MARK: - Discrete moments

  func onKmSplit(km: Int, splitS: Double, segmentKind: String, snapshot: [String: Any]) {
    trigger("km_split", snapshot: snapshot)
    if let prev = lastKmSplitS[km - 1], segmentKind == "run", splitS - prev > 30 {
      trigger("slowing", snapshot: snapshot)
    }
    lastKmSplitS[km] = splitS
  }

  func onPause(snapshot: [String: Any]) {
    trigger("paused", snapshot: snapshot)
  }

  func onResume(snapshot: [String: Any]) {
    trigger("resumed", snapshot: snapshot)
  }

  func onGpsLost(snapshot: [String: Any]) {
    trigger("gps_lost", snapshot: snapshot)
  }

  /// Prefetch Olaf's line ~15s before a segment switch so it's ready by the
  /// time the switch happens. Allowed to run even if another request is
  /// in flight (the one exception to the single-in-flight rule).
  func prefetchSegmentSwitch(nextIndex: Int, snapshot: [String: Any]) {
    guard prefetchedForSegmentIndex != nextIndex else { return }
    prefetchedForSegmentIndex = nextIndex
    prefetchedSay = nil
    postCue(trigger: "segment_upcoming", snapshot: buildSnapshot(base: snapshot)) { [weak self] say in
      guard let self, self.prefetchedForSegmentIndex == nextIndex else { return }
      self.prefetchedSay = say
    }
  }

  /// Speak the segment switch, live if the prefetch already landed, else the
  /// brief's fallback line immediately - a switch must always be announced.
  func announceSegmentSwitch(nextKind: String, snapshot: [String: Any]) {
    if let say = prefetchedSay, !say.isEmpty {
      speakLocal(say, trigger: "segment_upcoming", source: "live")
    } else {
      let line = nextKind == "walk" ? fallback?.toWalk : fallback?.toRun
      speakLocal(line ?? "", trigger: "segment_upcoming", source: "fallback")
    }
    prefetchedSay = nil
  }

  // MARK: - Networking

  private func once(_ key: String, _ action: () -> Void) {
    guard !firedOnce.contains(key) else { return }
    firedOnce.insert(key)
    action()
  }

  private func trigger(_ trigger: String, snapshot: [String: Any]) {
    guard !inFlight else { return }
    inFlight = true
    postCue(trigger: trigger, snapshot: buildSnapshot(base: snapshot)) { [weak self] say in
      guard let self else { return }
      self.inFlight = false
      if let say, !say.isEmpty {
        self.speakLocal(say, trigger: trigger, source: "live")
      } else {
        self.speakFallback(for: trigger)
      }
    }
  }

  private func buildSnapshot(base: [String: Any]) -> [String: Any] {
    var snapshot = base
    snapshot.removeValue(forKey: "planned_total_s")
    snapshot["recent_cues"] = recentCues.suffix(3).map { ["trigger": $0.trigger, "text": $0.text] }
    return snapshot
  }

  private func postCue(trigger triggerName: String, snapshot: [String: Any], completion: @escaping (String?) -> Void) {
    guard let baseUrl, let url = URL(string: baseUrl + "/v1/running/cue") else {
      completion(nil)
      return
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    var body: [String: Any] = [
      "runClientId": runClientId,
      "trigger": triggerName,
      "snapshot": snapshot,
    ]
    if let sessionId { body["sessionId"] = sessionId }
    guard let httpBody = try? JSONSerialization.data(withJSONObject: body) else {
      completion(nil)
      return
    }
    request.httpBody = httpBody

    let task = session.dataTask(with: request) { data, response, error in
      DispatchQueue.main.async {
        guard error == nil, let data,
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        else {
          completion(nil)
          return
        }
        completion(json["say"] as? String)
      }
    }
    task.resume()
  }

  private func speakFallback(for triggerName: String) {
    guard let line = fallbackLine(for: triggerName), !line.isEmpty else { return }
    let now = Date()
    if let last = lastFallbackSpokenAt[triggerName], now.timeIntervalSince(last) < 180 { return }
    lastFallbackSpokenAt[triggerName] = now
    speakLocal(line, trigger: triggerName, source: "fallback")
  }

  private func fallbackLine(for triggerName: String) -> String? {
    switch triggerName {
    case "too_fast": return fallback?.tooFast
    case "too_slow": return fallback?.tooSlow
    case "km_split": return fallback?.kmSplit
    case "halfway": return fallback?.halfway
    case "finish": return fallback?.finish
    case "checkin", "slowing": return fallback?.encourage
    case "paused": return "Paused."
    case "resumed": return "Resumed. Let's go."
    case "gps_lost": return "Lost GPS signal."
    default: return nil
    }
  }

  private func speakLocal(_ text: String, trigger triggerName: String, source: String) {
    guard !text.isEmpty else { return }
    lastCueAt = Date()
    recentCues.append(RecentCue(trigger: triggerName, text: text))
    if recentCues.count > 3 { recentCues.removeFirst(recentCues.count - 3) }
    speak?(text)
    onCue?(text, triggerName, source)
    onCueSpoken?(triggerName, text, source)
  }
}
