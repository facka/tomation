# Implementation Plan: Data value enum & date-helper support

## Overview

This is a scoped, compile-time-only fix in a single file,
`packages/compiler/src/parser.js`. Two functions change:

- `parseDataTemplate` (~L527): three new value cases are appended **after** the
  existing Case 1–3, which stay byte-identical (Req 7). Case 4 (date-helper
  `CallExpression` → `extractDateHelperCall`), Case 5 (3-level namespaced-enum
  `MemberExpression`, `value.object` is a `MemberExpression` → `String(resolved)`),
  Case 6 (2-level const/enum `MemberExpression`, `value.object` is an `Identifier`
  → `resolveConstMemberExpression`, type-preserving). Order: date-helper first,
  then 3-level, then 2-level, disambiguated on `value.object.type`.
  `extractValueExpression` is never called wholesale (Req 5 — would emit
  `{{...}}` param/data tokens). Unmatched shapes fall through to Warn_And_Skip.
- `validateDataPath` (~L1327): extend the `isPlainObject` guard to also exclude
  `current.type === 'dateHelper'` so a date-helper descriptor is a terminal leaf
  (Req 6).

No runtime change, no DSL type-definition change, no import-resolution change
(`constBindings` is already populated for both import styles). The inline-test-data
spec is not touched.

All automated tests are authored in the existing suite
`packages/compiler/src/parser.test.js` (fast-check + `node:test`, matching the
project convention). Per workspace rules, the implementing agent does **not** run
`node --test` / `npm test`, does **not** run `node -c`, and does **not** start
watch/dev processes — test tasks only CREATE the tests, and the user runs them
manually. The only agent-run verification is a single-shot compile
(`npm run compile:playground`, i.e. `npx tomation compile` in
`examples/playground-tests`).

## Tasks

- [x] 1. Add Case 4 — date-helper `CallExpression` support to `parseDataTemplate`
  - In `packages/compiler/src/parser.js`, inside `parseDataTemplate` (~L527),
    after the existing Case 3 and before any fall-through, add a case: when
    `value.type === 'CallExpression'`, call
    `extractDateHelperCall(value, filePath, warnings)`; if it returns a non-null
    descriptor, assign `template[key] = descriptor` and `continue`.
  - Rely on `extractDateHelperCall` (already exists ~L1475) to produce
    `{ type:'dateHelper', kind, ... }` for both day-offset and month-boundary
    helpers and to push its own argument warnings (too-many-args, non-string
    format, missing/invalid month offset); the descriptor from valid args is
    still stored so the property is not dropped.
  - Do not disturb Case 1 (`Fake.*`, a `CallExpression` with a `MemberExpression`
    callee) which matches earlier; date helpers have a plain `Identifier` callee,
    so the two never collide.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4_

  - [ ]* 1.1 Write property test P1 — day-offset descriptor matches standalone
    - In `packages/compiler/src/parser.test.js`, add a fast-check test
      (`require('fast-check')`, `{ numRuns: 100 }` minimum) tagged
      `// Feature: data-value-enum-datehelper-support, Property 1: Day-offset helper as a Data value matches the standalone descriptor`.
    - Generate a Day_Offset_Helper name (optionally a string `format` arg) used as
      a `Data` property value; assert the stored descriptor deep-equals the
      descriptor `extractDateHelperCall` produces for the same `CallExpression`
      standalone.
    - Write the test only; the user will run it manually.
    - **Property 1 — Validates: Requirements 3.1, 3.2**

  - [ ]* 1.2 Write property test P2 — month-boundary descriptor matches standalone
    - In `parser.test.js`, add a fast-check test (`{ numRuns: 100 }` minimum)
      tagged `// Feature: data-value-enum-datehelper-support, Property 2: Month-boundary helper as a Data value matches the standalone descriptor`.
    - Generate a Month_Boundary_Helper name with an integer offset (optionally a
      trailing string `format` arg); assert the stored descriptor deep-equals the
      standalone `extractDateHelperCall` descriptor.
    - Write the test only; the user will run it manually.
    - **Property 2 — Validates: Requirements 4.1, 4.2**

  - [ ]* 1.3 Write unit tests for Case 4 date-helper edge cases
    - In `parser.test.js`, add example-based tests: zero-arg day offset (no
      `format`); day offset with string `format`; day offset with non-string
      format (warning + no `format`); day offset with >1 arg (warning + descriptor
      from first arg); month boundary with integer offset; month boundary with
      negative offset (`UnaryExpression`); month boundary with trailing string
      `format`; month boundary missing offset (warning + `monthOffset: 0`); month
      boundary with >2 args (warning).
    - Write the tests only; the user will run them manually.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4_

- [x] 2. Add Case 5 — three-level namespaced-enum `MemberExpression` support
  - In `parseDataTemplate`, after Case 4, add a case: when
    `value.type === 'MemberExpression'` AND `value.object.type === 'MemberExpression'`,
    resolve `constBindings[nsName][enumName][memberKey]` using the same logic as
    the existing three-level branch in `extractValueExpression` (~L1742),
    supporting dot access and string-literal computed keys.
  - On a match, assign `template[key] = String(resolved)` and `continue`.
  - On no matching entry, a non-string computed key, or a numeric/computed key,
    treat as unresolvable: emit exactly one Warn_And_Skip warning identifying the
    unresolved property and drop the property (do not assign).
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.3_

  - [ ]* 2.1 Write property test P4 — three-level resolves to String-coerced value
    - In `parser.test.js`, add a fast-check test (`{ numRuns: 100 }` minimum)
      tagged `// Feature: data-value-enum-datehelper-support, Property 4: Three-level namespaced enum resolves to the String-coerced value`.
    - Generate a `constBindings` namespace entry `Namespace.Enum.KEY` (dot access
      and string-literal computed key) used as a `Data` value; assert the stored
      value equals `String(constBindings[Namespace][Enum][KEY])`.
    - Write the test only; the user will run it manually.
    - **Property 4 — Validates: Requirements 1.1, 1.2**

  - [ ]* 2.2 Write unit tests for Case 5 three-level edge cases
    - In `parser.test.js`, add example-based tests: dot access resolves and stores
      `String(value)`; string-literal computed access resolves identically;
      missing member → one warning + dropped; non-string computed key (numeric /
      computed identifier) → dropped.
    - Write the tests only; the user will run them manually.
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3. Add Case 6 — two-level const/enum `MemberExpression` support
  - In `parseDataTemplate`, after Case 5, add a case: when
    `value.type === 'MemberExpression'` AND `value.object.type === 'Identifier'`,
    call `resolveConstMemberExpression(value, constBindings, filePath, warnings)`
    (~L484); if it returns a non-null string/number/boolean, assign
    `template[key] = resolved` with its **original primitive type preserved**
    (not stringified) and `continue`.
  - Rely on `resolveConstMemberExpression` for warning behavior: it pushes one
    "Unknown property" warning when the object is a known binding but the member
    is missing (Req 2.2), and returns null without a warning when the object
    identifier is not a known binding (Req 2.3). In both null cases, drop the
    property.
  - This case also covers a named-import POM enum (`TaskTypes.KEY`) since
    `constBindings` already holds its members (Req 2.4).
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.3_

  - [ ]* 3.1 Write property test P3 — two-level const resolves type-preserved
    - In `parser.test.js`, add a fast-check test (`{ numRuns: 100 }` minimum)
      tagged `// Feature: data-value-enum-datehelper-support, Property 3: Two-level const member resolves type-preserved and equal to a direct literal`.
    - Generate a `constBindings` entry `Const.MEMBER` bound to a string/number/
      boolean; assert `Const.MEMBER` as a `Data` value stores a value strictly
      equal (value and primitive type) to the same literal written directly.
    - Write the test only; the user will run it manually.
    - **Property 3 — Validates: Requirements 2.1, 2.4**

  - [ ]* 3.2 Write property test P5 — named-import 2-level and default-import 3-level agree
    - In `parser.test.js`, add a fast-check test (`{ numRuns: 100 }` minimum)
      tagged `// Feature: data-value-enum-datehelper-support, Property 5: Named-import 2-level and default-import 3-level refs to the same member yield equal stored values`.
    - For any member value `v`, build a 2-level ref (`TaskTypes.KEY`,
      `constBindings['TaskTypes'][KEY] === v`) and a 3-level ref
      (`NewTaskPage.TaskTypes.KEY`, `constBindings['NewTaskPage']['TaskTypes'][KEY] === v`);
      assert `String(stored_2level) === String(stored_3level) === String(v)`.
    - Write the test only; the user will run it manually.
    - **Property 5 — Validates: Requirements 1.1, 2.1, 2.4**

  - [ ]* 3.3 Write unit tests for Case 6 two-level edge cases
    - In `parser.test.js`, add example-based tests: const member resolves with
      primitive type preserved (number stays number, boolean stays boolean);
      named-import enum member resolves identically; known object + missing member
      → one "Unknown property" warning + dropped; object identifier not in
      `constBindings` → dropped with no warning; deeper-than-two-level / computed
      member that is not a valid 3-level ref → dropped.
    - Write the tests only; the user will run them manually.
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 4. Enforce Req 5 no-tokenization restriction and verify fall-through
  - Confirm in `parseDataTemplate` that no new case calls `extractValueExpression`
    wholesale and that a bare `Identifier` value and any `MemberExpression` whose
    shape is neither 2-level nor 3-level (and any shape-matching ref that does not
    resolve) fall through to Warn_And_Skip with no Param_Token / Data_Var_Token
    ever emitted.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 4.1 Write property test P6 — unsupported shapes dropped and never tokenized
    - In `parser.test.js`, add a fast-check test (`{ numRuns: 100 }` minimum)
      tagged `// Feature: data-value-enum-datehelper-support, Property 6: Bare identifier or unsupported member chain is dropped and never tokenized`.
    - Generate bare identifiers, non-enum member chains, and shape-matching refs
      that do not resolve; assert the key is absent from the parsed template AND
      the serialized parsed template contains no `{{` token anywhere.
    - Write the test only; the user will run it manually.
    - **Property 6 — Validates: Requirements 5.1, 5.2, 5.3, 5.5**

  - [ ]* 4.2 Write unit tests for the Req 5 guard
    - In `parser.test.js`, add example-based tests: bare `Identifier` value →
      dropped, serialized template has no `{{` token; non-enum member chain →
      dropped, no token.
    - Write the tests only; the user will run them manually.
    - _Requirements: 5.1, 5.2, 5.5_

- [ ] 5. Checkpoint — review `parseDataTemplate` cases
  - Ensure all tests pass, ask the user if questions arise. (The user runs the
    tests manually; confirm Cases 4–6 ordering, type-preservation asymmetry, and
    Warn_And_Skip behavior are in place before continuing.)

- [x] 6. Make date-helper descriptors terminal leaves in `validateDataPath`
  - In `packages/compiler/src/parser.js`, in `validateDataPath` (~L1327), extend
    the `isPlainObject` predicate to also exclude `current.type === 'dateHelper'`
    (alongside the existing `current.type !== 'fake'` exclusion) so a date-helper
    descriptor is a terminal leaf: a path ending at it is valid with no warning,
    and a path descending into it yields exactly one "Unknown data path" warning
    via the existing warn-and-return, without blocking compilation.
  - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 6.1 Write property test P8 — date-helper leaf validation
    - In `parser.test.js`, add a fast-check test (`{ numRuns: 100 }` minimum)
      tagged `// Feature: data-value-enum-datehelper-support, Property 8: Date-helper leaf validation — valid at the leaf, one warning on descent`.
    - For a parsed template with a date-helper descriptor at key `k` owned by Data
      name `d`: assert validating `d.k` produces zero warnings and validating any
      `d.k.s1...sn` (n ≥ 1) produces exactly one "Unknown data path" warning.
    - Write the test only; the user will run it manually.
    - **Property 8 — Validates: Requirements 6.1, 6.2**

  - [ ]* 6.2 Write unit tests for `validateDataPath` change
    - In `parser.test.js`, add example-based tests: path ending at a date helper →
      no warning; path descending into a date helper → exactly one "Unknown data
      path" warning; confirm `Fake.*` and literal leaves still behave as before.
    - Write the tests only; the user will run them manually.
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 7. Author the backward-compatibility golden property test (Req 7)
  - [ ]* 7.1 Write property test P7 — existing shapes byte-identical (golden)
    - In `parser.test.js`, add a fast-check test (`{ numRuns: 100 }` minimum)
      tagged `// Feature: data-value-enum-datehelper-support, Property 7: Existing Fake / literal / nested templates are byte-identical (golden)`.
    - Generate `Data` templates whose values are drawn only from the three
      pre-existing shapes (`Fake.*(...)`, static string/number/boolean literals,
      nested object expressions); assert the post-change parsed template
      deep-equals a reference computed by the pre-change three-case contract.
    - Write the test only; the user will run it manually.
    - **Property 7 — Validates: Requirements 7.1, 7.2**

  - [ ]* 7.2 Write unit tests for backward compatibility
    - In `parser.test.js`, add example-based tests: a mixed template of
      Fake/literal/nested values parses to the expected object; a template mixing
      old and new shapes keeps all other successfully resolved properties when one
      property is dropped.
    - Write the tests only; the user will run them manually.
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 8. Add the single-shot compile fixture and verify
  - [x] 8.1 Create the reproduction fixture under `examples/playground-tests`
    - Add a POM that exports an enum (e.g. `TaskTypes` with
      `AUTHORIZATION_REQUEST`), imported two ways across two `Data` templates:
      default import → three-level `NewTaskPage.TaskTypes.AUTHORIZATION_REQUEST`;
      named import (`import NewTaskPage, { TaskTypes } from ...`) → two-level
      `TaskTypes.AUTHORIZATION_REQUEST`.
    - Include a `nextWeek('MM/DD/YYYY')` date-helper value and a static literal
      (`provider: 'Provider1'`) in the `Data` templates. Keep files consistent
      with the existing `examples/playground-tests` structure (`pom/`, `data/`).
    - _Requirements: 1.1, 2.1, 2.4, 3.2, 7.1_

  - [x] 8.2 Run the single-shot compile and confirm the fix end-to-end
    - Run `npm run compile:playground` (i.e. `npx tomation compile` in
      `examples/playground-tests`) exactly once — no watch/dev process. Confirm
      the compiled spec includes `taskType` (both import styles) and `dueDate`
      with no "Unknown data property" / "Unknown data path" warnings for those
      keys. This is the only agent-run verification.
    - _Requirements: 1.1, 2.1, 2.4, 3.2, 7.4_

- [ ] 9. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise. (The user runs the
    unit and property tests manually; the agent has run only the single-shot
    compile.)

## Notes

- Tasks marked with `*` are optional test-authoring sub-tasks. Per workspace
  rules, these tasks only CREATE the tests — the agent does not run
  `node --test` / `npm test`, `node -c`, or any watch/dev process; the user runs
  the tests manually.
- Top-level tasks are never marked optional. All test sub-tasks are marked `*`.
- The only agent-run verification is the single-shot `npm run compile:playground`
  in task 8.2.
- Each task references the specific requirements it satisfies for traceability.
- The type-preservation asymmetry is intentional: Case 5 (3-level) stores
  `String(resolved)`; Case 6 (2-level) preserves the original primitive type.
- All work is confined to `packages/compiler/src/parser.js`,
  `packages/compiler/src/parser.test.js`, and the `examples/playground-tests`
  compile fixture.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["8.1"] },
    { "id": 1, "tasks": ["1.1", "1.2", "1.3", "2.1", "2.2", "3.1", "3.2", "3.3", "4.1", "4.2", "6.1", "6.2", "7.1", "7.2"] },
    { "id": 2, "tasks": ["8.2"] }
  ]
}
```
