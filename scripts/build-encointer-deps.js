/**
 * Pre-compile @encointer TS-only npm packages to CJS.
 *
 * The @encointer packages ship TypeScript source only (no compiled JS).
 * This script:
 *   1. Patches each package.json so Node resolves the compiled CJS output
 *   2. Runs tsc to compile TS → CJS + declarations in-place
 *   3. Removes .ts source files so the main tsc treats them as normal packages
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PACKAGES = ['types', 'util', 'node-api'];
const ROOT = path.join(__dirname, '..');

for (const pkg of PACKAGES) {
  const pkgDir = path.join(ROOT, 'node_modules', '@encointer', pkg);
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

  // Remove ESM marker so Node treats .js as CommonJS
  delete pkgJson.type;

  // Point entry to compiled source
  pkgJson.main = './src/index.js';
  pkgJson.types = './src/index.d.ts';

  // Allow subpath imports (e.g. @encointer/util/assignment)
  pkgJson.exports = {
    '.': { require: './src/index.js', types: './src/index.d.ts' },
    './*': { require: './src/*.js', types: './src/*.d.ts' },
  };

  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
}

// Compile TS → CJS + declarations
execSync('npx tsc -p tsconfig.deps.json', { stdio: 'inherit', cwd: ROOT });

// Remove .ts source files so the main tsc uses the generated .d.ts instead
// (skipLibCheck only skips .d.ts files; .ts files would be type-checked)
for (const pkg of PACKAGES) {
  const srcDir = path.join(ROOT, 'node_modules', '@encointer', pkg, 'src');
  removeTs(srcDir);
}

function removeTs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeTs(full);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      fs.unlinkSync(full);
    }
  }
}
