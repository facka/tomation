'use strict';

/**
 * Property-based tests for resolver.js — topological sort and cycle detection.
 *
 * Feature: tomation, Property 6 (partial)
 * Validates: Requirements 12.4, 13.4, 13.5
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const { topologicalSort } = require('./resolver.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a graph Map from a plain adjacency list object.
 * nodes: string[]  — all node labels (used as "file paths")
 * edges: [string, string][] — each [from, dep] means `from` imports `dep`
 *                             (i.e. `dep` must come before `from`)
 */
function buildTestGraph(nodes, edges) {
  const graph = new Map();
  for (const node of nodes) {
    graph.set(node, { filePath: node, type: 'pom', imports: [], exports: [] });
  }
  for (const [from, dep] of edges) {
    graph.get(from).imports.push(dep);
  }
  return graph;
}

/**
 * Check that `order` is a valid topological ordering for the given edges.
 * For every edge [from, dep]: dep must appear before from.
 */
function isValidTopoOrder(order, edges) {
  const idx = new Map();
  for (let i = 0; i < order.length; i++) idx.set(order[i], i);
  for (const [from, dep] of edges) {
    const fromIdx = idx.get(from);
    const depIdx = idx.get(dep);
    if (fromIdx === undefined || depIdx === undefined) return false;
    // dep (the dependency) must appear at a LOWER index than from
    if (depIdx >= fromIdx) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generate a random DAG (no cycles) with N nodes and a random subset of edges
 * that are topologically valid (edges only go from higher-index to lower-index
 * nodes in the fixed labeling, guaranteeing acyclicity).
 *
 * Returns { nodes, edges } where:
 *   nodes: string[]               — e.g. ["/n0", "/n1", ...]
 *   edges: [string, string][]     — [from, dep] pairs (from imports dep)
 */
const dagArb = fc.integer({ min: 1, max: 10 }).chain(n => {
  // Node labels
  const nodes = Array.from({ length: n }, (_, i) => `/n${i}`);

  // Possible forward edges: [from, dep] where from > dep (index-wise), ensuring
  // no cycle. We pick a random subset of them.
  const possibleEdges = [];
  for (let from = 1; from < n; from++) {
    for (let dep = 0; dep < from; dep++) {
      possibleEdges.push([nodes[from], nodes[dep]]);
    }
  }

  if (possibleEdges.length === 0) {
    // Single node, no edges possible
    return fc.constant({ nodes, edges: [] });
  }

  // Generate a random subset of possible edges (bitmask approach via array of booleans)
  return fc.array(fc.boolean(), { minLength: possibleEdges.length, maxLength: possibleEdges.length })
    .map(mask => {
      const edges = possibleEdges.filter((_, i) => mask[i]);
      return { nodes, edges };
    });
});

/**
 * Generate a graph that contains at least one cycle.
 * Strategy: start with 2–8 nodes forming a simple cycle A0→A1→...→A(k-1)→A0,
 * plus optional extra edges (that stay within the cycle set to keep it simple).
 */
const cyclicGraphArb = fc.integer({ min: 2, max: 8 }).chain(n => {
  const nodes = Array.from({ length: n }, (_, i) => `/c${i}`);

  // Build the simple cycle: node[i] imports node[(i+1) % n]
  // i.e. node[i] depends on node[(i+1) % n] → "(i+1)%n must come before i"
  const cycleEdges = nodes.map((node, i) => [node, nodes[(i + 1) % n]]);

  return fc.constant({ nodes, edges: cycleEdges });
});

// ---------------------------------------------------------------------------
// Property 6a: Topological Sort Correctness
// Feature: tomation, Property 6: Topological sort
// Validates: Requirements 13.4
// ---------------------------------------------------------------------------

test('Property 6a: topological sort on DAGs returns a valid topological order', () => {
  // Feature: tomation, Property 6: For any randomly-generated DAG, the topological
  // sort output is a valid topological order (for every edge A→B, A appears before B).

  fc.assert(
    fc.property(dagArb, ({ nodes, edges }) => {
      const graph = buildTestGraph(nodes, edges);
      const result = topologicalSort(graph);

      // Must succeed
      if (result.ok !== true) return false;

      const { sorted } = result;

      // All nodes appear exactly once
      if (sorted.length !== nodes.length) return false;
      const sortedSet = new Set(sorted);
      if (sortedSet.size !== nodes.length) return false;
      for (const n of nodes) {
        if (!sortedSet.has(n)) return false;
      }

      // For every edge [from, dep]: dep (the dependency) must appear before from
      if (!isValidTopoOrder(sorted, edges)) return false;

      return true;
    }),
    { numRuns: 200, seed: 42 }
  );
});

test('Property 6a: topological sort on empty graph succeeds with empty order', () => {
  const graph = new Map();
  const result = topologicalSort(graph);
  assert.equal(result.ok, true);
  assert.deepEqual(result.sorted, []);
});

test('Property 6a: topological sort on single-node graph succeeds', () => {
  const graph = buildTestGraph(['/a'], []);
  const result = topologicalSort(graph);
  assert.equal(result.ok, true);
  assert.deepEqual(result.sorted, ['/a']);
});

test('Property 6a: linear chain A→B→C produces [C, B, A] or equivalent valid order', () => {
  // A imports B (depends on B); B imports C (depends on C)
  // So order must be: C before B before A
  const graph = buildTestGraph(['/a', '/b', '/c'], [
    ['/a', '/b'],
    ['/b', '/c'],
  ]);
  const result = topologicalSort(graph);
  assert.equal(result.ok, true);
  assert.ok(isValidTopoOrder(result.sorted, [['/a', '/b'], ['/b', '/c']]),
    `Expected valid topo order, got: ${result.sorted.join(' → ')}`);
  assert.equal(result.sorted.length, 3);
});

// ---------------------------------------------------------------------------
// Property 6b: Cycle Detection
// Feature: tomation, Property 6: Cycle detection
// Validates: Requirements 13.5
// ---------------------------------------------------------------------------

test('Property 6b: cycle detection reports cycle for generated cyclic graphs', () => {
  // Feature: tomation, Property 6: For generated cyclic graphs, the resolver detects
  // the cycle and reports the correct cycle path.

  fc.assert(
    fc.property(cyclicGraphArb, ({ nodes, edges }) => {
      const graph = buildTestGraph(nodes, edges);
      const result = topologicalSort(graph);

      // Must fail
      if (result.ok !== false) return false;

      // Must have a string error
      if (typeof result.error !== 'string') return false;
      if (result.error.length === 0) return false;

      // Error message must contain "Circular import detected"
      if (!result.error.includes('Circular import detected')) return false;

      // Error message must contain the "→" arrow separator (cycle path format)
      if (!result.error.includes('→')) return false;

      return true;
    }),
    { numRuns: 200, seed: 42 }
  );
});

test('Property 6b: simple two-node cycle A↔B is detected', () => {
  // A imports B AND B imports A
  const graph = buildTestGraph(['/a', '/b'], [
    ['/a', '/b'],
    ['/b', '/a'],
  ]);
  const result = topologicalSort(graph);
  assert.equal(result.ok, false);
  assert.match(result.error, /Circular import detected/);
  assert.match(result.error, /→/);
});

test('Property 6b: three-node cycle A→B→C→A is detected with full path', () => {
  // A imports B, B imports C, C imports A
  const graph = buildTestGraph(['/a', '/b', '/c'], [
    ['/a', '/b'],
    ['/b', '/c'],
    ['/c', '/a'],
  ]);
  const result = topologicalSort(graph);
  assert.equal(result.ok, false);
  assert.match(result.error, /Circular import detected/);
  // The reported path must include at least two nodes connected by arrows
  assert.match(result.error, /→/);
  // Verify the cycle path mentions nodes in the graph
  assert.ok(
    result.error.includes('/a') || result.error.includes('/b') || result.error.includes('/c'),
    `Cycle error should name at least one cycle node: ${result.error}`
  );
});

test('Property 6b: cycle detection in graph with both cyclic and acyclic nodes', () => {
  // /d → /e (no cycle), but /a → /b → /c → /a (cycle)
  const graph = buildTestGraph(['/a', '/b', '/c', '/d', '/e'], [
    ['/a', '/b'],
    ['/b', '/c'],
    ['/c', '/a'],
    ['/d', '/e'],  // acyclic edge
  ]);
  const result = topologicalSort(graph);
  assert.equal(result.ok, false);
  assert.match(result.error, /Circular import detected/);
});

test('Property 6b: self-loop (A imports A) is detected as a cycle', () => {
  const graph = buildTestGraph(['/a'], [['/a', '/a']]);
  const result = topologicalSort(graph);
  assert.equal(result.ok, false);
  assert.match(result.error, /Circular import detected/);
});

test('Property 6b: cycle path reported is a valid cycle in the graph', () => {
  // Feature: tomation, Property 6: The cycle array/string represents a valid cycle
  // (each node in the cycle is actually connected to the next).

  fc.assert(
    fc.property(cyclicGraphArb, ({ nodes, edges }) => {
      const graph = buildTestGraph(nodes, edges);
      const result = topologicalSort(graph);

      if (result.ok !== false) return false;

      // Build a quick adjacency set for validation
      const edgeSet = new Set(edges.map(([from, dep]) => `${from}→${dep}`));

      // Extract the cycle path from the error string
      // Format: "Circular import detected: A → B → C → A"
      const prefix = 'Circular import detected: ';
      const pathStr = result.error.slice(prefix.length);
      const pathNodes = pathStr.split(' → ');

      // Must have at least 2 nodes in the path (cycle closes back)
      if (pathNodes.length < 2) return false;

      // The last node should equal the first (cycle is closed in the reported string)
      if (pathNodes[0] !== pathNodes[pathNodes.length - 1]) return false;

      // Each consecutive pair must be a real edge in the graph
      // pathNodes[i] imports pathNodes[i+1]
      for (let i = 0; i < pathNodes.length - 1; i++) {
        const from = pathNodes[i];
        const dep = pathNodes[i + 1];
        if (!edgeSet.has(`${from}→${dep}`)) return false;
      }

      return true;
    }),
    { numRuns: 200, seed: 42 }
  );
});
