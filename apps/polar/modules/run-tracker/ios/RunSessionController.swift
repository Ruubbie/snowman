import CoreLocation
import Foundation

/// One planned segment, as sent by JS: `{kind, seconds}`.
struct RunSegment {
  let kind: String
  let seconds: Int
}

/// Owns the whole live run: GPS + filtering, the moving clock, segment
/// timeline, sample/event recording, cues and the Live Activity. Runs
/// entirely on the main queue (CLLocationManager and Timer both want a run
/// loop, and this keeps the whole class free of Swift-concurrency actor
/// isolation, which is safer to write correctly without a Mac to compile
/// against). Never throws/crashes outward - permission and network problems
/// are reported through `onEvent`, not exceptions.
final class RunSessionController: NSObject, CLLocationManagerDelegate {
  enum Phase: String { case ready, running, paused, finished }

  /// (eventName, body) -> forwarded to JS via Expo's sendEvent.
  var onEvent: ((String, [String: Any]?) -> Void)?

  private let manager = CLLocationManager()
  private let voice = VoiceCoach()
  private let motion = MotionTracker()
  private let cues = CueEngine()
  private let liveActivity = LiveActivityManager()
  private var store: RunStore?

  private var baseUrl: String?
  private var token: String?

  private(set) var phase: Phase = .ready
  private var runClientId = ""
  private var sessionId: String?
  private var segments: [RunSegment] = []
  private var segmentStarts: [Double] = []
  private var plannedTotalS: Double = 0
  private var segmentIndex = 0

  private var timer: Timer?
  private var accumulated: Double = 0
  private var resumedAt: Date?
  private var elapsedS: Double = 0
  private var startedAt: Date?

  private var lastLocation: CLLocation?
  private var distanceM: Double = 0
  private var gpsAccuracyM: Double = -1
  private var lastAcceptedFixAt: Date?
  private var gpsLost = false
  private var paceWindow: [(t: Double, d: Double)] = []
  private var nextKmThreshold: Double = 1000
  private var lastSplitAtS: Double = 0
  private var splitsS: [Double] = []

  private var seq = 0
  private var eventSeq = 0
  private var samples: [[String: Any]] = []
  private var events: [[String: Any]] = []

  override init() {
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyBest
    manager.activityType = .fitness
    manager.distanceFilter = kCLDistanceFilterNone
    manager.pausesLocationUpdatesAutomatically = false

    cues.speak = { [weak self] text in self?.voice.say(text) }
    cues.onCue = { [weak self] text, trigger, source in
      self?.onEvent?("cue", ["text": text, "trigger": trigger, "source": source])
    }
    cues.onCueSpoken = { [weak self] trigger, text, source in
      self?.recordEvent(type: "cue_spoken", data: ["trigger": trigger, "text": text, "source": source])
    }
  }

  // MARK: - Public API

  func configure(baseUrl: String?, token: String?) {
    self.baseUrl = baseUrl
    self.token = token
  }

  func prepare() {
    switch manager.authorizationStatus {
    case .notDetermined:
      manager.requestWhenInUseAuthorization()
    case .denied, .restricted:
      onEvent?("state", ["state": Phase.ready.rawValue, "error": "location_denied"])
    default:
      break
    }
    manager.startUpdatingLocation()
    motion.start()
  }

  /// Stops the GPS warm-up when the user leaves the ready screen without starting.
  func cancelPrepare() {
    guard phase == .ready else { return }
    manager.stopUpdatingLocation()
  }

  func start(options: [String: Any]) {
    guard phase == .ready || phase == .finished else { return }

    runClientId = (options["runClientId"] as? String) ?? UUID().uuidString
    sessionId = options["sessionId"] as? String
    segments = ((options["segments"] as? [[String: Any]]) ?? []).map {
      RunSegment(kind: $0["kind"] as? String ?? "run", seconds: $0["seconds"] as? Int ?? 0)
    }

    var t = 0.0
    var starts: [Double] = []
    for s in segments { starts.append(t); t += Double(s.seconds) }
    segmentStarts = starts
    plannedTotalS = t

    let brief = options["brief"] as? [String: Any]
    configureCues(from: brief)

    accumulated = 0
    resumedAt = nil
    elapsedS = 0
    segmentIndex = 0
    distanceM = 0
    lastLocation = nil
    gpsAccuracyM = -1
    lastAcceptedFixAt = nil
    gpsLost = false
    paceWindow.removeAll()
    nextKmThreshold = 1000
    lastSplitAtS = 0
    splitsS.removeAll()
    seq = 0
    eventSeq = 0
    samples.removeAll()
    events.removeAll()

    startedAt = Date()
    let store = RunStore(runClientId: runClientId)
    store.begin(meta: [
      "runClientId": runClientId,
      "sessionId": jsonValue(sessionId),
      "startedAt": iso(startedAt!),
      "finished": false,
    ])
    self.store = store

    manager.allowsBackgroundLocationUpdates = true
    manager.showsBackgroundLocationIndicator = true

    phase = .running
    onEvent?("state", ["state": Phase.running.rawValue])
    recordEvent(type: "start", data: nil)
    if let first = segments.first {
      recordEvent(type: "segment_start", data: ["index": 0, "kind": first.kind])
      liveActivity.start(
        segmentKind: first.kind,
        segmentIndex: 0,
        segmentEndsAt: startedAt!.addingTimeInterval(Double(first.seconds)),
        distanceM: 0,
        paceSPerKm: nil
      )
    } else {
      liveActivity.start(segmentKind: "run", segmentIndex: 0, segmentEndsAt: nil, distanceM: 0, paceSPerKm: nil)
    }
    cues.start()
    startTimer()
  }

  func pause() {
    guard phase == .running else { return }
    refreshElapsed()
    accumulated = elapsedS
    resumedAt = nil
    lastLocation = nil
    phase = .paused
    timer?.invalidate()
    onEvent?("state", ["state": Phase.paused.rawValue])
    recordEvent(type: "pause", data: nil)
    cues.onPause(snapshot: buildSnapshot())
    liveActivity.update(
      segmentKind: currentSegment?.kind ?? "run", segmentIndex: segmentIndex, segmentEndsAt: nil,
      distanceM: distanceM, paceSPerKm: nil, isPaused: true, force: true
    )
  }

  func resume() {
    guard phase == .paused else { return }
    resumedAt = Date()
    phase = .running
    onEvent?("state", ["state": Phase.running.rawValue])
    recordEvent(type: "resume", data: nil)
    cues.onResume(snapshot: buildSnapshot())
    startTimer()
    let seg = currentSegment
    let endsAt = seg.map { _ in Date().addingTimeInterval(segmentRemainingS()) }
    liveActivity.update(
      segmentKind: seg?.kind ?? "run", segmentIndex: segmentIndex, segmentEndsAt: endsAt,
      distanceM: distanceM, paceSPerKm: nil, isPaused: false, force: true
    )
  }

  func finish(completion: @escaping ([String: Any]) -> Void) {
    if phase == .running { refreshElapsed() }
    timer?.invalidate()
    timer = nil
    manager.stopUpdatingLocation()
    manager.allowsBackgroundLocationUpdates = false
    motion.stop()
    cues.stop()

    if phase != .finished {
      recordEvent(type: "finish", data: nil)
    }
    phase = .finished
    onEvent?("state", ["state": Phase.finished.rawValue])
    liveActivity.end(distanceM: distanceM, paceSPerKm: averagePaceSPerKm().map(Double.init))

    store?.markFinished()
    store?.close()

    let run: [String: Any] = [
      "clientId": runClientId,
      "sessionId": jsonValue(sessionId),
      "startedAt": iso(startedAt ?? Date()),
      "durationS": Int(elapsedS.rounded()),
      "distanceM": Int(distanceM.rounded()),
      "movingTimeS": Int(elapsedS.rounded()),
      "elapsedTimeS": jsonValue(startedAt.map { Int(Date().timeIntervalSince($0).rounded()) }),
      "avgPaceSPerKm": jsonValue(averagePaceSPerKm()),
      "splits": splitsS,
      "completedPlan": plannedTotalS <= 0 || elapsedS >= plannedTotalS - 5,
      "imported": false,
    ]
    completion(["run": run, "samples": samples, "events": events])
  }

  // MARK: - Cue setup

  private func configureCues(from brief: [String: Any]?) {
    cues.baseUrl = baseUrl
    cues.token = token
    cues.sessionId = sessionId
    cues.runClientId = runClientId
    cues.openingLine = brief?["opening_line"] as? String

    let targetsRaw = (brief?["targets"] as? [[String: Any]]) ?? []
    cues.targets = targetsRaw.map { t in
      CueTarget(
        segmentIndex: t["segment_index"] as? Int ?? 0,
        kind: t["kind"] as? String ?? "",
        paceMinSPerKm: t["pace_min_s_per_km"] as? Int,
        paceMaxSPerKm: t["pace_max_s_per_km"] as? Int
      )
    }

    let fb = brief?["fallback_lines"] as? [String: Any]
    cues.fallback = CueFallbackLines(
      tooFast: fb?["too_fast"] as? String ?? "",
      tooSlow: fb?["too_slow"] as? String ?? "",
      toRun: fb?["to_run"] as? String ?? "",
      toWalk: fb?["to_walk"] as? String ?? "",
      kmSplit: fb?["km_split"] as? String ?? "",
      halfway: fb?["halfway"] as? String ?? "",
      finish: fb?["finish"] as? String ?? "",
      encourage: fb?["encourage"] as? String ?? ""
    )
    prefetchClips(from: brief)
  }

  /// Olaf's own voice for the brief's lines, when the server made clips.
  /// Called as soon as the run screen has the brief, so clips are ready by Start.
  func prefetchClips(from brief: [String: Any]?) {
    let audio = brief?["audio"] as? [String: Any]
    var clipPaths: [String: String] = [:]
    if let text = brief?["opening_line"] as? String,
      let path = (audio?["opening_line"] as? [String: Any])?["url"] as? String {
      clipPaths[text] = path
    }
    let fbAudio = audio?["fallback_lines"] as? [String: Any]
    for (key, value) in (brief?["fallback_lines"] as? [String: Any]) ?? [:] {
      if let text = value as? String, let path = (fbAudio?[key] as? [String: Any])?["url"] as? String {
        clipPaths[text] = path
      }
    }
    voice.prefetch(clipPaths, baseUrl: baseUrl, token: token)
  }

  // MARK: - Clock & segments

  private func startTimer() {
    timer?.invalidate()
    timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
      self?.tick()
    }
  }

  private func refreshElapsed() {
    if let r = resumedAt { elapsedS = accumulated + Date().timeIntervalSince(r) }
  }

  private var currentSegment: RunSegment? {
    segments.indices.contains(segmentIndex) ? segments[segmentIndex] : nil
  }

  private var nextSegment: RunSegment? {
    segments.indices.contains(segmentIndex + 1) ? segments[segmentIndex + 1] : nil
  }

  private func segmentRemainingS() -> Double {
    guard segmentStarts.indices.contains(segmentIndex), let seg = currentSegment else { return 0 }
    return max(0, segmentStarts[segmentIndex] + Double(seg.seconds) - elapsedS)
  }

  private func tick() {
    guard phase == .running else { return }
    refreshElapsed()
    updateSegments()
    checkGpsLost()

    let snapshot = buildSnapshot()
    onEvent?("tick", snapshot)
    liveActivity.update(
      segmentKind: currentSegment?.kind ?? "run", segmentIndex: segmentIndex,
      segmentEndsAt: Date().addingTimeInterval(segmentRemainingS()),
      distanceM: distanceM, paceSPerKm: pace30s(), isPaused: false
    )
    cues.evaluate(snapshot: snapshotWithPlannedTotal(snapshot))
  }

  private func updateSegments() {
    guard !segments.isEmpty else { return }
    var idx = 0
    while idx + 1 < segmentStarts.count && elapsedS >= segmentStarts[idx + 1] { idx += 1 }

    // Prefetch Olaf's line ~15s before the next switch.
    if let next = nextSegment, segmentRemainingS() <= 15, segmentRemainingS() > 0 {
      cues.prefetchSegmentSwitch(nextIndex: segmentIndex + 1, snapshot: snapshotWithPlannedTotal(buildSnapshot()))
    }

    if idx != segmentIndex {
      recordEvent(type: "segment_end", data: ["index": segmentIndex, "kind": segments[segmentIndex].kind])
      segmentIndex = idx
      let seg = segments[idx]
      recordEvent(type: "segment_start", data: ["index": idx, "kind": seg.kind])
      cues.announceSegmentSwitch(nextKind: seg.kind, snapshot: snapshotWithPlannedTotal(buildSnapshot()))
      liveActivity.update(
        segmentKind: seg.kind, segmentIndex: idx,
        segmentEndsAt: Date().addingTimeInterval(segmentRemainingS()),
        distanceM: distanceM, paceSPerKm: pace30s(), isPaused: false, force: true
      )
    }
  }

  private func checkGpsLost() {
    guard let last = lastAcceptedFixAt else { return }
    let since = Date().timeIntervalSince(last)
    if since >= 15, !gpsLost {
      gpsLost = true
      recordEvent(type: "gps_lost", data: nil)
      cues.onGpsLost(snapshot: snapshotWithPlannedTotal(buildSnapshot()))
    }
  }

  // MARK: - GPS

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    DispatchQueue.main.async { [weak self] in self?.handle(locations) }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    let status = manager.authorizationStatus
    DispatchQueue.main.async { [weak self] in
      if status == .denied || status == .restricted {
        self?.onEvent?("state", ["state": self?.phase.rawValue ?? Phase.ready.rawValue, "error": "location_denied"])
      }
    }
  }

  private func handle(_ locations: [CLLocation]) {
    for loc in locations {
      gpsAccuracyM = loc.horizontalAccuracy
      onEvent?("gps", ["accuracy_m": gpsAccuracyM])

      guard phase == .running || phase == .paused else { continue }
      refreshElapsed()

      var accepted = phase == .running
        && loc.horizontalAccuracy > 0 && loc.horizontalAccuracy <= 25
        && abs(loc.timestamp.timeIntervalSinceNow) < 15

      var deltaM: Double?
      if accepted, let last = lastLocation {
        let d = loc.distance(from: last)
        let dt = loc.timestamp.timeIntervalSince(last.timestamp)
        if dt <= 0 || d / dt > 12 {
          accepted = false // stale reorder, or a jump faster than a sprinter
        } else {
          deltaM = d
        }
      }

      if accepted {
        if let d = deltaM { distanceM += d }
        lastLocation = loc
        lastAcceptedFixAt = Date()
        if gpsLost {
          gpsLost = false
          recordEvent(type: "gps_recovered", data: nil)
        }
        paceWindow.append((t: elapsedS, d: distanceM))
        paceWindow.removeAll { elapsedS - $0.t > 30 }
        checkKmSplit()
      }

      recordSample(loc, accepted: accepted)
    }
  }

  private func checkKmSplit() {
    while distanceM >= nextKmThreshold {
      let split = elapsedS - lastSplitAtS
      splitsS.append(split)
      lastSplitAtS = elapsedS
      let km = Int(nextKmThreshold / 1000)
      recordEvent(type: "km_split", data: ["km": km, "splitS": split])
      cues.onKmSplit(
        km: km, splitS: split, segmentKind: currentSegment?.kind ?? "run",
        snapshot: snapshotWithPlannedTotal(buildSnapshot())
      )
      nextKmThreshold += 1000
    }
  }

  private func pace30s() -> Double? {
    guard let first = paceWindow.first, elapsedS - first.t >= 10 else { return nil }
    let dd = distanceM - first.d
    guard dd > 10 else { return nil }
    return (elapsedS - first.t) / (dd / 1000)
  }

  private func averagePaceSPerKm() -> Int? {
    guard distanceM > 50 else { return nil }
    return Int((elapsedS / (distanceM / 1000)).rounded())
  }

  // MARK: - Recording

  private func recordSample(_ loc: CLLocation, accepted: Bool) {
    let sample: [String: Any] = [
      "seq": seq, "t_s": elapsedS, "ts": iso(loc.timestamp),
      "lat": loc.coordinate.latitude, "lon": loc.coordinate.longitude,
      "alt_m": jsonValue(loc.verticalAccuracy >= 0 ? loc.altitude : nil),
      "h_acc_m": loc.horizontalAccuracy, "v_acc_m": loc.verticalAccuracy,
      "speed_mps": jsonValue(loc.speed >= 0 ? loc.speed : nil),
      "speed_acc_mps": jsonValue(loc.speedAccuracy >= 0 ? loc.speedAccuracy : nil),
      "course_deg": jsonValue(loc.course >= 0 ? loc.course : nil),
      "dist_m": distanceM,
      "cadence_spm": jsonValue(motion.cadenceSpm),
      "pace_s_per_km": jsonValue(pace30s()),
      "rel_alt_m": jsonValue(motion.relativeAltitudeM),
      "steps_total": jsonValue(motion.stepsTotal),
      "floors_up": jsonValue(motion.floorsUp),
      "floors_down": jsonValue(motion.floorsDown),
      "segment_index": segmentIndex,
      "accepted": accepted,
    ]
    seq += 1
    samples.append(sample)
    store?.appendSample(sample)
  }

  private func recordEvent(type: String, data: [String: Any]?) {
    let event: [String: Any] = [
      "seq": eventSeq, "t_s": elapsedS, "ts": iso(Date()),
      "type": type, "data": jsonValue(data),
    ]
    eventSeq += 1
    events.append(event)
    store?.appendEvent(event)
  }

  // MARK: - Snapshots

  private func buildSnapshot() -> [String: Any] {
    let seg = currentSegment
    var next: [String: Any]?
    if let n = nextSegment { next = ["kind": n.kind, "seconds": n.seconds] }
    return [
      "state": phase.rawValue,
      "elapsed_s": elapsedS,
      "distance_m": distanceM,
      "pace_30s": jsonValue(pace30s()),
      "avg_pace": jsonValue(averagePaceSPerKm()),
      "segment": ["index": segmentIndex, "kind": jsonValue(seg?.kind), "remaining_s": segmentRemainingS()],
      "next_segment": jsonValue(next),
      "gps_accuracy_m": gpsAccuracyM,
      "cadence_spm": jsonValue(motion.cadenceSpm),
    ]
  }

  private func snapshotWithPlannedTotal(_ snapshot: [String: Any]) -> [String: Any] {
    var s = snapshot
    s["planned_total_s"] = plannedTotalS
    return s
  }

  private func iso(_ date: Date) -> String {
    ISO8601DateFormatter().string(from: date)
  }
}
