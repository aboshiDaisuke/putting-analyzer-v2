const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Fix for pnpm symlinks on Vercel
config.resolver.unstable_enableSymlinks = true;

// Ensure node_modules are properly resolved
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
