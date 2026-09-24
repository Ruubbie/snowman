import ExpoModulesCore

/// Expo module surface for the native run tracker. Kept intentionally thin:
/// all state and logic live in RunSessionController so they're easy to unit
/// reason about without the Expo Modules plumbing in the way.
///
/// Every JS-facing function takes/returns plain dictionaries ([String: Any])
/// rather than Expo `Record` types - fewer moving parts to get wrong without
/// a Mac to compile against, and dictionaries bridge to/from JS objects
/// automatically.
public class RunTrackerModule: Module {
  private lazy var controller: RunSessionController = {
    let controller = RunSessionController()
    controller.onEvent = { [weak self] name, body in
      self?.sendEvent(name, body)
    }
    return controller
  }()

  public func definition() -> ModuleDefinition {
    Name("RunTracker")

    Events("tick", "cue", "state", "gps")

    // CLLocationManager and Timer both need to live on a thread whose run
    // loop is actively spinning - guaranteed true for the main thread, not
    // guaranteed for whatever thread Expo invokes these closures on - so
    // every call into `controller` is dispatched onto main explicitly.

    Function("configure") { (options: [String: Any]) in
      DispatchQueue.main.async {
        self.controller.configure(
          baseUrl: options["baseUrl"] as? String,
          token: options["token"] as? String
        )
      }
    }

    AsyncFunction("prepare") { (promise: Promise) in
      DispatchQueue.main.async {
        self.controller.prepare()
        promise.resolve(nil)
      }
    }

    Function("cancel") {
      DispatchQueue.main.async {
        self.controller.cancelPrepare()
      }
    }

    Function("start") { (options: [String: Any]) in
      DispatchQueue.main.async {
        self.controller.start(options: options)
      }
    }

    Function("pause") {
      DispatchQueue.main.async {
        self.controller.pause()
      }
    }

    Function("resume") {
      DispatchQueue.main.async {
        self.controller.resume()
      }
    }

    AsyncFunction("finish") { (promise: Promise) in
      DispatchQueue.main.async {
        self.controller.finish { result in
          promise.resolve(result)
        }
      }
    }

    AsyncFunction("getUnfinishedRuns") { (promise: Promise) in
      DispatchQueue.main.async {
        promise.resolve(RunStore.unfinishedRuns())
      }
    }
  }
}
