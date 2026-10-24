# Implementation Plan: Inline Data enum-member value bugfix

## Overview

This is a surgical, compile-time-only fix confined to ONE production function:
`buildConstBindings` in `packages/compiler/src/parser.js` (~L205). When a
`const X = Data({...})` (or `Data({...}).as(name)`) declaration is seen, unwrap
it via the existing `unwrapDataCall` helper (~L744) to reach the template's
`ObjectExpression` argument (`dataCall.arguments[0]`), then extract its
PRIMITIVE-LITERAL leaf members into `bindings[X]` using the exact same primitive
extraction already applied to plain object literals
(`extractString(prop.value) ?? extractNumber(...) ?? extractBoolean(...)`,
registering `bindings[X]` only when `hasLiterals` is true). Non-primitive leaves
(`Fake.*`, nested objects, date-helpers) are not primitive literals, so they are
naturally skipped and never become resolvable const members.

No changes anywhere else: Case 5 (3-level `Ns.T.M`), Case 6 (2-level `T.M`),
`resolveConstMemberExpression`, the cross-file import lookup, and
`resolveDefaultExportNamespace` all read from `constBindings` and resolve the
reference automatically once the binding exists. `__scalars` handling and the
post-walk TS-enum merge (`buildEnumBindings`, non-overwriting) are preserved
unchanged.

This bugfix follows the exploratory methodology: author tests that surface the
bug FIRST (they FAIL on unfixed code), author preservation tests that capture
current good behavior (they PASS on unfixed code), THEN apply the fix.

All automated tests are authored in the existing suite
`packages/compiler/src/parser.test.js` (fast-check + `node:test`, matching the
project convention). Per workspace rules, the implementing agent does **not**
run `node --test` / `npm test`, does **not** run `node -c`, and does **not**
start watch/dev processes — test tasks only CREATE the tests, and the user runs
them manually. The ONLY agent-run verification is a single-shot compile
(`npm run compile:playground`, i.e. `npx tomation compile` in
`examples/playground-tests`).

## Tasks

- [x] 1. Author the Bug Condition exploration property test P1 (BEFORE the fix)
  - **Property 1: Bug Condition** - Data-template member resolves to its literal value
  - **CRITICAL**: This test MUST FAIL on the UNFIXED code — the failure confirms
    the bug exists. DO NOT attempt to fix the test or the code when it fails here.
  - **NOTE**: This test encodes the EXPECTED behavior; it will validate the fix
    when it passes after implementation (reused unchanged in task 3.2).
  - **GOAL**: Surface counterexamples demonstrating that a `const X = Data({...})`
    template used as an enum-like value source drops the referenced key.
  - In `packages/compiler/src/parser.test.js`, add a fast-check test
    (`require('fast-check')`, `{ numRuns: 100 }` minimum) tagged
    `// Feature: inline-data-enum-member-value, Property 1: Data-template member resolves to its literal value`.
  - Generate `Data({...})` templates with primitive-literal leaf members
    (string / number / boolean) referenced as a value `T.M` (two-level) and
    `Ns.T.M` (three-level), for both imported and locally-declared `const T`.
    For deterministic reproducibility, also scope the property to the concrete
    failing cases drawn from the design: `taskType: TaskTypes.Type1`
    (two-level string → `"Type1"`), `count: N.Zero` where `N = Data({ Zero: 0 })`
    (two-level primitive-type preservation → number `0`, not `"0"`), and a
    three-level namespaced reference (string-coerced per Case 5).
  - Assert for every generated input that the parsed property resolves to the
    referenced leaf's literal value, the property key is PRESENT in the compiled
    template, and NO `Unknown data property` (two-level) /
    `Unknown namespaced enum reference` (three-level) warning is emitted for that
    key. Two-level preserves the member's primitive type; three-level follows the
    existing Case 5 string-coercion.
  - **EXPECTED OUTCOME on UNFIXED code**: Test FAILS (keys dropped + warnings) —
    this is correct and proves the bug exists.
  - Document the counterexamples found (e.g. `taskType` absent with
    `Unknown data property "taskType"`) to confirm the root cause is that
    `buildConstBindings` skips the `Data()` `CallExpression` init.
  - Write the test only; the user will run it manually. Mark this task complete
    when the test is authored, run by the user, and the failure is documented.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 1.1 Author supporting unit tests for the Bug Condition
    - In `parser.test.js`, add example-based tests that assert the UNFIXED
      behavior as counterexamples: imported two-level `TaskTypes.Type1` drops the
      key + warns; local two-level `const T = Data({ A: 'a' })` then `x: T.A`
      drops the key; three-level `Ns.TaskTypes.Type1` drops the key +
      `Unknown namespaced enum reference`; primitive-type edge
      `const N = Data({ Zero: 0 })` then `count: N.Zero` drops the key (must
      become number `0` after the fix).
    - Write the tests only; the user runs them manually.
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Author the Preservation property test P2 (BEFORE the fix)
  - **Property 2: Preservation** - Non-buggy resolution paths unchanged
  - **IMPORTANT**: Follow the observation-first methodology — run the UNFIXED
    code for non-bug-condition inputs, record the actual outputs, then write
    property tests asserting those observed outputs across the input domain.
  - In `parser.test.js`, add a fast-check test (`{ numRuns: 100 }` minimum)
    tagged
    `// Feature: inline-data-enum-member-value, Property 2: Non-buggy resolution paths unchanged`.
  - Generate inputs where `isBugCondition` is FALSE and assert the fixed output
    equals the original observed output for each preserved path:
    TS enum member references (3.1); plain const-object-literal members
    `const X = { ... }` → `X.K` (3.2); `Fake.*` expressions (3.3); nested-object
    property values (3.4); date-helper expressions like `nextWeek('MM/DD/YYYY')`
    (3.5); `{{data.*}}` step tokens resolved via the separate `dataVars`
    mechanism (3.6).
  - Include the dual-role case: a `Data({...})` template whose SAME variable is
    used BOTH as a value source (`T.M`) AND as a `{{data.*}}` step token — assert
    both roles resolve correctly (the two maps `constBindings` / `dataVars` are
    independent).
  - **EXPECTED OUTCOME on UNFIXED code**: Tests PASS (this confirms the baseline
    behavior that must be preserved after the fix). They must still PASS after
    the fix (reused unchanged in task 3.3).
  - Write the test only; the user runs it manually. Mark this task complete when
    the tests are authored, run by the user, and passing on the unfixed code.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 2.1 Author supporting unit tests for Preservation
    - In `parser.test.js`, add example-based tests observing and asserting
      unchanged behavior: a TS enum member still resolves to its value; a plain
      const-object member still resolves; a `Fake.*` value shape is unchanged; a
      nested object value is unchanged; `nextWeek('MM/DD/YYYY')` is unchanged; a
      `{{data.*}}` token resolves via `dataVars`; and (dual-role) one Data
      template used as both `T.M` and `{{data.*}}` resolves in both roles.
    - Additionally assert `__scalars` (e.g. `const API = '...'`) and the TS-enum
      merge are unchanged in the presence of a `Data()` const.
    - Write the tests only; the user runs them manually.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix: register `Data({...})` template primitive members in `buildConstBindings`

  - [ ] 3.1 Implement the fix in `buildConstBindings`
    - In `packages/compiler/src/parser.js`, in `buildConstBindings` (~L205), for
      each `const` declarator whose `initNode` is NOT an `ObjectExpression`,
      attempt `unwrapDataCall(initNode)` (~L744). If it returns a non-null
      `{ dataCall, asArg }`, use `dataCall.arguments[0]` as the candidate
      `ObjectExpression` (covers both `Data({...})` and `Data({...}).as(name)`).
    - Extract ONLY primitive-literal leaf members, reusing the exact per-property
      logic already used for plain object literals: key via `Identifier` name or
      `Literal` value; value via
      `extractString(prop.value) ?? extractNumber(prop.value) ?? extractBoolean(prop.value)`.
      Set `bindings[varName][key] = val` only for primitive leaves, and register
      `bindings[varName]` only when `hasLiterals` is true. Nested objects,
      `Fake.*` calls, and date-helper `CallExpression`s yield null and are
      naturally skipped.
    - Preserve `__scalars` handling: the scalar-const branch runs before the
      guard and is untouched; a `Data()` init is not a scalar so
      `extractString/extractNumber` of the `CallExpression` yields null.
    - Preserve the post-walk TS-enum merge (`buildEnumBindings`) with its existing
      non-overwriting "do not overwrite an existing key" semantics.
    - Make NO changes to `resolveConstMemberExpression`, Case 5, Case 6, the
      cross-file import lookup, or `resolveDefaultExportNamespace` — they resolve
      automatically once the binding exists.
    - _Bug_Condition: isBugCondition(X) — X.value is a member expression `T.M` / `Ns.T.M` whose base resolves to a `Data({...})` template with a primitive-literal leaf (from design)_
    - _Expected_Behavior: resolve the property to the referenced leaf's literal value, key present, no `Unknown data property` warning (from design Property 1)_
    - _Preservation: TS enums, plain const objects, `Fake.*`, nested objects, date-helpers, `{{data.*}}` tokens unchanged (from design Property 2)_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ] 3.2 Verify the Bug Condition exploration test P1 now passes
    - **Property 1: Expected Behavior** - Data-template member resolves to its literal value
    - **IMPORTANT**: Re-run the SAME test authored in task 1 — do NOT write a new
      test. That test encodes the expected behavior; its passing confirms the fix.
    - The user runs the P1 test from task 1 on the FIXED code.
    - **EXPECTED OUTCOME**: Test PASSES (confirms the bug is fixed — keys present,
      literal values resolved, no `Unknown data property` warnings; two-level
      preserves primitive type, three-level is string-coerced).
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ] 3.3 Verify the Preservation tests P2 still pass
    - **Property 2: Preservation** - Non-buggy resolution paths unchanged
    - **IMPORTANT**: Re-run the SAME tests authored in task 2 — do NOT write new
      tests.
    - The user runs the P2 tests from task 2 on the FIXED code.
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in TS enums,
      const objects, `Fake.*`, nested objects, date-helpers, `{{data.*}}` tokens,
      `__scalars`, and the enum merge).
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Extend the existing fixture to cover the local-const and dual-role cases
  - The reproduction fixture ALREADY exists and already reproduces the imported
    two-level case: `examples/playground-tests/data/task-types.data.ts`
    (`const TaskTypes = Data({ Type1: 'Type1', Type2: 'Type2' })`, default
    export) and `examples/playground-tests/tests/new-task.test.ts` (inline
    `const newTaskDefault = Data({ taskType: TaskTypes.Type1, provider: 'Provider1', dueDate: nextWeek('MM/DD/YYYY') })`).
    No new fixture file is needed for that case.
  - EDIT `examples/playground-tests/tests/new-task.test.ts` ONLY (no test
    runner) to minimally also exercise: (a) the LOCAL-const value-source case —
    a locally-declared `const LocalTypes = Data({ A: 'a', B: 'b' })` then a Data
    template property `x: LocalTypes.A`; and (b) the DUAL-ROLE case — a Data
    template used both as a `T.M` value source AND as a `{{data.*}}` step token
    in a step, confirming both roles coexist. Keep edits consistent with the
    existing `examples/playground-tests` structure and style.
  - This task EDITS fixtures only — it does NOT run any test runner.
  - _Requirements: 2.2, 3.6_

- [x] 5. Checkpoint — review the fix and authored tests
  - Ensure all authored tests pass (the user runs the unit and property tests
    manually; ask the user if questions arise). Confirm the fix is confined to
    `buildConstBindings`, that primitive-only extraction is reused, and that
    `__scalars` / the TS-enum merge are intact before the final verification.

- [x] 6. Final verification — single-shot compile (the only agent-run verification)
  - Run `npm run compile:playground` (i.e. `npx tomation compile` in
    `examples/playground-tests`) exactly ONCE — no watch/dev process.
  - Confirm `newTaskDefault.taskType` resolves to the literal `"Type1"` and that
    `dueDate` and `provider` are still present, with NO `Unknown data property`
    warning for `taskType`. Also confirm the fixture's local-const and dual-role
    additions compile without `Unknown data property` warnings.
  - This is the ONLY agent-run verification per workspace rules.
  - _Requirements: 2.1, 2.4_

## Notes

- Tasks marked with `*` are optional test-authoring sub-tasks. Per workspace
  rules, every test task only CREATES/authors the tests — the agent does NOT run
  `node --test` / `npm test`, `node -c`, or any watch/dev process; the USER runs
  the tests manually.
- Top-level tasks are never marked optional. Test-authoring sub-tasks are marked
  `*`.
- The ONLY agent-run verification is the single-shot `npm run compile:playground`
  in task 6.
- Exploration (P1, task 1) and preservation (P2, task 2) tests are STANDALONE
  tasks authored BEFORE the fix. P1 must FAIL on unfixed code (confirms the bug);
  P2 must PASS on unfixed code (captures the baseline). Both are reused unchanged
  after the fix (tasks 3.2 / 3.3).
- Property tests use the `**Property N:**` format so hover status works:
  Property 1 = Bug Condition / Expected Behavior; Property 2 = Preservation.
- The type-preservation asymmetry is intentional and inherited from the existing
  resolvers: two-level `T.M` (Case 6) preserves the member's primitive type;
  three-level `Ns.T.M` (Case 5) stores the String-coerced value.
- All production work is confined to `buildConstBindings` in
  `packages/compiler/src/parser.js`. Authored tests live in
  `packages/compiler/src/parser.test.js`. Fixture edits are limited to
  `examples/playground-tests/tests/new-task.test.ts` (and the already-existing
  `examples/playground-tests/data/task-types.data.ts`).
- Each task references the specific bugfix.md clause numbers (1.x / 2.x / 3.x) it
  satisfies for traceability.
