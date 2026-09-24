import Foundation

/// Crash-safe JSONL persistence for one run: Application Support/runs/<runClientId>/
/// {meta.json, samples.jsonl, events.jsonl}. Samples/events are appended and
/// flushed as they happen so a kill/crash mid-run loses at most the last
/// unflushed write, never the whole run. RunSessionController is the source
/// of truth for the in-memory sample/event arrays returned by finish(); this
/// store is the on-disk backup plus the bookkeeping getUnfinishedRuns() needs.
final class RunStore {
  let runClientId: String
  private let dir: URL
  private var samplesHandle: FileHandle?
  private var eventsHandle: FileHandle?

  init(runClientId: String) {
    self.runClientId = runClientId
    self.dir = Self.runsRootURL().appendingPathComponent(runClientId, isDirectory: true)
  }

  private static func runsRootURL() -> URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
      ?? FileManager.default.temporaryDirectory
    return base.appendingPathComponent("runs", isDirectory: true)
  }

  func begin(meta: [String: Any]) {
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    writeMeta(meta)
    let samplesURL = dir.appendingPathComponent("samples.jsonl")
    let eventsURL = dir.appendingPathComponent("events.jsonl")
    FileManager.default.createFile(atPath: samplesURL.path, contents: nil)
    FileManager.default.createFile(atPath: eventsURL.path, contents: nil)
    samplesHandle = try? FileHandle(forWritingTo: samplesURL)
    eventsHandle = try? FileHandle(forWritingTo: eventsURL)
  }

  func appendSample(_ sample: [String: Any]) {
    append(sample, to: samplesHandle)
  }

  func appendEvent(_ event: [String: Any]) {
    append(event, to: eventsHandle)
  }

  func markFinished() {
    var meta = readMeta() ?? [:]
    meta["finished"] = true
    writeMeta(meta)
  }

  func close() {
    try? samplesHandle?.close()
    try? eventsHandle?.close()
    samplesHandle = nil
    eventsHandle = nil
  }

  private func append(_ dict: [String: Any], to handle: FileHandle?) {
    guard let handle, var data = try? JSONSerialization.data(withJSONObject: dict) else { return }
    data.append(0x0A) // "\n"
    try? handle.write(contentsOf: data)
  }

  private func writeMeta(_ meta: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: meta, options: [.prettyPrinted]) else { return }
    try? data.write(to: dir.appendingPathComponent("meta.json"), options: .atomic)
  }

  private func readMeta() -> [String: Any]? {
    guard let data = try? Data(contentsOf: dir.appendingPathComponent("meta.json")) else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
  }

  /// Runs on disk with no `finished: true` marker in meta.json - crashed or
  /// force-quit mid-run. Returns just the client ids per the JS contract.
  static func unfinishedRuns() -> [[String: Any]] {
    let root = runsRootURL()
    guard let entries = try? FileManager.default.contentsOfDirectory(
      at: root, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]
    ) else { return [] }

    var result: [[String: Any]] = []
    for entryDir in entries {
      let metaURL = entryDir.appendingPathComponent("meta.json")
      guard let data = try? Data(contentsOf: metaURL),
            let meta = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
      else { continue }
      let finished = (meta["finished"] as? Bool) ?? false
      guard !finished else { continue }
      let runClientId = (meta["runClientId"] as? String) ?? entryDir.lastPathComponent
      result.append(["runClientId": runClientId])
    }
    return result
  }
}
