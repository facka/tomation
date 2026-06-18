#!/usr/bin/env node
'use strict';

/**
 * tomation.js — CLI entry point for @tomation/compiler
 *
 * Usage: tomation <command>
 *
 * Commands:
 *   compile   Run full pipeline and emit spec.json
 *   check     Run pipeline through validation only; exit 0 if valid, exit 1 if invalid
 *   watch     Run compile, then watch all discovered source files; re-run on any change
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

var fs = require('fs');
var path = require('path');

var resolve = require('../src/resolver').resolve;
var parseSource = require('../src/parser').parseSource;
var extractPom = require('../src/pom').extractPom;
var extractPomV2 = require('../src/pom').extractPomV2;
var detectNamespaceCollisions = require('../src/pom').detectNamespaceCollisions;
var stripTypes = require('../src/ts-stripper').stripTypes;
var deduplicateKeys = require('../src/deduplicator').deduplicateKeys;
var flattenSpec = require('../src/flattener').flattenSpec;
var validateSpec = require('../src/validator').validateSpec;
var emitSpec = require('../src/emitter').emitSpec;

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

var USAGE = [
  'Usage: tomation <command>',
  '',
  'Commands:',
  '  compile   Run full pipeline: resolve → parse → pom extract → dedup → flatten → validate → emit spec.json',
  '  check     Run full pipeline through validation only (no file write); exit 0 if valid, exit 1 if invalid',
  '  watch     Run compile, then watch all discovered source files; re-run full pipeline on any change',
].join('\n');

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

var DEFAULT_META = { name: 'Untitled', url: '', description: '' };

/**
 * Run the full compile pipeline up to (and including) validation.
 * Returns { ok: true, spec, files } on success or { ok: false, error } on failure.
 *
 * v2 pipeline: resolve → stripTypes → parseSource → extractPomV2 → flatten → deduplicate → emit
 * Handles mixed .ts and .js files. TypeScript files are type-stripped before parsing.
 *
 * @param {string} cwd
 * @returns {{ ok: boolean, spec?: object, files?: string[], error?: string }}
 */
function runPipeline(cwd) {
  // Step 1: resolve files
  var resolveResult = resolve(cwd);
  if (!resolveResult.ok) {
    return { ok: false, error: resolveResult.error };
  }
  var files = resolveResult.files;

  // Use meta from config if available, otherwise fall back to defaults
  var meta = resolveResult.meta || DEFAULT_META;

  // Step 2: read, strip types (if .ts/.tsx), and parse each file
  var parsedFiles = [];
  var allWarnings = [];
  for (var i = 0; i < files.length; i++) {
    var filePath = files[i];
    var isTypeScript = filePath.endsWith('.ts') || filePath.endsWith('.tsx');

    var source;
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      return { ok: false, error: 'Failed to read ' + filePath + ': ' + e.message };
    }

    // Strip TypeScript types if needed
    if (isTypeScript) {
      var stripResult = stripTypes(source, filePath);
      if (stripResult.error) {
        return {
          ok: false,
          error: 'TypeScript error in ' + filePath + ':' + stripResult.error.line + ': ' + stripResult.error.message
        };
      }
      source = stripResult.code;
    }

    // Parse the (now plain JS) source
    var parsed = parseSource(source, filePath);
    if (parsed.error) {
      return { ok: false, error: parsed.error.message };
    }
    if (parsed.warnings && parsed.warnings.length > 0) {
      allWarnings.push.apply(allWarnings, parsed.warnings);
    }
    parsedFiles.push(parsed);
  }

  // Step 3: separate POM files and test files; extract POM results
  var pomResults = [];
  var parsedTestFiles = [];
  for (var j = 0; j < parsedFiles.length; j++) {
    var pf = parsedFiles[j];
    if (pf.type === 'pom') {
      // Use v2 extractor if the file has v2 patterns (elements or tasks),
      // otherwise fall back to v1 extractor for Page() syntax
      var hasV2Patterns = (pf.elements && pf.elements.length > 0) || (pf.tasks && pf.tasks.length > 0);
      var pomResult;
      if (hasV2Patterns) {
        pomResult = extractPomV2(pf);
      } else {
        pomResult = extractPom(pf);
      }
      if (pomResult.errors && pomResult.errors.length > 0) {
        return { ok: false, error: pomResult.errors[0].message };
      }
      pomResults.push(pomResult);
    } else {
      // Normalize v2Tests into the tests array for the flattener
      if (pf.v2Tests && pf.v2Tests.length > 0) {
        if (!pf.tests) pf.tests = [];
        pf.tests.push.apply(pf.tests, pf.v2Tests);
      }
      parsedTestFiles.push(pf);
    }
  }

  // Step 3b: detect namespace collisions across v2 POM files
  var collisionErrors = detectNamespaceCollisions(pomResults);
  if (collisionErrors.length > 0) {
    return { ok: false, error: collisionErrors[0].message };
  }

  // Step 4: deduplication
  var dedupResult = deduplicateKeys(pomResults);
  if (!dedupResult.ok) {
    return { ok: false, error: dedupResult.error };
  }

  // Step 5: flatten
  var spec = flattenSpec(pomResults, parsedTestFiles, meta);

  // Step 6: validate
  var validationResult = validateSpec(spec);
  if (!validationResult.ok) {
    return { ok: false, error: validationResult.error };
  }

  // Print warnings to stderr (non-fatal)
  for (var w = 0; w < allWarnings.length; w++) {
    console.warn('⚠ ' + allWarnings[w].message);
  }

  return { ok: true, spec: validationResult.spec, files: files };
}

// ---------------------------------------------------------------------------
// compile command
// ---------------------------------------------------------------------------

function runCompile(cwd) {
  var result = runPipeline(cwd);
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }

  var outputPath = path.join(cwd, 'spec.json');
  var emitResult = emitSpec(result.spec, outputPath);
  if (!emitResult.ok) {
    console.error(emitResult.error);
    process.exit(1);
  }

  console.log('✓ spec.json written to ' + emitResult.outputPath);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// check command
// ---------------------------------------------------------------------------

function runCheck(cwd) {
  var result = runPipeline(cwd);
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }

  console.log('✓ spec is valid');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// watch command
// ---------------------------------------------------------------------------

function runWatch(cwd) {
  // Initial compile
  var result = runPipeline(cwd);
  if (!result.ok) {
    console.error(result.error);
    // Don't exit — keep watching so the user can fix the error
    console.log('[watch] Initial build failed. Watching for changes...');
    watchFiles(cwd, []);
    return;
  }

  var outputPath = path.join(cwd, 'spec.json');
  var emitResult = emitSpec(result.spec, outputPath);
  if (!emitResult.ok) {
    console.error(emitResult.error);
    console.log('[watch] Initial build failed. Watching for changes...');
    watchFiles(cwd, result.files);
    return;
  }

  console.log('✓ spec.json written to ' + emitResult.outputPath);
  console.log('[watch] Watching ' + result.files.length + ' files...');
  watchFiles(cwd, result.files);
}

/**
 * Start fs.watch on each file in the list.
 * On any change, debounce and re-run the full pipeline.
 *
 * @param {string} cwd
 * @param {string[]} files
 */
function watchFiles(cwd, files) {
  var debounceTimer = null;
  var watchers = [];

  function rebuild(changedFile) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      var shortName = path.basename(changedFile);
      console.log('\n[watch] Change detected in ' + shortName + ', rebuilding...');
      console.log('[watch] ' + new Date().toISOString());

      // Close existing watchers before re-resolving (file list may have changed)
      for (var k = 0; k < watchers.length; k++) {
        try { watchers[k].close(); } catch (e) { /* ignore */ }
      }
      watchers = [];

      var pipelineResult = runPipeline(cwd);
      if (!pipelineResult.ok) {
        console.error('[watch] Rebuild failed: ' + pipelineResult.error);
        // Re-watch the same files (or new ones if resolve succeeded partially)
        startWatchers(pipelineResult.files || files);
        return;
      }

      var outputPath = path.join(cwd, 'spec.json');
      var emitResult = emitSpec(pipelineResult.spec, outputPath);
      if (!emitResult.ok) {
        console.error('[watch] Rebuild failed: ' + emitResult.error);
        startWatchers(pipelineResult.files);
        return;
      }

      console.log('[watch] Rebuild complete → ' + emitResult.outputPath);
      startWatchers(pipelineResult.files);
    }, 100);
  }

  function startWatchers(fileList) {
    if (!fileList || fileList.length === 0) return;
    for (var wi = 0; wi < fileList.length; wi++) {
      (function (filePath) {
        try {
          var watcher = fs.watch(filePath, function (eventType) {
            rebuild(filePath);
          });
          watcher.on('error', function (err) {
            console.warn('[watch] Warning: could not watch ' + filePath + ': ' + err.message);
          });
          watchers.push(watcher);
        } catch (e) {
          console.warn('[watch] Warning: could not watch ' + filePath + ': ' + e.message);
        }
      })(fileList[wi]);
    }
  }

  startWatchers(files);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

var subcommand = process.argv[2];
var cwd = process.cwd();

if (!subcommand) {
  console.error('Error: no command provided.\n');
  console.error(USAGE);
  process.exit(1);
}

switch (subcommand) {
  case 'compile':
    runCompile(cwd);
    break;
  case 'check':
    runCheck(cwd);
    break;
  case 'watch':
    runWatch(cwd);
    break;
  default:
    console.error('Error: unrecognized command "' + subcommand + '".\n');
    console.error(USAGE);
    process.exit(1);
}
