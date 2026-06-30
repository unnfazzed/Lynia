// Metro config for the pnpm monorepo. Without this, EAS's cloud bundler can't resolve `@lynia/shared`
// or the hoisted Expo/React Native packages from apps/mobile, and the "Bundle JavaScript" phase fails.
// Lets Metro watch the workspace root and look in both the app and root node_modules.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
