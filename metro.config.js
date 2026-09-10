// metro.config.js
// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const projectRoot = __dirname.replace(/[/\\]/g, '[/\\\\]');

// Only block files that should NEVER be resolved as modules.
// Do NOT blocklist all of node_modules — that breaks module resolution
// (this is what caused the expo-router/entry "does not exist" error).
config.resolver.blockList = [
  new RegExp(`${projectRoot}/.*\\.db$`),
  new RegExp(`${projectRoot}/.*\\.db-journal$`),
  new RegExp(`${projectRoot}/.*\\.db-wal$`),
  new RegExp(`${projectRoot}/.*\\.db-shm$`),
  new RegExp(`${projectRoot}/.*\\.sqlite$`),

  /node_modules\/react-native\/ReactCommon\/.*\/(ios|apple)\//,
  /node_modules\/react-native\/Libraries\/.*\/(ios|apple)\//,
  /node_modules\/.*\/ios\/.*\.(h|m|mm|swift)$/,
];

// Enable Metro watcher health check for reliable HMR / Fast Refresh
config.watcher = {
  ...config.watcher,
  useWatchman: false,
  healthCheck: {
    enabled: true,
  },
  // This is the correct place to stop the watcher from crawling node_modules
  // (watcher-level exclude, not resolver-level).
  ignoredPaths: [
    `${__dirname}/node_modules`,
  ],
};

module.exports = withNativeWind(config, { input: './global.css' });
