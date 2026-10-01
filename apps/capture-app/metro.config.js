// Metro configuration for the pnpm monorepo. Watches the workspace root so
// `@panchnama/shared` resolves, and resolves modules from both the app and the
// hoisted workspace `node_modules`.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;
// Honour the `exports` map in package.json so `@panchnama/shared/rn` (the pure,
// node:crypto-free entry) resolves to its dist build.
config.resolver.unstable_enablePackageExports = true;

// The codebase uses TypeScript ESM `.js`-suffixed relative imports (nodenext
// convention: `./foo.js` resolves to `./foo.ts`). Metro resolves the literal
// `.js`, so strip the suffix for relative specifiers and let it resolve the
// real `.ts`/`.tsx` source via `sourceExts`.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if ((moduleName.startsWith('./') || moduleName.startsWith('../')) && moduleName.endsWith('.js')) {
    try {
      return context.resolveRequest(context, moduleName.slice(0, -3), platform);
    } catch {
      // fall through to the default resolver below
    }
  }
  const resolver = defaultResolveRequest ?? context.resolveRequest;
  return resolver(context, moduleName, platform);
};

module.exports = config;
