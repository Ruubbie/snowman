import CoreMotion
import Foundation

/// Latest cadence/step/altitude readings from CMPedometer + CMAltimeter,
/// refreshed continuously while a run is active. Any sensor unavailable on
/// the device (e.g. no barometer) is simply left nil forever - callers must
/// treat every property as optional.
final class MotionTracker {
  private let pedometer = CMPedometer()
  private let altimeter = CMAltimeter()

  private(set) var cadenceSpm: Double?
  private(set) var stepsTotal: Int?
  private(set) var floorsUp: Int?
  private(set) var floorsDown: Int?
  private(set) var relativeAltitudeM: Double?

  func start() {
    let from = Date()
    if CMPedometer.isStepCountingAvailable() {
      pedometer.startUpdates(from: from) { [weak self] data, error in
        guard let self, let data, error == nil else { return }
        DispatchQueue.main.async {
          self.stepsTotal = data.numberOfSteps.intValue
          self.floorsUp = data.floorsAscended?.intValue
          self.floorsDown = data.floorsDescended?.intValue
          // currentCadence is steps/second while moving; nil when stationary.
          if let cadence = data.currentCadence {
            self.cadenceSpm = cadence.doubleValue * 60
          }
        }
      }
    }
    if CMAltimeter.isRelativeAltitudeAvailable() {
      altimeter.startRelativeAltitudeUpdates(to: .main) { [weak self] data, error in
        guard let self, let data, error == nil else { return }
        self.relativeAltitudeM = data.relativeAltitude.doubleValue
      }
    }
  }

  func stop() {
    pedometer.stopUpdates()
    if CMAltimeter.isRelativeAltitudeAvailable() {
      altimeter.stopRelativeAltitudeUpdates()
    }
  }
}
