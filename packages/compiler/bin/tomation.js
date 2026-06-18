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
var resolveSpecifier = require('../src/resolver').resolveSpecifier;
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
  'Usage: tomation <command> [options]',
  '',
  'Commands:',
  '  compile   Run full pipeline: resolve → parse → pom extract → dedup → flatten → validate → emit spec.json',
  '  check     Run full pipeline through validation only (no file write); exit 0 if valid, exit 1 if invalid',
  '  watch     Run compile, then watch all discovered source files; re-run full pipeline on any change',
  '',
  'Options:',
  '  --verbose  Print detailed step-by-step progress and context data for debugging',
].join('\n');

// ---------------------------------------------------------------------------
// Import-based target rewriting
// ---------------------------------------------------------------------------

/**
 * Rewrite step targets in a parsed file using the import → namespace map.
 * Handles both test steps and task steps.
 *
 * When a step target is "VariableName__property" and VariableName is found
 * in the importMap, it's rewritten to "Namespace__property".
 *
 * @param {object} parsedFile - parsed file with tests/v2Tests/tasks
 * @param {object} importMap - { localName: namespace }
 */
function rewriteStepTargets(parsedFile, importMap) {
  // Rewrite test steps
  if (parsedFile.tests) {
    for (var ti = 0; ti < parsedFile.tests.length; ti++) {
      parsedFile.tests[ti].steps = rewriteSteps(parsedFile.tests[ti].steps, importMap);
    }
  }
  // Rewrite task steps (for POM files that import other POMs)
  if (parsedFile.tasks) {
    for (var tki = 0; tki < parsedFile.tasks.length; tki++) {
      parsedFile.tasks[tki].steps = rewriteSteps(parsedFile.tasks[tki].steps, importMap);
    }
  }
}

/**
 * Rewrite an array of steps, replacing import-based targets with namespace-based targets.
 * @param {Array} steps
 * @param {object} importMap - { localName: namespace }
 * @returns {Array}
 */
function rewriteSteps(steps, importMap) {
  if (!steps) return steps;
  return steps.map(function(step) {
    var rewritten = Object.assign({}, step);

    if (rewritten.target && rewritten.target.indexOf('__') !== -1) {
      var parts = rewritten.target.split('__');
      var varName = parts[0];
      var prop = parts.slice(1).join('__');
      if (importMap[varName]) {
        rewritten.target = importMap[varName] + '__' + prop;
      }
    }

    // Rewrite task invocation names
    if (rewritten.action === 'task' && rewritten.name && rewritten.name.indexOf('__') !== -1) {
      var taskParts = rewritten.name.split('__');
      var taskVar = taskParts[0];
      var taskMethod = taskParts.slice(1).join('__');
      if (importMap[taskVar]) {
        rewritten.name = importMap[taskVar] + '__' + taskMethod;
      }
    }

    // Recurse into if-step then blocks
    if (rewritten.action === 'if' && rewritten.then) {
      rewritten.then = rewriteSteps(rewritten.then, importMap);
    }

    return rewritten;
  });
}

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
 * @param {{ verbose?: boolean }} [options]
 * @returns {{ ok: boolean, spec?: object, files?: string[], error?: string }}
 */
function runPipeline(cwd, options) {
  var verbose = options && options.verbose;

  function log(msg) {
    if (verbose) console.error('[verbose] ' + msg);
  }

  // Step 1: resolve files
  log('Step 1/6: Resolving files from ' + cwd);
  var resolveResult = resolve(cwd);
  if (!resolveResult.ok) {
    return { ok: false, error: resolveResult.error };
  }
  var files = resolveResult.files;
  var pomDir = resolveResult.pomDir || null;
  log('  Resolved ' + files.length + ' file(s): ' + files.map(function(f) { return path.basename(f); }).join(', '));

  // Use meta from config if available, otherwise fall back to defaults
  var meta = resolveResult.meta || DEFAULT_META;
  log('  Meta: ' + JSON.stringify(meta));

  // Step 2: read, strip types (if .ts/.tsx), and parse each file
  log('Step 2/6: Reading, stripping types, and parsing files');
  var parsedFiles = [];
  var allWarnings = [];
  for (var i = 0; i < files.length; i++) {
    var filePath = files[i];
    var isTypeScript = filePath.endsWith('.ts') || filePath.endsWith('.tsx');
    log('  Processing: ' + path.basename(filePath) + (isTypeScript ? ' (TypeScript)' : ' (JavaScript)'));

    var source;
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      return { ok: false, error: 'Failed to read ' + filePath + ': ' + e.message };
    }

    // Strip TypeScript types if needed
    if (isTypeScript) {
      log('    Stripping types...');
      var stripResult = stripTypes(source, filePath);
      if (stripResult.error) {
        log('    ✗ Strip failed: ' + stripResult.error.message + ' (line ' + stripResult.error.line + ')');
        return {
          ok: false,
          error: 'TypeScript error in ' + filePath + ':' + stripResult.error.line + ': ' + stripResult.error.message
        };
      }
      source = stripResult.code;
      log('    ✓ Types stripped (' + source.split('\n').length + ' lines)');
    }

    // Parse the (now plain JS) source
    log('    Parsing...');
    var parsed = parseSource(source, filePath);
    if (parsed.error) {
      log('    ✗ Parse failed: ' + parsed.error.message);
      return { ok: false, error: parsed.error.message };
    }
    if (parsed.warnings && parsed.warnings.length > 0) {
      allWarnings.push.apply(allWarnings, parsed.warnings);
      log('    ⚠ ' + parsed.warnings.length + ' warning(s)');
      log('Warnings: ')
      log(JSON.stringify(parsed.warnings, 2, 4))
    }
    var elementCount = (parsed.elements || []).length;
    var taskCount = (parsed.tasks || []).length;
    var testCount = (parsed.v2Tests || parsed.tests || []).length;
    log('    ✓ Parsed: type=' + parsed.type + ', elements=' + elementCount + ', tasks=' + taskCount + ', tests=' + testCount);
    parsedFiles.push(parsed);
  }

  // Step 3: separate POM files and test files; extract POM results
  log('Step 3/6: Extracting POM data and separating test files');
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
        log('  Extracting POM v2: ' + path.basename(pf.filePath));
        pomResult = extractPomV2(pf, { pomDir: pomDir });
      } else {
        log('  Extracting POM v1: ' + path.basename(pf.filePath));
        pomResult = extractPom(pf);
      }
      if (pomResult.errors && pomResult.errors.length > 0) {
        log('  ✗ POM extraction error: ' + pomResult.errors[0].message);
        return { ok: false, error: pomResult.errors[0].message };
      }
      var elemKeys = Object.keys(pomResult.pageElements || {});
      var taskKeys = Object.keys(pomResult.tasks || {});
      log('    ✓ Elements: [' + elemKeys.join(', ') + '], Tasks: [' + taskKeys.join(', ') + ']');
      pomResults.push(pomResult);
    } else {
      // Normalize v2Tests into the tests array for the flattener
      if (pf.v2Tests && pf.v2Tests.length > 0) {
        if (!pf.tests) pf.tests = [];
        pf.tests.push.apply(pf.tests, pf.v2Tests);
      }
      log('  Test file: ' + path.basename(pf.filePath) + ' (' + (pf.tests || []).length + ' test(s))');
      parsedTestFiles.push(pf);
    }
  }

  // Step 3b: detect namespace collisions across v2 POM files
  var collisionErrors = detectNamespaceCollisions(pomResults);
  if (collisionErrors.length > 0) {
    log('  ✗ Namespace collision: ' + collisionErrors[0].message);
    return { ok: false, error: collisionErrors[0].message };
  }

  // Step 3c: resolve cross-file element references in test steps using import paths
  // Build a map of absoluteFilePath → namespace from POM results
  log('  Resolving cross-file element references via imports');
  var fileToNamespace = {};
  for (var pi = 0; pi < pomResults.length; pi++) {
    if (pomResults[pi].namespace && pomResults[pi].filePath) {
      fileToNamespace[pomResults[pi].filePath] = pomResults[pi].namespace;
    }
  }

  // Resolve baseUrl for ~/ alias resolution
  var baseUrl = resolveResult.baseUrl || cwd;

  // For each test file (and POM file with imports), resolve import variable → namespace
  for (var ri = 0; ri < parsedFiles.length; ri++) {
    var rpf = parsedFiles[ri];
    if (!rpf.imports || rpf.imports.length === 0) continue;

    // Build import variable → namespace map for this file
    var importMap = {};
    for (var ii = 0; ii < rpf.imports.length; ii++) {
      var imp = rpf.imports[ii];
      // Resolve the import path to an absolute file path
      var resolvedPath = resolveSpecifier(imp.importPath, rpf.filePath, baseUrl);
      if (resolvedPath && fileToNamespace[resolvedPath]) {
        importMap[imp.localName] = fileToNamespace[resolvedPath];
        log('    ' + imp.localName + ' → ' + fileToNamespace[resolvedPath] + ' (from ' + imp.importPath + ')');
      }
    }

    // Rewrite step targets: "VariableName__prop" → "Namespace__prop"
    if (Object.keys(importMap).length > 0) {
      rewriteStepTargets(rpf, importMap);
    }
  }

  // Step 4: deduplication
  log('Step 4/6: Deduplicating keys');
  var dedupResult = deduplicateKeys(pomResults);
  if (!dedupResult.ok) {
    log('  ✗ Dedup error: ' + dedupResult.error);
    return { ok: false, error: dedupResult.error };
  }
  log('  ✓ No duplicate keys');

  // Step 5: flatten
  log('Step 5/6: Flattening spec');
  var spec = flattenSpec(pomResults, parsedTestFiles, meta);
  var specElemCount = Object.keys(spec.pageElements || {}).length;
  var specTaskCount = Object.keys(spec.tasks || {}).length;
  var specTestCount = (spec.tests || []).length;
  log('  ✓ Flattened: ' + specElemCount + ' elements, ' + specTaskCount + ' tasks, ' + specTestCount + ' tests');

  // Step 6: validate
  log('Step 6/6: Validating spec');
  var validationResult = validateSpec(spec);
  if (!validationResult.ok) {
    log('  ✗ Validation error: ' + validationResult.error);
    log('Spec: ')
    log(JSON.stringify(spec, 2, 4))
    return { ok: false, error: validationResult.error };
  }
  log('  ✓ Spec is valid');

  // Print warnings to stderr (non-fatal)
  for (var w = 0; w < allWarnings.length; w++) {
    console.warn('⚠ ' + allWarnings[w].message);
  }

  return { ok: true, spec: validationResult.spec, files: files };
}

// ---------------------------------------------------------------------------
// compile command
// ---------------------------------------------------------------------------

function runCompile(cwd, options) {
  var result = runPipeline(cwd, options);
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

function runCheck(cwd, options) {
  var result = runPipeline(cwd, options);
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

function runWatch(cwd, options) {
  // Initial compile
  var result = runPipeline(cwd, options);
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

      var pipelineResult = runPipeline(cwd, options);
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
var verbose = process.argv.includes('--verbose');
var options = { verbose: verbose };

if (!subcommand || subcommand === '--verbose') {
  console.error('Error: no command provided.\n');
  console.error(USAGE);
  process.exit(1);
}

switch (subcommand) {
  case 'compile':
    runCompile(cwd, options);
    break;
  case 'check':
    runCheck(cwd, options);
    break;
  case 'watch':
    runWatch(cwd, options);
    break;
  default:
    console.error('Error: unrecognized command "' + subcommand + '".\n');
    console.error(USAGE);
    process.exit(1);
}
