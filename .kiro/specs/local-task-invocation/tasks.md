# Implementation Plan: Local Task Invocation

## Overview

This plan implements local task invocation support — allowing tasks in a POM file to call other locally-declared tasks using bare function-call syntax (`taskName()` or `taskName({...params})`). The implementation touches the parser's `extractStep` default case, the `declaredTaskNames` first-pass collection in `parseSource`, and the POM extractor's `resolveStepRefs` namespace prefixing. Most core logic is already in place; this plan focuses on completing edge cases, wiring, and comprehensive testing.

Only ObjectExpression arguments are supported for parameter passing. Bare Identifier arguments (e.g., `login(params)`) are NOT supported and must return `null` from `extractStep`, triggering an "Unrecognized statement" warning.

## Tasks

- [x] 1. Ensure parser `extractStep` default case handles all local invocation patterns
  - [x] 1.1 Verify and complete the `extractStep` default case for bare identifier calls
    - In `packages/compiler/src/parser.js`, confirm the `default` case in the `switch(fnName)` block within `extractStep` handles:
      - Zero-argument calls: `taskName()` → `{ action: 'task', name: fnName }`
      - ObjectExpression argument: `taskName({ key: 'val' })` → `{ action: 'task', name: fnName, params: {...} }`
      - Returns `null` when `declaredTaskNames` is missing or doesn't contain `fnName`
      - Any other argument form (including bare Identifier like `login(params)`) returns `null` which triggers "Unrecognized statement" warning
    - **IMPORTANT:** The current code (lines 702-704 in parser.js) has an `Identifier` handling block that returns `{ action: 'task', name: fnName }` for bare Identifier arguments. This block MUST be removed so that bare Identifiers fall through to `return null`.
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2_

  - [x] 1.2 Verify `extractTaskInvocationParams` handles shorthand properties with template references
    - In `packages/compiler/src/parser.js`, confirm that shorthand ObjectExpression properties (e.g., `{username, password}`) where the value identifier matches a tracked param emit `{{variableName}}` template values
    - Confirm literal string, numeric, and boolean values are preserved as-is
    - _Requirements: 2.1, 3.1, 3.2_

- [x] 2. Ensure `parseSource` first-pass collects `declaredTaskNames` before body processing
  - [x] 2.1 Verify the `declaredTaskNames` collection walk in `parseSource`
    - In `packages/compiler/src/parser.js`, confirm the AST walk collects variable names from both `const x = Task(fn)` and `const x = Task(fn).as('Label')` patterns into the `declaredTaskNames` Set before any task/test body extraction occurs
    - Confirm this enables forward-reference recognition (task A calls task B, where B is declared after A)
    - _Requirements: 6.1, 6.2_

  - [x] 2.2 Ensure `declaredTaskNames` is passed to `extractTask` and `extractTest`
    - In `packages/compiler/src/parser.js`, verify that the `declaredTaskNames` Set is threaded through to `extractTask`, `extractSteps`, and `extractStep` calls so that both task bodies and test bodies can resolve local invocations
    - _Requirements: 5.1, 5.2_

- [x] 3. Ensure POM extractor `resolveStepRefs` prefixes local task names
  - [x] 3.1 Verify namespace prefixing logic in `resolveStepRefs`
    - In `packages/compiler/src/pom.js`, confirm the `resolveStepRefs` function:
      - Prefixes task step names that don't contain `__` and match `localTaskNames` with `Namespace__`
      - Leaves names already containing `__` unchanged (cross-file references)
      - Leaves names not matching `localTaskNames` unchanged (pass-through)
    - _Requirements: 4.1, 4.2_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Write unit tests for local task invocation parsing
  - [x] 5.1 Add unit tests for local task invocation with various argument forms
    - In `packages/compiler/src/task-test-parser.test.js`, add tests for:
      - Local invocation with shorthand object params referencing tracked params → `params: { username: '{{username}}' }`
      - Local invocation with inline string literal params → `params: { username: 'admin' }`
      - Local invocation with inline numeric literal params → `params: { retry: 3 }`
      - Local invocation with bare Identifier argument (e.g., `login(params)`) → produces "Unrecognized statement" warning, no task step emitted
    - _Requirements: 2.1, 2.2, 3.1, 3.2_

  - [x] 5.2 Add unit tests for forward reference recognition
    - In `packages/compiler/src/task-test-parser.test.js`, add a test where a task declared first invokes a task declared later in the same file, confirming the invocation is recognized
    - _Requirements: 6.1, 6.2_

  - [x] 5.3 Add unit tests for test body local task invocation with params
    - In `packages/compiler/src/task-test-parser.test.js`, add a test where a `Test(...)` body invokes a locally declared task with an ObjectExpression argument and confirm `params` is extracted. Also add a test confirming bare Identifier argument in a test body produces a warning.
    - _Requirements: 5.1, 5.2_

- [ ] 6. Write property-based tests for local task invocation
  - [ ]* 6.1 Write property test for bare call recognition by `declaredTaskNames` membership
    - **Property 1: Bare call recognition is determined by Declared_Task_Names membership**
    - **Validates: Requirements 1.1, 1.2**
    - In `packages/compiler/src/pom.test.js`, using `fast-check`:
      - Generate random valid JS identifiers
      - Build source with `const X = Task(() => { Y() })` where Y is toggled in/out of declared tasks
      - Assert: task step emitted iff Y is declared; warning emitted iff Y is not declared

  - [ ]* 6.2 Write property test for object literal params preservation
    - **Property 2: Object literal params are preserved through parsing**
    - **Validates: Requirements 3.1, 3.2**
    - In `packages/compiler/src/pom.test.js`, using `fast-check`:
      - Generate random key-value pairs (string and numeric literals)
      - Build source invoking a local task with an ObjectExpression of those pairs
      - Assert: emitted `params` object matches generated key-value pairs exactly

  - [ ]* 6.3 Write property test for namespace resolution prefixing
    - **Property 3: Namespace resolution prefixes local names and preserves cross-file names**
    - **Validates: Requirements 4.1, 4.2**
    - In `packages/compiler/src/pom.test.js`, using `fast-check`:
      - Generate task steps with names containing or not containing `__`
      - Run through `extractPom` with a `localTaskNames` map
      - Assert: names without `__` that match local tasks get prefixed; names with `__` stay unchanged

  - [ ]* 6.4 Write property test for forward reference recognition
    - **Property 4: Forward references are recognized regardless of declaration order**
    - **Validates: Requirements 6.1, 6.2**
    - In `packages/compiler/src/pom.test.js`, using `fast-check`:
      - Generate two task names A and B, randomize declaration order
      - Build source where A invokes B
      - Assert: invocation is recognized as a task step regardless of order

  - [ ]* 6.5 Write property test for parse-then-extract determinism
    - **Property 5: Parse-then-extract pipeline is deterministic**
    - **Validates: Requirements 7.1, 7.2**
    - In `packages/compiler/src/pom.test.js`, using `fast-check`:
      - Generate valid source containing local task invocations
      - Parse and extract POM N times (N ≥ 2)
      - Assert: all N results are deeply equal

- [ ] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses Node.js built-in test runner (`node:test`) and `fast-check` for property tests
- Existing tests in `task-test-parser.test.js` already cover bare local invocation with no args and numeric params — new tests extend coverage to shorthand params, forward refs, and test-body invocations
- **Bare Identifier arguments (e.g., `login(params)`) are NOT a supported invocation form.** They must return `null` from `extractStep` and produce an "Unrecognized statement" warning. The existing Identifier handling block (lines 702-704 in parser.js) must be removed.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "2.2", "3.1"] },
    { "id": 1, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 2, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5"] }
  ]
}
```
