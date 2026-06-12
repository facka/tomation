'use strict';

/**
 * Property-based tests for pom.js — namespacing consistency.
 *
 * Feature: tomation, Property 6: Compiler Namespacing Consistency
 * Validates: Requirements 13.2, 13.3
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const { extractPom } = require('./pom.js');

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Valid identifier-style strings for page names and keys.
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
 * A valid element definition (no line, just tag + where).
 */
const elementDefArb = fc.record({
  tag: fc.constantFrom('input', 'button', 'div', 'form', 'select', 'span'),
  where: whereArb,
});

/**
 * A valid task definition (no line, just steps array).
 */
const taskDefArb = fc.constant({ steps: [] });

/**
 * Build a fake ParsedFile for a single page, given:
 *   - pageName: string
 *   - elementKeys: string[]  (distinct)
 *   - taskKeys: string[]     (distinct)
 *
 * Returns a parsedFile object ready to be fed into extractPom().
 */
function buildParsedFile(pageName, elementEntries, taskEntries) {
  const elements = {};
  for (const [key, def] of elementEntries) {
    elements[key] = { ...def, line: 1 };
  }

  const tasks = {};
  for (const [key, def] of taskEntries) {
    tasks[key] = { ...def, line: 1 };
  }

  return {
    filePath: '/test/fake.pom.js',
    type: 'pom',
    pages: [
      {
        name: pageName,
        line: 1,
        elements,
        tasks,
      },
    ],
    error: null,
  };
}

/**
 * Arbitrary: a page name + up to 5 distinct element keys, each paired with an element def.
 */
const pageWithElementsArb = fc
  .uniqueArray(identArb, { minLength: 1, maxLength: 5 })
  .chain(elementKeys =>
    fc
      .tuple(
        identArb, // page name
        fc.tuple(...elementKeys.map(() => elementDefArb))
      )
      .map(([pageName, defs]) => ({
        pageName,
        elementEntries: elementKeys.map((k, i) => [k, defs[i]]),
      }))
  );

/**
 * Arbitrary: a page name + up to 5 distinct task keys, each paired with a task def.
 */
const pageWithTasksArb = fc
  .uniqueArray(identArb, { minLength: 1, maxLength: 5 })
  .chain(taskKeys =>
    fc
      .tuple(
        identArb, // page name
        fc.tuple(...taskKeys.map(() => taskDefArb))
      )
      .map(([pageName, defs]) => ({
        pageName,
        taskEntries: taskKeys.map((k, i) => [k, defs[i]]),
      }))
  );

/**
 * Arbitrary: a page with BOTH distinct element keys AND distinct task keys (1–5 each).
 */
const pageWithBothArb = fc
  .tuple(
    fc.uniqueArray(identArb, { minLength: 1, maxLength: 5 }),
    fc.uniqueArray(identArb, { minLength: 1, maxLength: 5 })
  )
  .chain(([elementKeys, taskKeys]) =>
    fc
      .tuple(
        identArb,
        fc.tuple(...elementKeys.map(() => elementDefArb)),
        fc.tuple(...taskKeys.map(() => taskDefArb))
      )
      .map(([pageName, elDefs, taskDefs]) => ({
        pageName,
        elementEntries: elementKeys.map((k, i) => [k, elDefs[i]]),
        taskEntries: taskKeys.map((k, i) => [k, taskDefs[i]]),
      }))
  );

// ---------------------------------------------------------------------------
// Property 6a — Namespacing Consistency (elements)
// Feature: tomation, Property 6: Compiler Namespacing Consistency
// Validates: Requirements 13.2
// ---------------------------------------------------------------------------

test('Property 6a: every pageElements output key is exactly PageName__key', () => {
  fc.assert(
    fc.property(pageWithElementsArb, ({ pageName, elementEntries }) => {
      const parsedFile = buildParsedFile(pageName, elementEntries, []);
      const result = extractPom(parsedFile);

      // No errors should be produced
      if (result.errors.length > 0) return false;

      const outputKeys = Object.keys(result.pageElements);

      // There must be as many output keys as input element keys
      if (outputKeys.length !== elementEntries.length) return false;

      // Every output key must be exactly `PageName__localKey`
      const separator = '__';
      for (const [localKey] of elementEntries) {
        const expected = `${pageName}${separator}${localKey}`;
        if (!(expected in result.pageElements)) return false;
      }

      // Every output key must start with `pageName__` and have a non-empty suffix
      for (const key of outputKeys) {
        const expectedPrefix = pageName + separator;
        if (!key.startsWith(expectedPrefix)) return false;
        const localPart = key.slice(expectedPrefix.length);
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
// Validates: Requirements 13.3
// ---------------------------------------------------------------------------

test('Property 6b: every tasks output key is exactly PageName__key', () => {
  fc.assert(
    fc.property(pageWithTasksArb, ({ pageName, taskEntries }) => {
      const parsedFile = buildParsedFile(pageName, [], taskEntries);
      const result = extractPom(parsedFile);

      // No errors should be produced
      if (result.errors.length > 0) return false;

      const outputKeys = Object.keys(result.tasks);

      // There must be as many output keys as input task keys
      if (outputKeys.length !== taskEntries.length) return false;

      // Every output key must be exactly `PageName__localKey`
      const separator = '__';
      for (const [localKey] of taskEntries) {
        const expected = `${pageName}${separator}${localKey}`;
        if (!(expected in result.tasks)) return false;
      }

      // Every output key must start with `pageName__` and have a non-empty suffix
      for (const key of outputKeys) {
        const expectedPrefix = pageName + separator;
        if (!key.startsWith(expectedPrefix)) return false;
        const localPart = key.slice(expectedPrefix.length);
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
// Validates: Requirements 13.2, 13.3
// ---------------------------------------------------------------------------

test('Property 6c: no key collisions — all namespaced keys in a single POM output are unique', () => {
  fc.assert(
    fc.property(pageWithBothArb, ({ pageName, elementEntries, taskEntries }) => {
      const parsedFile = buildParsedFile(pageName, elementEntries, taskEntries);
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
    'LoginPage',
    [['submitBtn', { tag: 'button', where: { id: 'submit' } }]],
    []
  );
  const result = extractPom(parsedFile);
  assert.equal(result.errors.length, 0);
  assert.ok('LoginPage__submitBtn' in result.pageElements);
  assert.equal(Object.keys(result.pageElements).length, 1);
});

test('unit: single task is namespaced correctly', () => {
  const parsedFile = buildParsedFile(
    'LoginPage',
    [],
    [['login', { steps: [] }]]
  );
  const result = extractPom(parsedFile);
  assert.equal(result.errors.length, 0);
  assert.ok('LoginPage__login' in result.tasks);
  assert.equal(Object.keys(result.tasks).length, 1);
});

test('unit: multiple elements produce distinct namespaced keys', () => {
  const parsedFile = buildParsedFile(
    'HomePage',
    [
      ['header', { tag: 'div', where: { id: 'header' } }],
      ['footer', { tag: 'div', where: { id: 'footer' } }],
      ['navBtn', { tag: 'button', where: { id: 'nav' } }],
    ],
    []
  );
  const result = extractPom(parsedFile);
  assert.equal(result.errors.length, 0);
  assert.ok('HomePage__header' in result.pageElements);
  assert.ok('HomePage__footer' in result.pageElements);
  assert.ok('HomePage__navBtn' in result.pageElements);
  assert.equal(Object.keys(result.pageElements).length, 3);
});

test('unit: page name with underscores in key produces correct double-underscore separator', () => {
  // The separator is always __ regardless of page name content
  const parsedFile = buildParsedFile(
    'MyPage',
    [['my_element', { tag: 'input', where: { id: 'x' } }]],
    []
  );
  const result = extractPom(parsedFile);
  assert.equal(result.errors.length, 0);
  assert.ok('MyPage__my_element' in result.pageElements);
});

test('unit: parsedFile with error produces no pageElements or tasks', () => {
  const parsedFile = {
    filePath: '/test/bad.pom.js',
    type: 'pom',
    pages: [],
    error: { message: 'Parse error in /test/bad.pom.js:1: Unexpected token', line: 1 },
  };
  const result = extractPom(parsedFile);
  assert.equal(Object.keys(result.pageElements).length, 0);
  assert.equal(Object.keys(result.tasks).length, 0);
  assert.equal(result.errors.length, 1);
});

test('unit: non-pom type produces empty result', () => {
  const parsedFile = {
    filePath: '/test/my.test.js',
    type: 'test',
    pages: [],
    tests: [],
    error: null,
  };
  const result = extractPom(parsedFile);
  assert.equal(Object.keys(result.pageElements).length, 0);
  assert.equal(Object.keys(result.tasks).length, 0);
  assert.equal(result.errors.length, 0);
});
