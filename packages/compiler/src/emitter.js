'use strict';

/**
 * emitter.js — writes spec.json to disk.
 *
 * Accepts a validated spec object and an output path, then serialises the
 * spec as formatted JSON (2-space indent) and writes it to the given path.
 *
 * Exported API:
 *   emitSpec(spec, outputPath) → EmitResult
 *
 * EmitResult shape:
 *   { ok: true,  outputPath: string }
 *   { ok: false, error: string }
 *
 * Requirements: 12.1
 */

var fs = require('fs');
var path = require('path');

/**
 * Write a validated spec object to disk as a formatted JSON file.
 *
 * The output is formatted with a 2-space indent as required by the spec
 * (JSON.stringify(spec, null, 2)).
 *
 * @param {object} spec        - Validated spec object (from validateSpec / flattenSpec)
 * @param {string} outputPath  - Destination file path (e.g. "/project/dist/spec.json")
 * @returns {{ ok: boolean, outputPath?: string, error?: string }}
 */
function emitSpec(spec, outputPath) {
  if (!spec || typeof spec !== 'object') {
    return { ok: false, error: 'emitSpec: spec must be a non-null object' };
  }

  if (typeof outputPath !== 'string' || outputPath.trim() === '') {
    return { ok: false, error: 'emitSpec: outputPath must be a non-empty string' };
  }

  var resolvedPath = path.resolve(outputPath);

  try {
    var json = JSON.stringify(spec, null, 2);
    fs.writeFileSync(resolvedPath, json, 'utf8');
    return { ok: true, outputPath: resolvedPath };
  } catch (err) {
    return { ok: false, error: 'emitSpec: failed to write file: ' + (err.message || String(err)) };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { emitSpec };
