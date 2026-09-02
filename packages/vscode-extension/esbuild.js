#!/usr/bin/env node
/**
 * esbuild bundler for the Tomation VS Code extension.
 *
 * Produces two standalone CommonJS bundles in dist/:
 *   - client.js : the extension-host activation shim (LSP client)
 *   - server.js : the language server (LSP server), including all
 *                 @tomationjs/compiler code it uses
 *
 * The `vscode` module is provided by the extension host at runtime and must
 * never be bundled. Node built-ins stay external so the bundles run on the
 * Node runtime that ships with VS Code.
 *
 * Usage:
 *   node esbuild.js           - one-off production build
 *   node esbuild.js --watch   - rebuild on change (dev only)
 */

'use strict';

var esbuild = require('esbuild');
var path = require('path');

var ROOT = __dirname;
var watch = process.argv.includes('--watch');
var production = !watch;

/** @type {import('esbuild').BuildOptions} */
var shared = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
  // The extension host injects `vscode`; it can never be bundled.
  external: ['vscode']
};

var builds = [
  Object.assign({}, shared, {
    entryPoints: [path.join(ROOT, 'src', 'client', 'extension.ts')],
    outfile: path.join(ROOT, 'dist', 'client.js')
  }),
  Object.assign({}, shared, {
    entryPoints: [path.join(ROOT, 'src', 'server', 'server.ts')],
    outfile: path.join(ROOT, 'dist', 'server.js')
  })
];

async function run() {
  if (watch) {
    var contexts = await Promise.all(builds.map(function (opts) {
      return esbuild.context(opts);
    }));
    await Promise.all(contexts.map(function (ctx) {
      return ctx.watch();
    }));
    console.log('esbuild: watching for changes...');
  } else {
    await Promise.all(builds.map(function (opts) {
      return esbuild.build(opts);
    }));
    console.log('esbuild: built dist/client.js and dist/server.js');
  }
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
