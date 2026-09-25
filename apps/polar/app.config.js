import appPlugins from './app.plugins.js';

/** @type {import('expo/config').ExpoConfig} */
export default {
  name: 'Polar',
  slug: 'polar',
  scheme: 'polar',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    bundleIdentifier: 'nl.ruben.polar',
    supportsTablet: false,
    infoPlist: {
      UIBackgroundModes: ['location', 'audio'],
      NSLocationWhenInUseUsageDescription:
        'Polar uses your location to track pace and distance while you run.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'Polar uses your location to keep tracking your run if you lock your phone.',
      NSMotionUsageDescription: 'Polar uses motion data for cadence and elevation during a run.',
      NSSupportsLiveActivities: true,
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    },
  },
  web: {
    bundler: 'metro',
    output: 'single',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-notifications',
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '17.0' },
      },
    ],
    ...appPlugins,
  ],
  experiments: {
    typedRoutes: false,
  },
};
