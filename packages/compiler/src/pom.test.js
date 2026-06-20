'use strict';

/**
 * Property-based tests for pom.js — namespacing consistency.
 *
 * Feature: tomation, Property 6: Compiler Namespacing Consistency
 * Validates: Requirements 8.1, 8.4, 4.2, 4.3
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const { extractPom, deriveNamespace } = require('./pom.js');

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Valid identifier-style strings for variable names and keys.
 * Starts with a letter, followed by 0–19 alphanumeric/underscore chars.
 */
const identArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/).filter(s => s.length > 0);

/**
 * A valid `where` object with at least one matcher key.
 */
const whereArb = fc
  .record({
    id: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    textIs: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    classIncludes: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  })
  .filter(w => Object.values(w).some(v => v !== undefined))
  .map(w => {
    const result = {};
    for (const k of Object.keys(w)) {
      if (w[k] !== undefined) result[k] = w[k];
    }
    return result;
  });

/**
 * A valid element definition matching the parser output shape.
 */
const elementDefArb = fc.record({
  variableName: identArb,
  tag: fc.constantFrom('input', 'button', 'div', 'form', 'select', 'span'),
  label: fc.string({ minLength: 1, maxLength: 30 }),
  where: whereArb,
  line: fc.constant(1),
});

/**
 * A valid task definition matching the parser output shape.
 */
const taskDefArb = fc.record({
  name: identArb,
  steps: fc.constant([]),
  params: fc.constant([]),
  line: fc.constant(1),
});

/**
 * Build a fake ParsedFile for extractPom(), given elements and tasks arrays.
 */
function buildParsedFile(elements, tasks, filePath) {
  return {
    filePath: filePath || '/test/fake.pom.ts',
    type: 'pom',
    elements: elements,
    tasks: tasks,
    tests: [],
    error: null,
    warnings: [],
  };
}

/**
 * Arbitrary: up to 5 distinct element definitions.
 */
const elementsArb = fc.uniqueArray(elementDefArb, {
  minLength: 1,
  maxLength: 5,
  selector: e => e.variableName,
});

/**
 * Arbitrary: up to 5 distinct task definitions.
 */
const tasksArb = fc.uniqueArray(taskDefArb, {
  minLength: 1,
  maxLength: 5,
  selector: t => t.name,
});

// ---------------------------------------------------------------------------
// Property 6a — Namespacing Consistency (elements)
// Feature: tomation, Property 6: Compiler Namespacing Consistency
// ---------------------------------------------------------------------------

test('Property 6a: every pageElements output key is exactly Namespace__variableName', () => {
  fc.assert(
    fc.property(elementsArb, (elements) => {
      const parsedFile = buildParsedFile(elements, []);
      const result = extractPom(parsedFile);

      // No errors should be produced
      if (result.errors.length > 0) return false;

      const outputKeys = Object.keys(result.pageElements);

      // There must be as many output keys as input elements
      if (outputKeys.length !== elements.length) return false;

      // Derive the expected namespace
      const namespace = deriveNamespace(parsedFile.filePath);
      const prefix = namespace + '__';

      // Every output key must be exactly `Namespace__variableName`
      for (const elDef of elements) {
        const expected = prefix + elDef.variableName;
        if (!(expected in result.pageElements)) return false;
      }

      // Every output key must start with the namespace prefix
      for (const key of outputKeys) {
        if (!key.startsWith(prefix)) return false;
        const localPart = key.slice(prefix.length);
        if (localPart.length === 0) return false;
      }

      return true;
    }),
    { numRuns: 300, seed: 42 }
  );
});

// ---------------------------------------------------------------------------
// Property 6b — Namespacing Consistency (tasks)
// Feature: tomation, Property 6: Compiler Namespacing Consistency
// ---------------------------------------------------------------------------

test('Property 6b: every tasks output key is exactly Namespace__taskName', () => {
  fc.assert(
    fc.property(tasksArb, (tasks) => {
      const parsedFile = buildParsedFile([], tasks);
      const result = extractPom(parsedFile);

      // No errors should be produced
      if (result.errors.length > 0) return false;

      const outputKeys = Object.keys(result.tasks);

      // There must be as many output keys as input tasks
      if (outputKeys.length !== tasks.length) return false;

      // Derive the expected namespace
      const namespace = deriveNamespace(parsedFile.filePath);
      const prefix = namespace + '__';

      // Every output key must be exactly `Namespace__taskName`
      for (const taskDef of tasks) {
        const expected = prefix + taskDef.name;
        if (!(expected in result.tasks)) return false;
      }

      // Every output key must start with the namespace prefix
      for (const key of outputKeys) {
        if (!key.startsWith(prefix)) return false;
        const localPart = key.slice(prefix.length);
        if (localPart.length === 0) return false;
      }

      return true;
    }),
    { numRuns: 300, seed: 42 }
  );
});

// ---------------------------------------------------------------------------
// Property 6c — No key collisions within a single POM
// Feature: tomation, Property 6: Compiler Namespacing Consistency
// ---------------------------------------------------------------------------

test('Property 6c: no key collisions — all namespaced keys in a single POM output are unique', () => {
  fc.assert(
    fc.property(fc.tuple(elementsArb, tasksArb), ([elements, tasks]) => {
      const parsedFile = buildParsedFile(elements, tasks);
      const result = extractPom(parsedFile);

      if (result.errors.length > 0) return false;

      const elementKeys = Object.keys(result.pageElements);
      const taskKeys = Object.keys(result.tasks);

      // Within pageElements: all keys must be unique
      const elementKeySet = new Set(elementKeys);
      if (elementKeySet.size !== elementKeys.length) return false;

      // Within tasks: all keys must be unique
      const taskKeySet = new Set(taskKeys);
      if (taskKeySet.size !== taskKeys.length) return false;

      return true;
    }),
    { numRuns: 300, seed: 42 }
  );
});

// ---------------------------------------------------------------------------
// Unit tests — concrete examples to anchor the property tests
// ---------------------------------------------------------------------------

test('unit: single element is namespaced correctly', () => {
  const parsedFile = buildParsedFile(
    [{ variableName: 'submitBtn', tag: 'button', label: 'Submit', where: { id: 'submit' }, line: 1 }],
    []
  );
  const result = extractPom(parsedFile);
  assert.equal(result.errors.length, 0);
  assert.ok('Fake__submitBtn' in result.pageElements);
  assert.equal(Object.keys(result.pageElements).length, 1);
});

test('unit: single task is namespaced correctly', () => {
  const parsedFile = buildParsedFile(
    [],
    [{ name: 'login', steps: [], params: [], line: 1 }]
  );
  const result = extractPom(parsedFile);
  assert.equal(result.errors.length, 0);
  assert.ok('Fake__login' in result.tasks);
  assert.equal(Object.keys(result.tasks).length, 1);
});

test('unit: multiple elements produce distinct namespaced keys', () => {
  const parsedFile = buildParsedFile(
    [
      { variableName: 'header', tag: 'div', label: 'Header', where: { id: 'header' }, line: 1 },
      { variableName: 'footer', tag: 'div', label: 'Footer', where: { id: 'footer' }, line: 2 },
      { variableName: 'navBtn', tag: 'button', label: 'Nav', where: { id: 'nav' }, line: 3 },
    ],
    []
  );
  const result = extractPom(parsedFile);
  assert.equal(result.errors.length, 0);
  assert.ok('Fake__header' in result.pageElements);
  assert.ok('Fake__footer' in result.pageElements);
  assert.ok('Fake__navBtn' in result.pageElements);
  assert.equal(Object.keys(result.pageElements).length, 3);
});

test('unit: parsedFile with error produces no pageElements or tasks', () => {
  const parsedFile = {
    filePath: '/test/bad.pom.ts',
    type: 'pom',
    elements: [],
    tasks: [],
    tests: [],
    error: { message: 'Parse error in /test/bad.pom.ts:1: Unexpected token', line: 1 },
    warnings: [],
  };
  const result = extractPom(parsedFile);
  assert.equal(Object.keys(result.pageElements).length, 0);
  assert.equal(Object.keys(result.tasks).length, 0);
  assert.equal(result.errors.length, 1);
});

test('unit: non-pom type with no elements/tasks produces empty result', () => {
  const parsedFile = {
    filePath: '/test/my.test.ts',
    type: 'test',
    elements: [],
    tasks: [],
    tests: [],
    error: null,
    warnings: [],
  };
  const result = extractPom(parsedFile);
  assert.equal(Object.keys(result.pageElements).length, 0);
  assert.equal(Object.keys(result.tasks).length, 0);
  assert.equal(result.errors.length, 0);
});
