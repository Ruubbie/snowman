import Foundation

/// Converts an optional value into something both JSONSerialization and
/// Expo's JS bridge can encode: the wrapped value if present, otherwise
/// NSNull(). `optional as Any` on a nil value bridges unpredictably through
/// Foundation APIs (and can make JSONSerialization silently fail) - this is
/// the explicit, always-correct way to embed an optional in a `[String: Any]`
/// payload that may be JSON-encoded (run samples/events, meta.json, cue
/// request bodies) or sent to JS.
func jsonValue<T>(_ value: T?) -> Any {
  if let value { return value }
  return NSNull()
}

/// Whole number from a JS value. JS numbers arrive as Double (or NSNumber),
/// so a plain `as? Int` silently yields nil for them.
func intValue(_ value: Any?) -> Int? {
  switch value {
  case let v as Int: return v
  case let v as Double where v.isFinite: return Int(v.rounded())
  case let v as NSNumber: return v.intValue
  case let v as String: return Int(v)
  default: return nil
  }
}
