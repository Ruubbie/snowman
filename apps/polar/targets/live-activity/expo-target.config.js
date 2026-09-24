/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'PolarLiveActivity',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  colors: {
    $accent: '#F64B29',
    $navy: '#1B212C',
    $slate: '#3C4657',
    $peach: '#FFD6AE',
    $widgetBackground: '#F5F7FA',
  },
};
