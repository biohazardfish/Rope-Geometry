import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
let resolvedConfig;

// Runtime fetch URLs are not discovered by Rollup. Ship their source data with
// both HTML entries, without bundling the large, optional local source videos.
export default {
  build: { rollupOptions: { input: ['index.html', 'phase5.html', 'at-70.html', 'somerville.html', 'rope-edit.html'] } },
  plugins: [{
    name: 'rope-runtime-assets',
    apply: 'build',
    configResolved(config) { resolvedConfig = config; },
    closeBundle() {
      const { root, build } = resolvedConfig;
      for (const directory of ['data', 'reports', 'diagrams', 'references/Documents', 'references/phase4b']) {
        const source = resolve(root, directory);
        if (existsSync(source)) cpSync(source, resolve(root, build.outDir, directory), {
          recursive: true,
          filter: path => !/\.(?:html|mp4)$/i.test(path),
        });
      }
    },
  }],
};
