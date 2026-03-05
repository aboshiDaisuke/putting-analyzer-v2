const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Fix for pnpm symlinks on Vercel
config.resolver.unstable_enableSymlinks = true;

// Exclude NativeWind cache files from Metro's file watcher
// These are generated at build time and cause SHA-1 errors on Vercel
config.resolver.blockList = [
  /node_modules\/react-native-css-interop\/\.cache\/.*/,
];

// Ensure node_modules are properly resolved
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

module.exports = withNativeWind(config, {
  input: "./global.css",
});
