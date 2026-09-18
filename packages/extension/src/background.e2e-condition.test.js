'use strict';

// background.e2e-condition.test.js — Full-pipeline end-to-end verification
// for the condition-enum-and-nested-params feature.
//
// **Validates: Requirements 4.6, 3.1, 1.1, 5.1, 6.5, 8.1**
//
// This test exercises the ENTIRE condition pipeline end-to-end, joining the two
// components across their shared Condition_Descriptor shape (`path: string[]`):
//
//   DSL source ──► compiler (parseSource) ──► spec JSON (step.condition) ──►
//                                             runtime (evaluateCondition) ──► boolean
//
// It is the concrete "no orphaned code / emit and consume are in sync" guard for
// task 14.1. It covers three descriptor kinds:
//   (i)   a nested-path condition   `encounter.type === EncounterTypes.OFFICE_NOTE`
//   (ii)  an enum/const RHS value   (the resolved 'office_note' literal above,
//         plus a numeric-const RHS   `status === HttpStatus.OK`)
//   (iii) a numeric literal         `status === 200`
//
// For each, the compiled descriptor is fed to the real runtime evaluator and
// asserted to produce the correct boolean against matching (true) and
// non-matching (false) params — including the strict-equality numeric case
// where the string "200" must NOT equal the number 200.
//
// Placement note: this test lives in the extension package because it needs the
// real, exported `evaluateCondition` (with the chrome global mocked the same way
// the sibling background.*.test.js files do). It pulls in the compiler's
// `parseSource` across the workspace by relative path.

var test = require('node:test');
var assert = require('node:assert/strict');

// Mock the chrome global BEFORE requiring background.js — background.js reads
// `chrome`/`browser` at load time. Mirrors the setup in background.property.test.js.
global.chrome = {
  runtime: {
    onMessage: { addListener: function () {}, removeListener: function () {} },
    onConnect: { addListener: function () {} },
    sendMessage: function () { return Promise.resolve(); }
  },
  tabs: {
    query: function () { return Promise.resolve([]); },
    update: function () { return Promise.resolve(); },
    sendMessage: function () { return Promise.resolve({ ok: true }); },
    onCreated: { addListener: function () {}, removeListener: function () {} },
    onRemoved: { addListener: function () {}, removeListener: function () {} },
    onActivated: { addListener: function () {}, removeListener: function () {} }
  }
};
global.getProject = function () { return Promise.resolve(null); };

var bg = require('./background.js');
// Cross-package require: the compiler is a workspace sibling. acorn/typescript
// resolve from the hoisted root node_modules.
var parser = require('../../compiler/src/parser.js');

var evaluateCondition = bg.evaluateCondition;
var parseSource = parser.parseSource;

// ---------------------------------------------------------------------------
// Static call-chain / no-orphaned-code verification (task 14.1, step 2).
//
// Verified by inspecting packages/compiler/src/parser.js (grep of call sites):
//
//   extractParamPath      — CALLED by extractCondition (truthy path, negation
//                           path, and binary-LHS branches) and by
//                           usesNewConditionConstruct. Reached via
//                           extractCondition → extractIfStep/extractWhenStep.
//   resolveRhsReference   — CALLED by extractCondition (binary-equality RHS
//                           branch). Reached via extractCondition →
//                           extractIfStep/extractWhenStep.
//   usesNewConditionConstruct — By design (spec task 3.1) this predicate is
//                           OPTIONAL / message-only: it does NOT gate control
//                           flow and is intentionally not wired into
//                           extractCondition. It is exported for optional use.
//                           This is a deliberate design choice, not accidental
//                           orphaned code; the feature is fully functional
//                           without it (all unresolvable conditions already
//                           warn-and-skip through the null return contract).
//
// The tests below dynamically confirm the LIVE chain: parseSource → the emitted
// step.condition (which can only be produced when extractParamPath /
// resolveRhsReference run inside extractCondition via extractIfStep /
// extractWhenStep) → evaluateCondition in background.js.
// ---------------------------------------------------------------------------
test('e2e: the three condition helpers are exported and directly reachable', () => {
  assert.equal(typeof parser.extractParamPath, 'function');
  assert.equal(typeof parser.resolveRhsReference, 'function');
  assert.equal(typeof parser.usesNewConditionConstruct, 'function');
  assert.equal(typeof parser.extractCondition, 'function');
  assert.equal(typeof parser.extractIfStep, 'function');
  assert.equal(typeof parser.extractWhenStep, 'function');
});

// ---------------------------------------------------------------------------
// Helper: compile a Task body and return its ordered steps.
// ---------------------------------------------------------------------------
function compileTaskSteps(body, fileName) {
  var src =
    "const el = is.BUTTON.where(idIs('go')).as('Go');\n" +
    "const EncounterTypes = { OFFICE_NOTE: 'office_note', PHONE_NOTE: 'phone_note' };\n" +
    "const HttpStatus = { OK: 200, NOT_FOUND: 404 };\n" +
    "const t = Task((params) => {\n" +
    body + "\n" +
    "}).as('E2EConditionTask');\n";
  var result = parseSource(src, fileName || 'e2e-condition.test.js');
  assert.equal(result.error, null, 'source should compile without a fatal error');
  assert.equal(result.tasks.length, 1, 'exactly one task should be emitted');
  return result.tasks[0].steps;
}

// ---------------------------------------------------------------------------
// (i) + (ii) Nested-path LHS + enum/const (string) RHS
//   DSL: if (encounter.type === EncounterTypes.OFFICE_NOTE) { ... }
//   Emitted descriptor: { path: ['encounter','type'], op: 'equals', value: 'office_note' }
//   Runtime: true when params.encounter.type === 'office_note', else false.
// **Validates: Requirements 3.1, 1.1, 4.6, 5.1**
// ---------------------------------------------------------------------------
test('e2e: nested-path + enum/const string RHS compiles and evaluates correctly', () => {
  var steps = compileTaskSteps(
    "  const { encounter } = params;\n" +
    "  if (encounter.type === EncounterTypes.OFFICE_NOTE) {\n" +
    "    Click(el);\n" +
    "  }\n",
    'e2e-nested-enum.test.js'
  );

  assert.equal(steps.length, 1);
  var cond = steps[0].condition;

  // Parser emit: the descriptor carries the full nested Param_Path, the enum
  // was resolved to its string literal, and no legacy `param` field remains.
  assert.deepEqual(cond, { path: ['encounter', 'type'], op: 'equals', value: 'office_note' });
  assert.equal(typeof cond.value, 'string', 'resolved enum value must stay a string');
  assert.equal('param' in cond, false, 'no legacy param field is emitted');

  // Runtime consume: matching params → true (walks encounter → type).
  assert.equal(
    evaluateCondition(cond, { encounter: { type: 'office_note' } }),
    true,
    'matching nested value evaluates true'
  );

  // Non-matching value → false.
  assert.equal(
    evaluateCondition(cond, { encounter: { type: 'phone_note' } }),
    false,
    'differing nested value evaluates false'
  );

  // Missing intermediate → walk stops at undefined, no throw, → false.
  assert.equal(
    evaluateCondition(cond, {}),
    false,
    'absent intermediate evaluates false without throwing'
  );
});

// ---------------------------------------------------------------------------
// (ii) enum/const NUMERIC RHS resolves to a number, preserving numeric type
//   DSL: if (status === HttpStatus.OK) { ... }
//   Emitted descriptor: { path: ['status'], op: 'equals', value: 200 }  (number)
// **Validates: Requirements 1.1, 5.1, 5.2, 4.6**
// ---------------------------------------------------------------------------
test('e2e: numeric enum/const RHS resolves to a number and evaluates with strict equality', () => {
  var steps = compileTaskSteps(
    "  const { status } = params;\n" +
    "  if (status === HttpStatus.OK) {\n" +
    "    Click(el);\n" +
    "  }\n",
    'e2e-numeric-const.test.js'
  );

  assert.equal(steps.length, 1);
  var cond = steps[0].condition;

  assert.deepEqual(cond, { path: ['status'], op: 'equals', value: 200 });
  assert.equal(typeof cond.value, 'number', 'resolved const value must stay a number');

  // number 200 === number 200 → true.
  assert.equal(evaluateCondition(cond, { status: 200 }), true);
  // string "200" !== number 200 (strict, no coercion) → false.
  assert.equal(evaluateCondition(cond, { status: '200' }), false, 'string "200" must NOT equal number 200');
  // different number → false.
  assert.equal(evaluateCondition(cond, { status: 404 }), false);
});

// ---------------------------------------------------------------------------
// (iii) Numeric literal RHS, strict-equality (the "200" vs 200 case)
//   DSL: if (status === 200) { ... }
//   Emitted descriptor: { path: ['status'], op: 'equals', value: 200 }  (number)
// **Validates: Requirements 5.1, 5.5, 5.6, 4.6**
// ---------------------------------------------------------------------------
test('e2e: numeric literal condition preserves numeric type and evaluates with strict equality', () => {
  var steps = compileTaskSteps(
    "  const { status } = params;\n" +
    "  if (status === 200) {\n" +
    "    Click(el);\n" +
    "  }\n" +
    "  if (status !== 200) {\n" +
    "    Click(el);\n" +
    "  }\n",
    'e2e-numeric-literal.test.js'
  );

  assert.equal(steps.length, 2);

  // === 200 → equals, numeric value preserved (number, not string).
  var eq = steps[0].condition;
  assert.deepEqual(eq, { path: ['status'], op: 'equals', value: 200 });
  assert.equal(typeof eq.value, 'number');

  // !== 200 → notEquals.
  var neq = steps[1].condition;
  assert.deepEqual(neq, { path: ['status'], op: 'notEquals', value: 200 });
  assert.equal(typeof neq.value, 'number');

  // equals: number 200 → true; string "200" → false (no coercion); 404 → false.
  assert.equal(evaluateCondition(eq, { status: 200 }), true);
  assert.equal(evaluateCondition(eq, { status: '200' }), false, 'string "200" must NOT equal number 200');
  assert.equal(evaluateCondition(eq, { status: 404 }), false);

  // notEquals: number 200 → false; string "200" → true (differs in type); 404 → true.
  assert.equal(evaluateCondition(neq, { status: 200 }), false);
  assert.equal(evaluateCondition(neq, { status: '200' }), true, 'string "200" is notEquals number 200');
  assert.equal(evaluateCondition(neq, { status: 404 }), true);
});

// ---------------------------------------------------------------------------
// Emit/consume sync round-trip: a deep nested path round-trips true.
//   DSL: if (encounter.details.code === 200) { ... }
//   Emitted: { path: ['encounter','details','code'], op: 'equals', value: 200 }
// This is the primary guard that the parser's emitted `path` segments are
// exactly what the runtime walker consumes.
// **Validates: Requirements 4.6, 3.1, 3.2**
// ---------------------------------------------------------------------------
test('e2e: deep nested path emit/consume are in sync (matching params round-trip true)', () => {
  var steps = compileTaskSteps(
    "  const { encounter } = params;\n" +
    "  if (encounter.details.code === 200) {\n" +
    "    Click(el);\n" +
    "  }\n",
    'e2e-deep-nested.test.js'
  );

  assert.equal(steps.length, 1);
  var cond = steps[0].condition;
  assert.deepEqual(cond, { path: ['encounter', 'details', 'code'], op: 'equals', value: 200 });

  // Round-trip: matching deep value → true; differing → false; missing → false (no throw).
  assert.equal(evaluateCondition(cond, { encounter: { details: { code: 200 } } }), true);
  assert.equal(evaluateCondition(cond, { encounter: { details: { code: 404 } } }), false);
  assert.equal(evaluateCondition(cond, { encounter: { details: null } }), false);
  assert.equal(evaluateCondition(cond, {}), false);
});

// ---------------------------------------------------------------------------
// When() parity: the When_Form of the nested-path/enum condition produces the
// SAME descriptor and therefore the same runtime result as the `if` form.
// **Validates: Requirements 8.1, 8.2, 4.6**
// ---------------------------------------------------------------------------
test('e2e: When() form produces the same descriptor and runtime result as if', () => {
  var steps = compileTaskSteps(
    "  const { encounter } = params;\n" +
    "  When(encounter.type === EncounterTypes.OFFICE_NOTE, () => {\n" +
    "    Click(el);\n" +
    "  });\n",
    'e2e-when-parity.test.js'
  );

  assert.equal(steps.length, 1);
  var cond = steps[0].condition;

  // Identical descriptor to the `if` form in the first test.
  assert.deepEqual(cond, { path: ['encounter', 'type'], op: 'equals', value: 'office_note' });

  assert.equal(evaluateCondition(cond, { encounter: { type: 'office_note' } }), true);
  assert.equal(evaluateCondition(cond, { encounter: { type: 'phone_note' } }), false);
});

// ---------------------------------------------------------------------------
// Warn-and-skip still emits the spec (Req 6.5): an unresolvable enum reference
// drops only the affected condition; the task is still emitted and other
// conditions still compile. Confirms the pipeline never fails the file.
// **Validates: Requirements 6.5, 8.1**
// ---------------------------------------------------------------------------
test('e2e: unresolvable enum reference warns-and-skips but the spec is still emitted', () => {
  var src =
    "const el = is.BUTTON.where(idIs('go')).as('Go');\n" +
    "const t = Task((params) => {\n" +
    "  const { encounter, status } = params;\n" +
    "  if (encounter.type === UnknownEnum.MISSING) {\n" +   // unresolvable → warn-and-skip
    "    Click(el);\n" +
    "  }\n" +
    "  if (status === 200) {\n" +                            // resolvable → still emitted
    "    Click(el);\n" +
    "  }\n" +
    "}).as('WarnAndSkipTask');\n";
  var result = parseSource(src, 'e2e-warn-and-skip.test.js');

  // The file still compiles and emits the task (no fatal error, no cleared artifacts).
  assert.equal(result.error, null);
  assert.equal(result.tasks.length, 1);

  // Only the resolvable condition survives as a step.
  var steps = result.tasks[0].steps;
  assert.equal(steps.length, 1, 'the unresolvable condition is dropped, the resolvable one remains');
  assert.deepEqual(steps[0].condition, { path: ['status'], op: 'equals', value: 200 });

  // A warning was recorded for the dropped condition.
  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.warnings.length >= 1, 'a warn-and-skip warning is recorded');

  // And the surviving descriptor still round-trips through the runtime.
  assert.equal(evaluateCondition(steps[0].condition, { status: 200 }), true);
  assert.equal(evaluateCondition(steps[0].condition, { status: 201 }), false);
});
