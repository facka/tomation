'use strict';

/**
 * Tests for flattener.js — merges POM results and parsed test files into
 * a spec-shaped object.
 *
 * Requirements: 13.6, 12.1
 */

// Feature: tomation, Property 5

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const { flattenSpec } = require('./flattener.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal PomResult for testing, simulating extractPom() output.
 *
 * @param {string}   filePath
 * @param {string[]} elementKeys  - element keys to include (each gets tag + where)
 * @param {string[]} taskKeys     - task keys to include (each gets steps:[])
 */
function buildPomResult(filePath, elementKeys, taskKeys, elementDefs, taskDefs) {
  var pageElements = {};
  for (var i = 0; i < elementKeys.length; i++) {
    var key = elementKeys[i];
    pageElements[key] = Object.assign(
      { tag: 'button', where: { id: key }, _meta: { filePath: filePath, line: i + 1 } },
      elementDefs && elementDefs[key] ? elementDefs[key] : {}
    );
  }

  var tasks = {};
  for (var j = 0; j < taskKeys.length; j++) {
    var tKey = taskKeys[j];
    tasks[tKey] = Object.assign(
      { steps: [], _meta: { filePath: filePath, line: j + 1 } },
      taskDefs && taskDefs[tKey] ? taskDefs[tKey] : {}
    );
  }

  return { filePath: filePath, pageElements: pageElements, tasks: tasks, errors: [] };
}

/**
 * Build a parsed test file result, simulating parseFile() output.
 *
 * @param {string}   filePath
 * @param {Array}    testDefs  - array of { name, steps, line? }
 */
function buildParsedTestFile(filePath, testDefs) {
  return {
    filePath: filePath,
    type: 'test',
    tests: testDefs.map(function(td, i) {
      return Object.assign({ line: i + 1 }, td);
    }),
  };
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

test('returns correct format and version', () => {
  const result = flattenSpec([], []);
  assert.equal(result.format, 'tomation-spec');
  assert.equal(result.version, 1);
});

test('returns default meta when none provided', () => {
  const result = flattenSpec([], []);
  assert.equal(result.meta.name, 'Untitled');
  assert.equal(result.meta.url, '');
  assert.equal(result.meta.description, '');
});

test('uses provided meta fields', () => {
  const meta = { name: 'My App', url: 'https://myapp.com', description: 'Login tests' };
  const result = flattenSpec([], [], meta);
  assert.deepEqual(result.meta, meta);
});

test('uses partial meta fields and defaults for the rest', () => {
  const result = flattenSpec([], [], { name: 'Partial', url: 'https://x.com' });
  assert.equal(result.meta.name, 'Partial');
  assert.equal(result.meta.url, 'https://x.com');
  assert.equal(result.meta.description, '');
});

test('merges pageElements from a single POM result', () => {
  const pom = buildPomResult('/page.pom.js', ['btn', 'input'], []);
  const result = flattenSpec([pom], []);
  assert.ok('btn' in result.pageElements);
  assert.ok('input' in result.pageElements);
  assert.equal(result.pageElements.btn.tag, 'button');
  assert.deepEqual(result.pageElements.btn.where, { id: 'btn' });
});

test('strips _meta from pageElements entries', () => {
  const pom = buildPomResult('/page.pom.js', ['el1'], []);
  const result = flattenSpec([pom], []);
  assert.ok(!('_meta' in result.pageElements.el1));
});

test('merges tasks from a single POM result', () => {
  const pom = buildPomResult('/page.pom.js', [], ['doLogin', 'doLogout']);
  const result = flattenSpec([pom], []);
  assert.ok('doLogin' in result.tasks);
  assert.ok('doLogout' in result.tasks);
  assert.deepEqual(result.tasks.doLogin.steps, []);
});

test('strips _meta from tasks entries', () => {
  const pom = buildPomResult('/page.pom.js', [], ['task1']);
  const result = flattenSpec([pom], []);
  assert.ok(!('_meta' in result.tasks.task1));
});

test('merges pageElements and tasks from multiple POM results', () => {
  const pomA = buildPomResult('/a.pom.js', ['Page1__btn'], ['Page1__submit']);
  const pomB = buildPomResult('/b.pom.js', ['Page2__link'], ['Page2__navigate']);
  const result = flattenSpec([pomA, pomB], []);
  assert.ok('Page1__btn' in result.pageElements);
  assert.ok('Page2__link' in result.pageElements);
  assert.ok('Page1__submit' in result.tasks);
  assert.ok('Page2__navigate' in result.tasks);
});

test('collects tests from a single parsed test file', () => {
  const testFile = buildParsedTestFile('/my.test.js', [
    { name: 'Login flow', steps: [{ action: 'navigate', url: 'https://example.com' }] },
    { name: 'Logout flow', steps: [] },
  ]);
  const result = flattenSpec([], [testFile]);
  assert.equal(result.tests.length, 2);
  assert.equal(result.tests[0].name, 'Login flow');
  assert.equal(result.tests[1].name, 'Logout flow');
});

test('strips line from test entries', () => {
  const testFile = buildParsedTestFile('/my.test.js', [
    { name: 'T1', steps: [] },
  ]);
  const result = flattenSpec([], [testFile]);
  assert.ok(!('line' in result.tests[0]));
});

test('collects tests from multiple parsed test files', () => {
  const testFileA = buildParsedTestFile('/a.test.js', [{ name: 'T1', steps: [] }]);
  const testFileB = buildParsedTestFile('/b.test.js', [{ name: 'T2', steps: [] }, { name: 'T3', steps: [] }]);
  const result = flattenSpec([], [testFileA, testFileB]);
  assert.equal(result.tests.length, 3);
  assert.deepEqual(result.tests.map(t => t.name), ['T1', 'T2', 'T3']);
});

test('returns empty pageElements, tasks, tests for empty inputs', () => {
  const result = flattenSpec([], []);
  assert.deepEqual(result.pageElements, {});
  assert.deepEqual(result.tasks, {});
  assert.deepEqual(result.tests, []);
});

test('handles null/undefined pomResults and parsedTestFiles gracefully', () => {
  const r1 = flattenSpec(null, null);
  assert.equal(r1.format, 'tomation-spec');
  assert.deepEqual(r1.pageElements, {});
  assert.deepEqual(r1.tests, []);

  const r2 = flattenSpec(undefined, undefined);
  assert.equal(r2.format, 'tomation-spec');
  assert.deepEqual(r2.pageElements, {});
});

// ---------------------------------------------------------------------------
// Property-Based Tests
// Feature: tomation, Property 5: Spec Serialization Round-Trip
// Validates: Requirements 13.6, 12.1
// ---------------------------------------------------------------------------

/**
 * A non-empty identifier-safe string (letter followed by alphanumerics/underscores)
 */
const identArb = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/)
  .filter(s => s.length > 0);

/**
 * A valid where object: at least one non-undefined matcher key
 */
const whereArb = fc
  .record({
    id:            fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    textIs:        fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    classIncludes: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    placeholder:   fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  })
  .filter(w => Object.values(w).some(v => v !== undefined))
  .map(w => {
    var out = {};
    Object.keys(w).forEach(function(k) {
      if (w[k] !== undefined) out[k] = w[k];
    });
    return out;
  });

/**
 * A valid pageElement entry (no _meta — as if already merged)
 */
const pageElementEntryArb = fc.record({
  tag:   fc.constantFrom('input', 'button', 'div', 'form', 'select', 'span'),
  where: whereArb,
});

/**
 * Arbitrary array of distinct element keys (0–5)
 */
const elementKeysArb = fc.uniqueArray(identArb, { minLength: 0, maxLength: 5 });

/**
 * Build an arbitrary PomResult given a set of element keys and task keys.
 * Each element key gets a randomly generated entry; tasks get empty steps.
 */
function pomResultArb(elementKeys, taskKeys) {
  if (elementKeys.length === 0 && taskKeys.length === 0) {
    return fc.constant(buildPomResult('/gen.pom.js', [], []));
  }

  var elementEntryArbs = elementKeys.map(function() { return pageElementEntryArb; });
  var tupleArbs = elementEntryArbs.length > 0
    ? fc.tuple(...elementEntryArbs)
    : fc.constant([]);

  return tupleArbs.map(function(entries) {
    var pageElements = {};
    elementKeys.forEach(function(k, i) {
      pageElements[k] = Object.assign({ _meta: { filePath: '/gen.pom.js', line: i + 1 } }, entries[i]);
    });

    var tasks = {};
    taskKeys.forEach(function(k, i) {
      tasks[k] = { steps: [], _meta: { filePath: '/gen.pom.js', line: i + 1 } };
    });

    return { filePath: '/gen.pom.js', pageElements: pageElements, tasks: tasks, errors: [] };
  });
}

/**
 * Build an arbitrary parsed test file with steps that reference only known element/task keys.
 */
function parsedTestFileArb(elementKeys, taskKeys) {
  // Build a step arbitrary that only uses known keys
  function makeStepArb() {
    var options = [fc.constant({ action: 'navigate', url: 'https://example.com' })];
    if (elementKeys.length > 0) {
      options.push(fc.constantFrom(...elementKeys).map(function(k) {
        return { action: 'click', target: k };
      }));
    }
    if (taskKeys.length > 0) {
      options.push(fc.constantFrom(...taskKeys).map(function(k) {
        return { action: 'task', name: k };
      }));
    }
    return fc.oneof(...options);
  }

  return fc.uniqueArray(
    fc.string({ minLength: 1, maxLength: 40 }),
    { minLength: 0, maxLength: 4 }
  ).chain(function(names) {
    if (names.length === 0) {
      return fc.constant({ filePath: '/gen.test.js', type: 'test', tests: [] });
    }
    var stepArb = makeStepArb();
    return fc.tuple(...names.map(function() {
      return fc.array(stepArb, { minLength: 0, maxLength: 3 });
    })).map(function(stepArrays) {
      return {
        filePath: '/gen.test.js',
        type: 'test',
        tests: names.map(function(name, i) {
          return { name: name, steps: stepArrays[i], line: i + 1 };
        }),
      };
    });
  });
}

/**
 * Full arbitrary for (pomResults, parsedTestFiles, meta) inputs to flattenSpec.
 */
const flattenInputArb = elementKeysArb.chain(function(elementKeys) {
  return fc.uniqueArray(identArb, { minLength: 0, maxLength: 3 }).chain(function(taskKeys) {
    return fc.tuple(
      pomResultArb(elementKeys, taskKeys),
      parsedTestFileArb(elementKeys, taskKeys),
      fc.record({
        name:        fc.string({ minLength: 1, maxLength: 40 }),
        url:         fc.constant('https://example.com'),
        description: fc.option(fc.string({ minLength: 0, maxLength: 60 }), { nil: undefined }),
      })
    ).map(function([pom, testFile, meta]) {
      return {
        pomResults: [pom],
        parsedTestFiles: [testFile],
        meta: Object.assign(
          { name: meta.name, url: meta.url },
          meta.description !== undefined ? { description: meta.description } : {}
        ),
      };
    });
  });
});

// ── Property 5: Spec Serialization Round-Trip ─────────────────────────────────
// Feature: tomation, Property 5: Spec Serialization Round-Trip
// Validates: Requirements 13.6, 12.1

test('Property 5: flattenSpec output survives JSON serialization round-trip (emitter-style)', function() {
  fc.assert(
    fc.property(flattenInputArb, function(input) {
      // Step 1: flatten to a spec-shaped object
      var spec = flattenSpec(input.pomResults, input.parsedTestFiles, input.meta);

      // Step 2: serialize using the same method as emitter (JSON.stringify with 2-space indent)
      var serialized = JSON.stringify(spec, null, 2);

      // Step 3: parse back
      var parsed = JSON.parse(serialized);

      // Step 4: verify structural equivalence

      // format and version preserved
      if (parsed.format !== 'tomation-spec') return false;
      if (parsed.version !== 1) return false;

      // meta fields preserved
      if (parsed.meta.name !== spec.meta.name) return false;
      if (parsed.meta.url !== spec.meta.url) return false;
      if (parsed.meta.description !== spec.meta.description) return false;

      // pageElements keys and entries preserved (no _meta in output)
      var origElKeys = Object.keys(spec.pageElements).sort();
      var parsedElKeys = Object.keys(parsed.pageElements).sort();
      if (JSON.stringify(origElKeys) !== JSON.stringify(parsedElKeys)) return false;

      for (var i = 0; i < origElKeys.length; i++) {
        var k = origElKeys[i];
        var orig = spec.pageElements[k];
        var copy = parsed.pageElements[k];
        if (copy.tag !== orig.tag) return false;
        if (JSON.stringify(copy.where) !== JSON.stringify(orig.where)) return false;
        if (orig.childOf !== undefined && copy.childOf !== orig.childOf) return false;
        // _meta must NOT be present in output
        if ('_meta' in copy) return false;
      }

      // tasks keys and steps preserved (no _meta)
      var origTaskKeys = Object.keys(spec.tasks).sort();
      var parsedTaskKeys = Object.keys(parsed.tasks).sort();
      if (JSON.stringify(origTaskKeys) !== JSON.stringify(parsedTaskKeys)) return false;

      for (var j = 0; j < origTaskKeys.length; j++) {
        var tk = origTaskKeys[j];
        var origTask = spec.tasks[tk];
        var parsedTask = parsed.tasks[tk];
        if (JSON.stringify(parsedTask.steps) !== JSON.stringify(origTask.steps)) return false;
        if ('_meta' in parsedTask) return false;
      }

      // tests array length and entry equivalence (no line field)
      if (parsed.tests.length !== spec.tests.length) return false;

      for (var ti = 0; ti < spec.tests.length; ti++) {
        var origTest = spec.tests[ti];
        var parsedTest = parsed.tests[ti];
        if (parsedTest.name !== origTest.name) return false;
        if (JSON.stringify(parsedTest.steps) !== JSON.stringify(origTest.steps)) return false;
        // line must NOT be present in output
        if ('line' in parsedTest) return false;
      }

      // Re-serializing should produce identical JSON (idempotency)
      return JSON.stringify(parsed) === JSON.stringify(spec);
    }),
    { numRuns: 100, seed: 42 }
  );
});
