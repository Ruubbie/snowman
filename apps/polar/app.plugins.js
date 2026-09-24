// Native config plugins owned by the iOS side of Polar. apps/polar/app.config.js
// spreads this array into its own `plugins` list.
//
// @bacons/apple-targets discovers Swift/SwiftUI extension targets under
// apps/polar/targets/**/expo-target.config.js (default `targets` dir - see
// apps/polar/targets/live-activity/expo-target.config.js) and wires them into
// the generated Xcode project as extra targets/extensions during prebuild.
// No options are needed: we don't sign locally (CI builds unsigned, see
// .github/workflows/polar-ios.yml), so there is no appleTeamId to pass here -
// that only matters for local `xcodebuild` signing, which we don't do.
export default [['@bacons/apple-targets', {}]];
