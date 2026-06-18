'use strict';

/**
 * resolver.js — reads tomation.config.js/.ts, discovers POM/test files,
 * builds an import dependency graph, topologically sorts via Kahn's algorithm,
 * and detects cycles.
 *
 * Exported API:
 *   resolve(cwd) → { ok: true, files: string[] } | { ok: false, error: string }
 *
 * Requirements: 1.2, 9.1, 9.2, 9.3, 12.4, 13.4, 13.5
 */

const fs = require('fs');
const path = require('path');
const { stripTypes } = require('./ts-stripper.js');

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * File extensions for POM file discovery (matched in order).
 * Includes both JS and TS variants.
 */
const POM_EXTENSIONS = ['.pom.js', '.pom.ts'];

/**
 * File extensions for test file discovery (matched in order).
 * Includes both JS and TS variants.
 */
const TEST_EXTENSIONS = ['.test.js', '.test.ts'];

/**
 * All source file extensions recognized for discovery.
 */
const ALL_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.pom.ts', '.test.ts', '.js', '.pom.js', '.test.js'];

/**
 * Extensions to try when resolving an import specifier (in priority order).
 */
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.pom.ts', '.test.ts', '.pom.js', '.test.js'];

/**
 * Index file names to try when resolving a directory import.
 */
const INDEX_FILES = ['index.ts', 'index.js'];

/**
 * Recursively collect all files with the given extension under dir.
 * @param {string} dir - absolute directory path
 * @param {string} ext - e.g. ".pom.js" or an array of extensions
 * @returns {string[]} absolute file paths
 */
function discoverFiles(dir, ext) {
  const extensions = Array.isArray(ext) ? ext : [ext];
  const results = [];
  if (!fs.existsSync(dir)) {
    return results;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = discoverFiles(full, ext);
      for (const f of nested) results.push(f);
    } else if (entry.isFile() && extensions.some(e => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Import parsing
// ---------------------------------------------------------------------------

/**
 * Parse import/require statements from file source to get imported module paths.
 * Handles:
 *   import ... from './foo'
 *   import ... from "~/foo"
 *   require('./foo')
 *   require("~/foo")
 *
 * Returns relative imports (starting with . or ..) and alias imports (starting
 * with ~/) since those are the ones that create intra-project dependencies.
 *
 * @param {string} source - file contents
 * @returns {string[]} array of raw module specifiers
 */
function parseImports(source) {
  const specifiers = [];

  // ES module: import ... from '...' or import '...'
  const esImportRe = /^\s*import\b[^'"]*['"]([^'"]+)['"]/gm;
  let m;
  while ((m = esImportRe.exec(source)) !== null) {
    specifiers.push(m[1]);
  }

  // CommonJS: require('...') or require("...")
  const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = requireRe.exec(source)) !== null) {
    specifiers.push(m[1]);
  }

  // Keep relative imports and ~/ alias imports
  return specifiers.filter(s => s.startsWith('.') || s.startsWith('~/'));
}

/**
 * Resolve an import specifier with extended extension support.
 * Tries the specifier as-is, then with TypeScript and JS extensions appended,
 * and finally as a directory with index files.
 *
 * @param {string} base - absolute path to resolve against (specifier already resolved to absolute)
 * @returns {string|null} absolute resolved path, or null if not found
 */
function resolveWithExtensions(base) {
  // Try the path as-is first (e.g., already has extension)
  if (fs.existsSync(base) && fs.statSync(base).isFile()) {
    return base;
  }

  // Try appending each extension
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Try as a directory with index files
  for (const idx of INDEX_FILES) {
    const candidate = path.join(base, idx);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Resolve a ~/alias import specifier to an absolute path.
 * The ~/ prefix is replaced with the baseUrl directory.
 *
 * @param {string} specifier - import path starting with ~/
 * @param {string} baseUrl - absolute path of the base directory for alias resolution
 * @returns {{ resolved: string } | { error: string }} resolved absolute path or error
 */
function resolveAlias(specifier, baseUrl) {
  // Strip the ~/ prefix and resolve relative to baseUrl
  const relativePath = specifier.slice(2); // remove '~/'
  const base = path.resolve(baseUrl, relativePath);
  const resolved = resolveWithExtensions(base);

  if (resolved) {
    return { resolved };
  }

  return {
    error: `Cannot resolve alias import '${specifier}' from base '${baseUrl}'`
  };
}

/**
 * Resolve a relative import specifier to an absolute path.
 * Tries the specifier as-is, then with common extensions appended.
 *
 * @param {string} specifier - relative import path (e.g. './login.pom') or ~/ alias
 * @param {string} fromFile  - absolute path of the importing file
 * @param {string} [baseUrl] - absolute path for ~/ alias resolution
 * @returns {string|null} absolute resolved path, or null if not found
 */
function resolveSpecifier(specifier, fromFile, baseUrl) {
  if (specifier.startsWith('~/')) {
    if (!baseUrl) return null;
    const result = resolveAlias(specifier, baseUrl);
    return result.resolved || null;
  }

  const base = path.resolve(path.dirname(fromFile), specifier);
  return resolveWithExtensions(base);
}

// ---------------------------------------------------------------------------
// Dependency graph building
// ---------------------------------------------------------------------------

/**
 * Build a dependency graph for the given set of files.
 *
 * Each node:
 *   { filePath: string, type: "pom"|"test", imports: string[], exports: string[] }
 *
 * @param {string[]} pomFiles
 * @param {string[]} testFiles
 * @param {string} [baseUrl] - absolute path for ~/ alias resolution
 * @returns {{ graph: Map<string, object>, errors: string[] }} filePath → node, plus any alias resolution errors
 */
function buildGraph(pomFiles, testFiles, baseUrl) {
  const graph = new Map();
  const errors = [];

  const allFiles = [
    ...pomFiles.map(f => ({ filePath: f, type: 'pom' })),
    ...testFiles.map(f => ({ filePath: f, type: 'test' }))
  ];

  for (const { filePath, type } of allFiles) {
    let source = '';
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      // If the file can't be read, treat it as having no imports
    }

    const rawImports = parseImports(source);
    const resolvedImports = [];
    for (const spec of rawImports) {
      if (spec.startsWith('~/')) {
        if (!baseUrl) {
          errors.push(`Cannot resolve '${spec}' in '${filePath}': no baseUrl configured`);
          continue;
        }
        const result = resolveAlias(spec, baseUrl);
        if (result.error) {
          errors.push(`Cannot resolve '${spec}' in '${filePath}': ${result.error}`);
          continue;
        }
        resolvedImports.push(result.resolved);
      } else {
        const resolved = resolveSpecifier(spec, filePath, baseUrl);
        if (resolved !== null) {
          resolvedImports.push(resolved);
        }
      }
    }

    graph.set(filePath, {
      filePath,
      type,
      imports: resolvedImports,
      exports: [] // populated only when needed by parser stage
    });
  }

  return { graph, errors };
}

// ---------------------------------------------------------------------------
// Kahn's topological sort with cycle detection
// ---------------------------------------------------------------------------

/**
 * Perform a topological sort of the dependency graph using Kahn's algorithm.
 * Dependencies come before dependents in the output.
 *
 * Returns:
 *   { ok: true, sorted: string[] }        — success, ordered file paths
 *   { ok: false, error: string }           — cycle detected, with cycle path
 *
 * @param {Map<string, object>} graph
 * @returns {{ ok: boolean, sorted?: string[], error?: string }}
 */
function topologicalSort(graph) {
  // Build in-degree map and adjacency list
  // Edge direction: A → B means A depends on B (B must come before A)
  // So for the sort we need B to precede A → we build edges B → A (reverse)
  // and track in-degrees on that reversed graph.
  //
  // In-degree of a node = number of its dependencies still not processed.
  // A node with in-degree 0 has all dependencies already placed → ready.

  const inDegree = new Map(); // filePath → number of unresolved dependencies
  const dependents = new Map(); // filePath → [files that depend on this file]

  for (const [filePath] of graph) {
    if (!inDegree.has(filePath)) inDegree.set(filePath, 0);
    if (!dependents.has(filePath)) dependents.set(filePath, []);
  }

  for (const [filePath, node] of graph) {
    for (const dep of node.imports) {
      // dep must come before filePath
      // Only consider edges to nodes in our tracked set
      if (!graph.has(dep)) continue;

      // filePath depends on dep → dep's removal unblocks filePath
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep).push(filePath);
      inDegree.set(filePath, (inDegree.get(filePath) || 0) + 1);
    }
  }

  // Queue of nodes with no remaining dependencies
  const queue = [];
  for (const [filePath, deg] of inDegree) {
    if (deg === 0) queue.push(filePath);
  }

  const sorted = [];
  while (queue.length > 0) {
    // Sort for deterministic output (stable by file path)
    queue.sort();
    const current = queue.shift();
    sorted.push(current);

    for (const dependent of (dependents.get(current) || [])) {
      const newDeg = inDegree.get(dependent) - 1;
      inDegree.set(dependent, newDeg);
      if (newDeg === 0) {
        queue.push(dependent);
      }
    }
  }

  if (sorted.length !== graph.size) {
    // There is a cycle — find and report it
    const cycleError = findCycleError(graph, inDegree);
    return { ok: false, error: cycleError };
  }

  return { ok: true, sorted };
}

/**
 * Find a cycle in the graph among nodes that still have non-zero in-degree
 * (i.e., nodes remaining after Kahn's algorithm stalls).
 * Returns a human-readable error string: "Circular import detected: A → B → C → A"
 *
 * @param {Map<string, object>} graph
 * @param {Map<string, number>} inDegree
 * @returns {string}
 */
function findCycleError(graph, inDegree) {
  // Collect nodes still in the cycle residue
  const inCycle = new Set();
  for (const [filePath, deg] of inDegree) {
    if (deg > 0) inCycle.add(filePath);
  }

  // DFS to find an actual cycle path among inCycle nodes
  const visited = new Set();
  const stack = [];
  const stackSet = new Set();

  function dfs(node) {
    if (stackSet.has(node)) {
      // Found the cycle — extract it
      const cycleStart = node;
      const cycleIdx = stack.indexOf(cycleStart);
      const cyclePath = stack.slice(cycleIdx);
      cyclePath.push(cycleStart); // close the loop
      return cyclePath;
    }
    if (visited.has(node)) return null;

    visited.add(node);
    stack.push(node);
    stackSet.add(node);

    const nodeData = graph.get(node);
    if (nodeData) {
      for (const dep of nodeData.imports) {
        if (!inCycle.has(dep)) continue;
        const result = dfs(dep);
        if (result !== null) return result;
      }
    }

    stack.pop();
    stackSet.delete(node);
    return null;
  }

  for (const node of inCycle) {
    if (!visited.has(node)) {
      const cycle = dfs(node);
      if (cycle !== null) {
        const pathStr = cycle.join(' → ');
        return 'Circular import detected: ' + pathStr;
      }
    }
  }

  // Fallback (should not happen)
  return 'Circular import detected in dependency graph';
}

// ---------------------------------------------------------------------------
// Main resolve function
// ---------------------------------------------------------------------------

/**
 * resolve(cwd)
 *
 * Reads tomation.config.js or tomation.config.ts from cwd, discovers all
 * POM and test files (.ts/.tsx/.js), builds a dependency graph, topologically
 * sorts them, and returns an ordered list of file paths ready for sequential processing.
 *
 * @param {string} cwd - working directory (absolute path)
 * @returns {{ ok: true, files: string[] } | { ok: false, error: string }}
 */
function resolve(cwd) {
  // Try tomation.config.ts first, then tomation.config.js
  const configPathTs = path.join(cwd, 'tomation.config.ts');
  const configPathJs = path.join(cwd, 'tomation.config.js');

  let configPath = null;
  if (fs.existsSync(configPathTs)) {
    configPath = configPathTs;
  } else if (fs.existsSync(configPathJs)) {
    configPath = configPathJs;
  }

  if (!configPath) {
    return {
      ok: false,
      error: 'tomation.config.js not found in current directory'
    };
  }

  let config;
  try {
    if (configPath.endsWith('.ts')) {
      // Strip types from .ts config before evaluating
      const source = fs.readFileSync(configPath, 'utf8');
      const stripResult = stripTypes(source, configPath);
      if (stripResult.error) {
        return {
          ok: false,
          error: `Failed to parse tomation.config.ts: ${stripResult.error.message} (line ${stripResult.error.line})`
        };
      }
      // Evaluate the stripped JS — handle ES module default export
      let code = stripResult.code;
      // Convert `export default { ... }` to module.exports for eval
      code = code.replace(/export\s+default\s+/, 'module.exports = ');
      const Module = require('module');
      const m = new Module(configPath);
      m.filename = configPath;
      m.paths = Module._nodeModulePaths(path.dirname(configPath));
      m._compile(code, configPath);
      config = m.exports;
    } else {
      config = require(configPath);
    }
  } catch (e) {
    return {
      ok: false,
      error: `Failed to load ${path.basename(configPath)}: ${e.message}`
    };
  }

  const pomDir = config.pom
    ? path.resolve(cwd, config.pom)
    : path.join(cwd, 'pom');

  const testsDir = config.tests
    ? path.resolve(cwd, config.tests)
    : path.join(cwd, 'tests');

  // Resolve baseUrl for ~/ alias resolution (defaults to config file directory)
  const baseUrl = config.baseUrl
    ? path.resolve(cwd, config.baseUrl)
    : cwd;

  // Discover all POM and test files (.ts, .tsx, .js variants)
  const pomFiles = discoverFiles(pomDir, POM_EXTENSIONS);
  const testFiles = discoverFiles(testsDir, TEST_EXTENSIONS);

  // Build dependency graph (with ~/ alias resolution)
  const { graph, errors } = buildGraph(pomFiles, testFiles, baseUrl);

  // Report unresolvable ~/ imports as errors
  if (errors.length > 0) {
    return { ok: false, error: errors[0] };
  }

  // Topological sort; cycle detection
  const sortResult = topologicalSort(graph);
  if (!sortResult.ok) {
    return { ok: false, error: sortResult.error };
  }

  // Extract meta from config (supports both meta.urls array and legacy meta.url string)
  let meta = undefined;
  if (config.meta && typeof config.meta === 'object') {
    meta = {};
    if (typeof config.meta.name === 'string') meta.name = config.meta.name;
    if (typeof config.meta.description === 'string') meta.description = config.meta.description;

    // Support meta.urls as array of URL strings (v2 config format)
    if (Array.isArray(config.meta.urls)) {
      meta.urls = config.meta.urls.filter(u => typeof u === 'string');
    }

    // Support legacy meta.url as a single string — normalize to urls array
    if (typeof config.meta.url === 'string' && !meta.urls) {
      meta.urls = [config.meta.url];
    }

    // Also keep meta.url for backward compatibility (first URL in the array)
    if (meta.urls && meta.urls.length > 0) {
      meta.url = meta.urls[0];
    }
  }

  return { ok: true, files: sortResult.sorted, meta: meta };
}

module.exports = { resolve, discoverFiles, parseImports, buildGraph, topologicalSort, resolveSpecifier, resolveAlias, resolveWithExtensions };
