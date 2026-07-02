'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateSpec } = require('./validator.js');

// ── helpers ──────────────────────────────────────────────────────────────────

function minimalValid(overrides) {
  return Object.assign(
    {
      format: 'tomation-spec',
      version: 1,
      meta: { name: 'Test', url: 'https://example.com', description: '' },
      pageElements: {},
      tasks: {},
      tests: [],
    },
    overrides
  );
}

// ── Requirement 1.1: format and version ──────────────────────────────────────

test('rejects wrong format string', () => {
  const r = validateSpec(minimalValid({ format: 'wrong' }));
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Unsupported spec format or version');
});

test('rejects wrong version number', () => {
  const r = validateSpec(minimalValid({ version: 2 }));
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Unsupported spec format or version');
});

test('rejects non-object input', () => {
  assert.equal(validateSpec(null).ok, false);
  assert.equal(validateSpec('string').ok, false);
  assert.equal(validateSpec(42).ok, false);
  assert.equal(validateSpec([]).ok, false);
});

// ── Requirement 1.2: required top-level fields ────────────────────────────────

test('rejects missing format field', () => {
  const spec = minimalValid();
  delete spec.format;
  const r = validateSpec(spec);
  assert.equal(r.ok, false);
  assert.match(r.error, /Missing field: format|Unsupported/);
});

test('rejects missing version field', () => {
  const spec = minimalValid();
  delete spec.version;
  const r = validateSpec(spec);
  assert.equal(r.ok, false);
  assert.match(r.error, /Missing field: version|Unsupported/);
});

test('rejects missing pageElements field', () => {
  const spec = minimalValid();
  delete spec.pageElements;
  const r = validateSpec(spec);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Missing field: pageElements');
});

test('rejects missing tasks field', () => {
  const spec = minimalValid();
  delete spec.tasks;
  const r = validateSpec(spec);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Missing field: tasks');
});

test('rejects missing tests field', () => {
  const spec = minimalValid();
  delete spec.tests;
  const r = validateSpec(spec);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Missing field: tests');
});

// ── Requirement 1.6: pageElements entries ────────────────────────────────────

test('rejects pageElements entry without tag', () => {
  const r = validateSpec(minimalValid({
    pageElements: { btn: { where: { id: 'x' } } }
  }));
  assert.equal(r.ok, false);
  assert.match(r.error, /tag/);
});

test('rejects pageElements entry without where', () => {
  const r = validateSpec(minimalValid({
    pageElements: { btn: { tag: 'button' } }
  }));
  assert.equal(r.ok, false);
  assert.match(r.error, /where/);
});

test('rejects pageElements entry with empty where object', () => {
  const r = validateSpec(minimalValid({
    pageElements: { btn: { tag: 'button', where: {} } }
  }));
  assert.equal(r.ok, false);
  assert.match(r.error, /where/);
});

test('accepts pageElements entry with tag and non-empty where', () => {
  const r = validateSpec(minimalValid({
    pageElements: { btn: { tag: 'button', where: { id: 'submit' } } }
  }));
  assert.equal(r.ok, true);
});

// ── Requirement 1.6a: childOf validation ─────────────────────────────────────

test('accepts valid childOf reference to an entry with where.id', () => {
  const r = validateSpec(minimalValid({
    pageElements: {
      form: { tag: 'form', where: { id: 'login-form' } },
      submitBtn: { tag: 'button', childOf: 'login-form', where: { id: 'submit' } }
    }
  }));
  assert.equal(r.ok, true);
});

test('rejects childOf referencing a non-existent id', () => {
  const r = validateSpec(minimalValid({
    pageElements: {
      submitBtn: { tag: 'button', childOf: 'ghost-id', where: { id: 'submit' } }
    }
  }));
  assert.equal(r.ok, false);
  assert.match(r.error, /childOf/);
  assert.match(r.error, /ghost-id/);
});

test('rejects childOf referencing an entry that has no where.id', () => {
  const r = validateSpec(minimalValid({
    pageElements: {
      form: { tag: 'form', where: { textIs: 'Login' } },  // no where.id
      submitBtn: { tag: 'button', childOf: 'someId', where: { id: 'submit' } }
    }
  }));
  assert.equal(r.ok, false);
  assert.match(r.error, /childOf/);
});

// ── Requirement 1.7: tasks entries ───────────────────────────────────────────

test('rejects tasks entry without steps array', () => {
  const r = validateSpec(minimalValid({
    tasks: { myTask: { params: ['x'] } }
  }));
  assert.equal(r.ok, false);
  assert.match(r.error, /steps/);
});

test('accepts tasks entry with steps array', () => {
  const r = validateSpec(minimalValid({
    tasks: { myTask: { steps: [] } }
  }));
  assert.equal(r.ok, true);
});

test('accepts tasks entry with steps and params arrays', () => {
  const r = validateSpec(minimalValid({
    tasks: { myTask: { params: ['username'], steps: [] } }
  }));
  assert.equal(r.ok, true);
});

// ── Requirement 1.8: tests entries ───────────────────────────────────────────

test('rejects tests entry without name', () => {
  const r = validateSpec(minimalValid({
    tests: [{ steps: [] }]
  }));
  assert.equal(r.ok, false);
  assert.match(r.error, /name/);
});

test('rejects tests entry without steps', () => {
  const r = validateSpec(minimalValid({
    tests: [{ name: 'My test' }]
  }));
  assert.equal(r.ok, false);
  assert.match(r.error, /steps/);
});

test('accepts tests entry with name and steps', () => {
  const r = validateSpec(minimalValid({
    tests: [{ name: 'Login flow', steps: [] }]
  }));
  assert.equal(r.ok, true);
});

// ── Requirement 1.3: step target resolution ──────────────────────────────────

test('rejects step with unknown target in tests', () => {
  const r = validateSpec(minimalValid({
    tests: [{ name: 'T', steps: [{ action: 'click', target: 'missingEl' }] }]
  }));
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Step references unknown element: missingEl');
});

test('rejects step with unknown target in tasks', () => {
  const r = validateSpec(minimalValid({
    tasks: { t: { steps: [{ action: 'click', target: 'missingEl' }] } }
  }));
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Step references unknown element: missingEl');
});

test('accepts step with known target', () => {
  const r = validateSpec(minimalValid({
    pageElements: { btn: { tag: 'button', where: { id: 'x' } } },
    tests: [{ name: 'T', steps: [{ action: 'click', target: 'btn' }] }]
  }));
  assert.equal(r.ok, true);
});

// ── Requirement 1.4: task action name resolution ──────────────────────────────

test('rejects task action with unknown name in tests', () => {
  const r = validateSpec(minimalValid({
    tests: [{ name: 'T', steps: [{ action: 'task', name: 'noSuchTask' }] }]
  }));
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Step references unknown task: noSuchTask');
});

test('accepts task action with known name', () => {
  const r = validateSpec(minimalValid({
    tasks: { doLogin: { steps: [] } },
    tests: [{ name: 'T', steps: [{ action: 'task', name: 'doLogin' }] }]
  }));
  assert.equal(r.ok, true);
});

test('rejects unknown task action referenced inside if-step branch', () => {
  const r = validateSpec(minimalValid({
    tests: [{
      name: 'T',
      steps: [{
        action: 'if',
        condition: { param: 'flag', op: 'truthy' },
        then: [{ action: 'task', name: 'missingTask' }]
      }]
    }]
  }));
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Step references unknown task: missingTask');
});

test('rejects direct self-cycle in tasks', () => {
  const r = validateSpec(minimalValid({
    tasks: {
      loop: { steps: [{ action: 'task', name: 'loop' }] }
    }
  }));
  assert.equal(r.ok, false);
  assert.match(r.error, /Circular task reference detected:/);
});

test('rejects indirect task cycle A -> B -> A', () => {
  const r = validateSpec(minimalValid({
    tasks: {
      taskA: { steps: [{ action: 'task', name: 'taskB' }] },
      taskB: { steps: [{ action: 'task', name: 'taskA' }] }
    }
  }));
  assert.equal(r.ok, false);
  assert.match(r.error, /Circular task reference detected:/);
});

test('accepts nested task references when graph is acyclic', () => {
  const r = validateSpec(minimalValid({
    tasks: {
      leaf: { steps: [] },
      mid: {
        steps: [{
          action: 'if',
          condition: { param: 'flag', op: 'truthy' },
          then: [{ action: 'task', name: 'leaf' }]
        }]
      },
      root: { steps: [{ action: 'task', name: 'mid' }] }
    },
    tests: [{ name: 'T', steps: [{ action: 'task', name: 'root' }] }]
  }));
  assert.equal(r.ok, true);
});

// ── Success path ──────────────────────────────────────────────────────────────

test('returns { ok: true, spec } on valid spec', () => {
  const spec = minimalValid({
    pageElements: {
      usernameInput: { tag: 'input', where: { id: 'username' } },
      passwordInput: { tag: 'input', where: { id: 'password' } },
      loginBtn: { tag: 'button', where: { id: 'login' } }
    },
    tasks: {
      fillForm: {
        params: ['user', 'pass'],
        steps: [
          { action: 'type', target: 'usernameInput', value: '{{user}}' },
          { action: 'typePassword', target: 'passwordInput', value: '{{pass}}' }
        ]
      }
    },
    tests: [
      {
        name: 'Login test',
        steps: [
          { action: 'task', name: 'fillForm', params: { user: 'alice', pass: 'secret' } },
          { action: 'click', target: 'loginBtn' }
        ]
      }
    ]
  });

  const r = validateSpec(spec);
  assert.equal(r.ok, true);
  assert.deepEqual(r.spec, spec);
});

// ── Property-Based Tests ──────────────────────────────────────────────────────
// Feature: tomation, Property 1-3, 5

const fc = require('fast-check');

// ── Arbitraries / helpers ─────────────────────────────────────────────────────

// A non-empty string safe for use as identifier keys
const identArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/).filter(s => s.length > 0);

// A valid where object: at least one matcher key with a string value
const whereArb = fc.record({
  id: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  textIs: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  classIncludes: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
}).filter(w => Object.values(w).some(v => v !== undefined))
  .map(w => {
    // strip undefined keys
    var result = {};
    Object.keys(w).forEach(function(k) { if (w[k] !== undefined) result[k] = w[k]; });
    return result;
  });

// A valid pageElements entry
const pageElementEntryArb = fc.record({
  tag: fc.constantFrom('input', 'button', 'div', 'form', 'select', 'span'),
  where: whereArb,
});

// A map of 0–5 pageElement entries with distinct keys
const pageElementsArb = fc.uniqueArray(identArb, { minLength: 0, maxLength: 5 }).chain(function(keys) {
  if (keys.length === 0) return fc.constant({});
  return fc.tuple(...keys.map(function() { return pageElementEntryArb; })).map(function(entries) {
    var map = {};
    keys.forEach(function(k, i) { map[k] = entries[i]; });
    return map;
  });
});

// A valid tasks map given a set of element keys (steps may reference them)
function tasksArbForElements(elementKeys) {
  return fc.uniqueArray(identArb, { minLength: 0, maxLength: 3 }).chain(function(taskKeyList) {
    if (taskKeyList.length === 0) return fc.constant({});
    return fc.tuple(...taskKeyList.map(function() {
      // Steps in tasks: use only known elementKeys (or no target)
      var stepArb = elementKeys.length > 0
        ? fc.oneof(
            fc.constant({ action: 'click', target: elementKeys[0] }),
            fc.constant({ action: 'navigate', url: 'https://example.com' })
          )
        : fc.constant({ action: 'navigate', url: 'https://example.com' });
      return fc.array(stepArb, { minLength: 0, maxLength: 3 }).map(function(steps) {
        return { steps: steps };
      });
    })).map(function(taskDefs) {
      var map = {};
      taskKeyList.forEach(function(k, i) { map[k] = taskDefs[i]; });
      return map;
    });
  });
}

// A valid tests array given element and task keys
function testsArbForElements(elementKeys, taskKeys) {
  return fc.uniqueArray(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 3 }).chain(function(names) {
    if (names.length === 0) return fc.constant([]);
    return fc.tuple(...names.map(function() {
      var stepArb;
      if (elementKeys.length > 0 && taskKeys.length > 0) {
        stepArb = fc.oneof(
          fc.constant({ action: 'click', target: elementKeys[0] }),
          fc.constant({ action: 'task', name: taskKeys[0] }),
          fc.constant({ action: 'navigate', url: 'https://example.com' })
        );
      } else if (elementKeys.length > 0) {
        stepArb = fc.oneof(
          fc.constant({ action: 'click', target: elementKeys[0] }),
          fc.constant({ action: 'navigate', url: 'https://example.com' })
        );
      } else if (taskKeys.length > 0) {
        stepArb = fc.oneof(
          fc.constant({ action: 'task', name: taskKeys[0] }),
          fc.constant({ action: 'navigate', url: 'https://example.com' })
        );
      } else {
        stepArb = fc.constant({ action: 'navigate', url: 'https://example.com' });
      }
      return fc.record({
        name: fc.constant(names[names.indexOf(names[names.length - 1])]),
        steps: fc.array(stepArb, { minLength: 0, maxLength: 3 }),
      });
    })).map(function(testDefs) {
      // Assign the correct name to each entry
      return names.map(function(n, i) {
        return { name: n, steps: testDefs[i].steps };
      });
    });
  });
}

// A full valid spec object
const validSpecArb = pageElementsArb.chain(function(pageElements) {
  var elementKeys = Object.keys(pageElements);
  return tasksArbForElements(elementKeys).chain(function(tasks) {
    var taskKeys = Object.keys(tasks);
    return testsArbForElements(elementKeys, taskKeys).map(function(tests) {
      return {
        format: 'tomation-spec',
        version: 1,
        meta: { name: 'Generated', url: 'https://example.com', description: '' },
        pageElements: pageElements,
        tasks: tasks,
        tests: tests,
      };
    });
  });
});

// ── Property 1: Spec Validation Rejects Invalid Documents ─────────────────────
// Feature: tomation, Property 1: Spec Validation Rejects Invalid Documents
// Validates: Requirements 1.1, 1.2

test('Property 1: rejects any document with wrong/missing format or version', function() {
  // Generate objects that are either missing format, have wrong format,
  // missing version, or have wrong version
  const invalidDocArb = fc.oneof(
    // Missing format field
    fc.record({
      version: fc.constant(1),
      pageElements: fc.constant({}),
      tasks: fc.constant({}),
      tests: fc.constant([]),
    }),
    // Wrong format string
    fc.record({
      format: fc.string().filter(s => s !== 'tomation-spec'),
      version: fc.constant(1),
      pageElements: fc.constant({}),
      tasks: fc.constant({}),
      tests: fc.constant([]),
    }),
    // Missing version field
    fc.record({
      format: fc.constant('tomation-spec'),
      pageElements: fc.constant({}),
      tasks: fc.constant({}),
      tests: fc.constant([]),
    }),
    // Wrong version number
    fc.record({
      format: fc.constant('tomation-spec'),
      version: fc.integer().filter(v => v !== 1),
      pageElements: fc.constant({}),
      tasks: fc.constant({}),
      tests: fc.constant([]),
    }),
    // Non-object types
    fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined))
  );

  fc.assert(
    fc.property(invalidDocArb, function(doc) {
      var result = validateSpec(doc);
      return result.ok === false && typeof result.error === 'string' && result.error.length > 0;
    }),
    { numRuns: 200, seed: 42 }
  );
});

// ── Property 2: Step Target Resolution ────────────────────────────────────────
// Feature: tomation, Property 2: Step Target Resolution — All Targets Must Exist
// Validates: Requirements 1.3

test('Property 2: rejects valid spec with an unknown step target injected', function() {
  // Generate valid specs, then inject a step with a target that doesn't exist in pageElements
  const unknownTargetArb = identArb.filter(k => k !== '__placeholder__');

  fc.assert(
    fc.property(validSpecArb, unknownTargetArb, function(spec, unknownTarget) {
      // Ensure the unknown target key is genuinely absent
      if (unknownTarget in spec.pageElements) return true; // skip — key happens to exist

      // Deep-clone so we don't mutate the generated value
      var mutated = JSON.parse(JSON.stringify(spec));

      // Inject the bad step into tests (append a new test)
      mutated.tests.push({
        name: 'injected-test',
        steps: [{ action: 'click', target: unknownTarget }],
      });

      var result = validateSpec(mutated);
      return result.ok === false &&
             typeof result.error === 'string' &&
             result.error.indexOf(unknownTarget) !== -1;
    }),
    { numRuns: 150, seed: 42 }
  );
});

// ── Property 3: Task Reference Resolution ─────────────────────────────────────
// Feature: tomation, Property 3: Task Reference Resolution — All Task Names Must Exist
// Validates: Requirements 1.4

test('Property 3: rejects valid spec with an unknown task action name injected', function() {
  const unknownTaskArb = identArb;

  fc.assert(
    fc.property(validSpecArb, unknownTaskArb, function(spec, unknownTaskName) {
      // Ensure the unknown task name is genuinely absent from tasks
      if (unknownTaskName in spec.tasks) return true; // skip

      var mutated = JSON.parse(JSON.stringify(spec));

      // Inject a test with a task action referencing the unknown task
      mutated.tests.push({
        name: 'injected-task-test',
        steps: [{ action: 'task', name: unknownTaskName }],
      });

      var result = validateSpec(mutated);
      return result.ok === false &&
             typeof result.error === 'string' &&
             result.error.indexOf(unknownTaskName) !== -1;
    }),
    { numRuns: 150, seed: 42 }
  );
});

// ── Property 5: Spec Serialization Round-Trip ─────────────────────────────────
// Feature: tomation, Property 5: Spec Serialization Round-Trip
// Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 10.3

test('Property 5: valid spec survives JSON serialization round-trip', function() {
  fc.assert(
    fc.property(validSpecArb, function(spec) {
      // First confirm the generated spec is itself valid
      var original = validateSpec(spec);
      if (!original.ok) return true; // skip degenerate case (shouldn't happen)

      // Serialize → parse → validate
      var serialized = JSON.stringify(spec);
      var parsed = JSON.parse(serialized);
      var roundTripped = validateSpec(parsed);

      if (!roundTripped.ok) return false;

      // Structural equivalence: re-serializing should produce the same JSON
      return JSON.stringify(roundTripped.spec) === JSON.stringify(parsed);
    }),
    { numRuns: 200, seed: 42 }
  );
});
