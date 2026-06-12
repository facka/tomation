'use strict';

/**
 * Tests for deduplicator.js — duplicate key detection across POM files.
 *
 * Requirements: 13.7
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const { deduplicateKeys } = require('./deduplicator.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal PomResult for testing, simulating extractPom() output.
 *
 * @param {string} filePath
 * @param {string[]} elementKeys   - namespaced element keys to include
 * @param {string[]} taskKeys      - namespaced task keys to include
 */
function buildPomResult(filePath, elementKeys, taskKeys) {
  var pageElements = {};
  for (var i = 0; i < elementKeys.length; i++) {
    pageElements[elementKeys[i]] = {
      tag: 'button',
      where: { id: elementKeys[i] },
      _meta: { filePath: filePath, line: i + 1 },
    };
  }

  var tasks = {};
  for (var j = 0; j < taskKeys.length; j++) {
    tasks[taskKeys[j]] = {
      steps: [],
      _meta: { filePath: filePath, line: j + 1 },
    };
  }

  return { filePath: filePath, pageElements: pageElements, tasks: tasks, errors: [] };
}

// ---------------------------------------------------------------------------
// Unit tests — no duplicates
// ---------------------------------------------------------------------------

test('returns ok:true for empty array', () => {
  const r = deduplicateKeys([]);
  assert.equal(r.ok, true);
});

test('returns ok:true for single POM with no keys', () => {
  const r = deduplicateKeys([buildPomResult('/a.pom.js', [], [])]);
  assert.equal(r.ok, true);
});

test('returns ok:true for single POM with element and task keys', () => {
  const r = deduplicateKeys([
    buildPomResult('/a.pom.js', ['Page__btn', 'Page__input'], ['Page__login']),
  ]);
  assert.equal(r.ok, true);
});

test('returns ok:true for two POMs with completely distinct keys', () => {
  const r = deduplicateKeys([
    buildPomResult('/a.pom.js', ['PageA__btn'], ['PageA__doLogin']),
    buildPomResult('/b.pom.js', ['PageB__btn'], ['PageB__doLogin']),
  ]);
  assert.equal(r.ok, true);
});

test('returns ok:true for null/undefined input', () => {
  assert.equal(deduplicateKeys(null).ok, true);
  assert.equal(deduplicateKeys(undefined).ok, true);
});

// ---------------------------------------------------------------------------
// Unit tests — duplicate element keys
// ---------------------------------------------------------------------------

test('returns ok:false when the same element key appears in two files', () => {
  const r = deduplicateKeys([
    buildPomResult('/file1.pom.js', ['Page__submit'], []),
    buildPomResult('/file2.pom.js', ['Page__submit'], []),
  ]);
  assert.equal(r.ok, false);
  assert.ok(r.error.includes("Page__submit"), 'error mentions the duplicate key');
  assert.ok(r.error.includes('/file1.pom.js'), 'error mentions first file');
  assert.ok(r.error.includes('/file2.pom.js'), 'error mentions second file');
});

test('error message format is: Duplicate element key X defined in file1 and file2', () => {
  const r = deduplicateKeys([
    buildPomResult('/first.pom.js', ['Login__username'], []),
    buildPomResult('/second.pom.js', ['Login__username'], []),
  ]);
  assert.equal(r.ok, false);
  assert.equal(
    r.error,
    "Duplicate element key 'Login__username' defined in /first.pom.js and /second.pom.js"
  );
});

test('stops on first duplicate element key — does not report all conflicts', () => {
  const r = deduplicateKeys([
    buildPomResult('/a.pom.js', ['Page__x', 'Page__y'], []),
    buildPomResult('/b.pom.js', ['Page__x', 'Page__y'], []),
  ]);
  // Should fail on the first key encountered that conflicts (Page__x)
  assert.equal(r.ok, false);
  assert.ok(typeof r.error === 'string' && r.error.length > 0);
});

// ---------------------------------------------------------------------------
// Unit tests — duplicate task keys
// ---------------------------------------------------------------------------

test('returns ok:false when the same task key appears in two files', () => {
  const r = deduplicateKeys([
    buildPomResult('/file1.pom.js', [], ['Page__doLogin']),
    buildPomResult('/file2.pom.js', [], ['Page__doLogin']),
  ]);
  assert.equal(r.ok, false);
  assert.ok(r.error.includes("Page__doLogin"), 'error mentions the duplicate task key');
  assert.ok(r.error.includes('/file1.pom.js'), 'error mentions first file');
  assert.ok(r.error.includes('/file2.pom.js'), 'error mentions second file');
});

test('duplicate task key error message contains key and both file paths', () => {
  const r = deduplicateKeys([
    buildPomResult('/home.pom.js', [], ['HomePage__submit']),
    buildPomResult('/auth.pom.js', [], ['HomePage__submit']),
  ]);
  assert.equal(r.ok, false);
  assert.equal(
    r.error,
    "Duplicate element key 'HomePage__submit' defined in /home.pom.js and /auth.pom.js"
  );
});

// ---------------------------------------------------------------------------
// Unit tests — same key in same file is NOT a duplicate
// ---------------------------------------------------------------------------

test('same key from the same file does not trigger a conflict', () => {
  // This can happen if the same PomResult is passed twice (idempotency)
  const pom = buildPomResult('/a.pom.js', ['Page__btn'], []);
  const r = deduplicateKeys([pom, pom]);
  assert.equal(r.ok, true);
});

// ---------------------------------------------------------------------------
// Unit tests — three or more POMs
// ---------------------------------------------------------------------------

test('detects conflict among three POMs when third file repeats a key from the first', () => {
  const r = deduplicateKeys([
    buildPomResult('/a.pom.js', ['Shared__key'], []),
    buildPomResult('/b.pom.js', ['OtherPage__key'], []),
    buildPomResult('/c.pom.js', ['Shared__key'], []),
  ]);
  assert.equal(r.ok, false);
  assert.ok(r.error.includes('Shared__key'));
  assert.ok(r.error.includes('/a.pom.js'));
  assert.ok(r.error.includes('/c.pom.js'));
});

// ---------------------------------------------------------------------------
// Property-based tests
// Feature: tomation, Property 6: Compiler Namespacing Consistency
// Validates: Requirements 13.7
// ---------------------------------------------------------------------------

/**
 * Valid identifier-style strings for namespaced keys.
 * E.g. "PageA__key1"
 */
const identArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/).filter(s => s.length > 0);

const namespacedKeyArb = fc
  .tuple(identArb, identArb)
  .map(([page, key]) => page + '__' + key);

test('Property: no duplicates when all files have disjoint key sets', () => {
  // Generate N files each with M distinct keys that don't overlap across files
  const disjointFilesArb = fc
    .uniqueArray(namespacedKeyArb, { minLength: 2, maxLength: 10 })
    .chain(allKeys => {
      // Split all keys into two non-overlapping halves
      const mid = Math.floor(allKeys.length / 2);
      const keysA = allKeys.slice(0, mid);
      const keysB = allKeys.slice(mid);
      return fc.constant([
        buildPomResult('/file-a.pom.js', keysA, []),
        buildPomResult('/file-b.pom.js', keysB, []),
      ]);
    });

  fc.assert(
    fc.property(disjointFilesArb, pomResults => {
      const r = deduplicateKeys(pomResults);
      return r.ok === true;
    }),
    { numRuns: 200, seed: 42 }
  );
});

test('Property: duplicate detection always fires when the same key appears in two files', () => {
  // Generate a key shared across two different files
  const conflictArb = fc.tuple(namespacedKeyArb, identArb, identArb).filter(
    ([, f1, f2]) => f1 !== f2
  ).map(([key, file1, file2]) => ({
    key,
    pomResults: [
      buildPomResult('/' + file1 + '.pom.js', [key], []),
      buildPomResult('/' + file2 + '.pom.js', [key], []),
    ],
  }));

  fc.assert(
    fc.property(conflictArb, ({ key, pomResults }) => {
      const r = deduplicateKeys(pomResults);
      return (
        r.ok === false &&
        typeof r.error === 'string' &&
        r.error.includes(key)
      );
    }),
    { numRuns: 200, seed: 42 }
  );
});

test('Property: single file never produces a duplicate error', () => {
  // A single PomResult with any keys should always pass deduplication
  const singleFileArb = fc
    .uniqueArray(namespacedKeyArb, { minLength: 0, maxLength: 10 })
    .map(keys => [buildPomResult('/single.pom.js', keys, [])]);

  fc.assert(
    fc.property(singleFileArb, pomResults => {
      const r = deduplicateKeys(pomResults);
      return r.ok === true;
    }),
    { numRuns: 200, seed: 42 }
  );
});
