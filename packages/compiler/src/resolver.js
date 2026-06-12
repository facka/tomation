'use strict';

/**
 * resolver.js — reads tomation.config.js, discovers POM/test files,
 * builds an import dependency graph, topologically sorts via Kahn's algorithm,
 * and detects cycles.
 *
 * Exported API:
 *   resolve(cwd) → { ok: true, files: string[] } | { ok: false, error: string }
 *
 * Requirements: 12.4, 13.4, 13.5
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively collect all files with the given extension under dir.
 * @param {string} dir - absolute directory path
 * @param {string} ext - e.g. ".pom.js"
 * @returns {string[]} absolute file paths
 */
function discoverFiles(dir, ext) {
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
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
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
 *   import ... from "./foo"
 *   require('./foo')
 *   require("./foo")
 *
 * Returns only relative imports (starting with . or ..) since those are the
 * ones that create intra-project dependencies.
 *
 * @param {string} source - file contents
 * @returns {string[]} array of raw module specifiers (relative paths as written)
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

  // Keep only relative imports
  return specifiers.filter(s => s.startsWith('.'));
}

/**
 * Resolve a relative import specifier to an absolute path.
 * Tries the specifier as-is, then with common JS extensions appended.
 *
 * @param {string} specifier - relative import path (e.g. './login.pom')
 * @param {string} fromFile  - absolute path of the importing file
 * @returns {string|null} absolute resolved path, or null if not found
 */
function resolveSpecifier(specifier, fromFile) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    base + '.js',
    base + '.pom.js',
    base + '.test.js',
    path.join(base, 'index.js')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
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
 * @returns {Map<string, object>} filePath → node
 */
function buildGraph(pomFiles, testFiles) {
  const graph = new Map();

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
      const resolved = resolveSpecifier(spec, filePath);
      if (resolved !== null) {
        resolvedImports.push(resolved);
      }
    }

    graph.set(filePath, {
      filePath,
      type,
      imports: resolvedImports,
      exports: [] // populated only when needed by parser stage
    });
  }

  return graph;
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
 * Reads tomation.config.js from cwd, discovers all .pom.js and .test.js files,
 * builds a dependency graph, topologically sorts them, and returns an ordered
 * list of file paths ready for sequential processing.
 *
 * @param {string} cwd - working directory (absolute path)
 * @returns {{ ok: true, files: string[] } | { ok: false, error: string }}
 */
function resolve(cwd) {
  // Requirement 12.4 — read tomation.config.js; fail if not found
  const configPath = path.join(cwd, 'tomation.config.js');
  if (!fs.existsSync(configPath)) {
    return {
      ok: false,
      error: 'tomation.config.js not found in current directory'
    };
  }

  let config;
  try {
    config = require(configPath);
  } catch (e) {
    return {
      ok: false,
      error: 'Failed to load tomation.config.js: ' + e.message
    };
  }

  const pomDir = config.pom
    ? path.resolve(cwd, config.pom)
    : path.join(cwd, 'pom');

  const testsDir = config.tests
    ? path.resolve(cwd, config.tests)
    : path.join(cwd, 'tests');

  // Requirement 12.4 — discover all .pom.js and .test.js files
  const pomFiles = discoverFiles(pomDir, '.pom.js');
  const testFiles = discoverFiles(testsDir, '.test.js');

  // Build dependency graph
  const graph = buildGraph(pomFiles, testFiles);

  // Requirement 13.4 — topological sort; Requirement 13.5 — cycle detection
  const sortResult = topologicalSort(graph);
  if (!sortResult.ok) {
    return { ok: false, error: sortResult.error };
  }

  return { ok: true, files: sortResult.sorted };
}

module.exports = { resolve, discoverFiles, parseImports, buildGraph, topologicalSort };
