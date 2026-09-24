require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

# Without this podspec, Expo autolinking skips the module entirely and the app
# ships without native tracking (that's what happened on the first real walk).
Pod::Spec.new do |s|
  s.name           = 'RunTracker'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = 'Snowman'
  s.homepage       = 'https://github.com/Ruubbie/snowman'
  s.platforms      = { :ios => '17.0' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/Ruubbie/snowman.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreLocation', 'CoreMotion', 'AVFoundation', 'ActivityKit'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
