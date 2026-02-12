import { build } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const nm = resolve(__dirname, 'node_modules');

// The @encointer packages publish only .ts source (no compiled JS).
// This plugin resolves bare specifiers to their .ts entry points
// and rewrites internal .js imports to .ts where the .ts file exists.
const encointerResolve = {
  name: 'encointer-resolve',
  setup(b) {
    const mapping = {
      '@encointer/node-api': resolve(nm, '@encointer/node-api/src/index.ts'),
      '@encointer/types': resolve(nm, '@encointer/types/src/index.ts'),
      '@encointer/util': resolve(nm, '@encointer/util/src/index.ts'),
    };

    // Bare specifier and sub-path imports for @encointer packages
    b.onResolve({ filter: /^@encointer\// }, (args) => {
      for (const [pkg, entry] of Object.entries(mapping)) {
        if (args.path === pkg) {
          return { path: entry };
        }
        if (args.path.startsWith(pkg + '/')) {
          const subpath = args.path.slice(pkg.length + 1);
          let resolved = resolve(dirname(entry), subpath);
          if (resolved.endsWith('.js')) resolved = resolved.replace(/\.js$/, '.ts');
          if (!resolved.endsWith('.ts')) resolved += '.ts';
          return { path: resolved };
        }
      }
    });

    // Relative .js imports within @encointer source: rewrite to .ts if the .ts file exists
    b.onResolve({ filter: /^\..*\.js$/ }, (args) => {
      if (!args.importer.includes(resolve(nm, '@encointer/'))) return;
      const tsPath = resolve(dirname(args.importer), args.path.replace(/\.js$/, '.ts'));
      if (existsSync(tsPath)) {
        return { path: tsPath };
      }
    });
  },
};

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  outdir: 'dist',
  format: 'cjs',
  sourcemap: true,
  plugins: [encointerResolve],
});
