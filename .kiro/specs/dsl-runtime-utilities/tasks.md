# Implementation Plan: DSL Runtime Utilities

## Overview

This plan implements date helper functions and runtime template strings for the Tomation DSL. The work is split into three layers: DSL stubs and type declarations (so test authors get editor support), compiler parsing (recognizing new expressions and emitting descriptors), and runtime resolution (evaluating descriptors at execution time). Property-based tests use fast-check against the pure transformation functions.

## Tasks

- [x] 1. Add date helper stubs and type declarations
  - [x] 1.1 Add date helper function stubs to `packages/dsl/index.js`
    - Add stub functions for `today`, `tomorrow`, `yesterday`, `nextWeek`, `lastWeek`, `nextMonth`, `lastMonth` (each accepts an optional format string, returns a string placeholder)
    - Add stub functions for `firstDateOfMonth(offset, format?)` and `lastDateOfMonth(offset, format?)`
    - Export all new functions from `module.exports`
    - _Requirements: 1.1, 1.2, 7.1, 7.2_

  - [x] 1.2 Add TypeScript declarations for date helpers in `packages/dsl/globals.d.ts`
    - Declare global functions for all day-offset helpers accepting `(format?: string): string`
    - Declare global functions for month-boundary helpers accepting `(offset: number, format?: string): string`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 1.3 Add TypeScript declarations in `packages/dsl/index.d.ts`
    - Add exported function declarations matching the globals for day-offset and month-boundary helpers
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 2. Implement compiler parsing for date helpers
  - [x] 2.1 Add `extractValueExpression` function to `packages/compiler/src/parser.js`
    - Implement the new `extractValueExpression(node, filePath, warnings)` function that handles string literals, template literals, date helper calls, and identifier references
    - Define `DAY_OFFSET_HELPERS` map (`today:0`, `tomorrow:1`, `yesterday:-1`, `nextWeek:7`, `lastWeek:-7`, `nextMonth:30`, `lastMonth:-30`)
    - Define `MONTH_BOUNDARY_HELPERS` map (`firstDateOfMonth:'first'`, `lastDateOfMonth:'last'`)
    - Implement `extractDateHelperCall(node, filePath, warnings)` to build date helper descriptors
    - Return plain strings for string literals and zero-expression templates; return descriptor objects for date helpers
    - Emit warnings for invalid arguments (non-string format, missing integer offset, extra args)
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 3.1, 3.2, 3.5, 3.6, 3.7, 4.1, 4.4, 4.5_

  - [ ]* 2.2 Write property test for day-offset descriptor emission
    - **Property 1: Compiler emits correct day-offset descriptors**
    - Generate random day-offset helper names and optional format strings, verify descriptor has correct `type`, `kind`, `offset`, and `format` fields
    - **Validates: Requirements 1.3, 1.4, 3.1, 4.1, 8.2**

  - [ ]* 2.3 Write property test for month-boundary descriptor emission
    - **Property 2: Compiler emits correct month-boundary descriptors**
    - Generate random integer offsets, boundary type, and optional format strings, verify descriptor has correct `type`, `kind`, `boundary`, `monthOffset`, and `format` fields
    - **Validates: Requirements 1.5, 3.2, 4.1, 8.3**

  - [x] 2.4 Implement `extractRuntimeTemplate` function in `packages/compiler/src/parser.js`
    - Handle TemplateLiteral nodes with ≥1 expression, building the `parts` array
    - Classify each expression: Identifier → `{type:"param", name}`, date helper call → nested dateHelper descriptor, arithmetic → `{type:"expression", source}`
    - Emit warnings for unsupported expression types with file path and line number
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 4.2, 4.3, 4.4, 8.4, 8.5_

  - [ ]* 2.5 Write property test for runtime template descriptor emission
    - **Property 7: Compiler emits correct runtime template descriptors**
    - Generate random template structures (N expressions, mixed types), verify parts array has `2N+1` elements with correct interleaving
    - **Validates: Requirements 5.1, 5.3, 5.4, 5.5, 8.4, 8.5**

  - [x] 2.6 Wire `extractValueExpression` into `extractStep` in `packages/compiler/src/parser.js`
    - Replace calls to `extractStringOrTemplate` with `extractValueExpression` for value arguments of Type, TypePassword, Select, AssertHasText, Navigate, and Manual actions
    - Ensure step descriptor `value`/`url`/`description` fields can now be either string or object
    - _Requirements: 4.1, 8.1, 8.6_

- [~] 3. Checkpoint - Verify compiler changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement runtime resolution in background.js
  - [x] 4.1 Add `formatDate` function to `packages/extension/src/background.js`
    - Implement token-based date formatting supporting `YYYY`, `MM`, `DD`, `M`, `D` tokens with literal separators preserved
    - Default format is `YYYY-MM-DD`
    - Leave unrecognized tokens as literal text and log a warning
    - _Requirements: 2.4, 2.5, 2.7, 3.4_

  - [ ]* 4.2 Write property test for date formatting
    - **Property 6: Runtime date formatting round-trip**
    - Generate random dates and valid format strings, verify correct token substitution and zero-padding
    - **Validates: Requirements 2.4, 2.5, 3.4**

  - [x] 4.3 Add `resolveDateHelper` function to `packages/extension/src/background.js`
    - Implement day-offset resolution: add `offset` days to the current date
    - Implement month-boundary resolution: compute first or last day of the target month (handling varying month lengths and leap years)
    - Call `formatDate` with the resolved date and the descriptor's format field
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [ ]* 4.4 Write property test for day-offset date resolution
    - **Property 3: Runtime resolves day-offset dates correctly**
    - Generate random reference dates and offsets, verify the result is exactly `offset` calendar days from the reference
    - **Validates: Requirements 2.1**

  - [ ]* 4.5 Write property test for first-of-month boundary resolution
    - **Property 4: Runtime resolves first-of-month boundary correctly**
    - Generate random reference dates and month offsets, verify result has day=1 and correct month/year
    - **Validates: Requirements 2.2**

  - [ ]* 4.6 Write property test for last-of-month boundary resolution
    - **Property 5: Runtime resolves last-of-month boundary correctly**
    - Generate random reference dates and month offsets, verify result is the last calendar day (accounting for varying lengths and leap years)
    - **Validates: Requirements 2.3**

  - [x] 4.7 Add `evaluateExpression` function to `packages/extension/src/background.js`
    - Implement safe arithmetic evaluation supporting `+`, `-`, `*`, `/`, parentheses, identifier substitution from params, and numeric literals
    - Return empty string and log warning on NaN, Infinity, or division by zero
    - _Requirements: 6.3, 6.5_

  - [x] 4.8 Add `resolveRuntimeTemplate` function to `packages/extension/src/background.js`
    - Iterate the `parts` array, resolving each element: strings pass through, `param` descriptors substitute from params, `dateHelper` descriptors delegate to `resolveDateHelper`, `expression` descriptors delegate to `evaluateExpression`
    - Coerce each result to string and concatenate
    - Substitute empty string and log warning for undefined params
    - _Requirements: 5.7, 6.1, 6.2, 6.4_

  - [ ]* 4.9 Write property test for runtime template evaluation
    - **Property 8: Runtime template evaluation concatenates correctly**
    - Generate random template descriptors and param contexts, verify concatenation matches expected output
    - **Validates: Requirements 5.7, 6.1, 6.2, 6.3**

  - [x] 4.10 Extend `resolveValue` in `packages/extension/src/background.js` to dispatch object-typed values
    - Add object detection at the top of `resolveValue`: if `typeof value === 'object' && value.type`, dispatch to `resolveDateHelper` or `resolveRuntimeTemplate`
    - Existing string handling remains unchanged
    - _Requirements: 8.6_

  - [ ]* 4.11 Write property test for runtime value dispatch
    - **Property 9: Runtime value dispatch**
    - Generate random mixed values (plain strings and object descriptors), verify correct dispatch path
    - **Validates: Requirements 8.6**

- [~] 5. Checkpoint - Verify runtime changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Integration wiring and compiler warning coverage
  - [x] 6.1 Add unit tests for compiler warning scenarios in `packages/compiler/src/parser.test.js`
    - Test non-string format argument warning for day-offset helpers
    - Test missing integer argument warning for month-boundary helpers
    - Test extra arguments warning
    - Test unrecognized function in value position warning
    - Test unsupported expression type in template warning
    - Verify all warnings include filePath and line number
    - _Requirements: 3.5, 3.6, 3.7, 4.3, 4.4, 4.5_

  - [ ]* 6.2 Write property test for compiler warning source locations
    - **Property 10: Compiler warnings include source location**
    - Trigger random warning scenarios, verify each warning has non-empty `filePath` and positive `line`
    - **Validates: Requirements 4.4**

  - [x] 6.3 Add unit tests for backward compatibility in `packages/compiler/src/parser.test.js`
    - Verify existing plain string values produce unchanged JSON output after the refactor
    - Verify zero-expression backtick templates emit plain strings
    - Verify date helper calls outside value positions are not emitted as descriptors
    - _Requirements: 8.1, 5.2, 1.6_

  - [x] 6.4 Add integration tests in `packages/extension/src/background.test.js`
    - Test end-to-end: compiled date helper descriptor → `resolveValue` → formatted date string
    - Test runtime template with nested date helper and param references
    - Test multiple date helpers with different format strings in a single test plan
    - _Requirements: 2.1, 2.2, 2.3, 5.7, 6.1, 6.2_

- [~] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses Node.js built-in test runner (`node --test`) and fast-check for property-based tests
- All new functions in background.js follow the existing ES5/var style for browser extension compatibility

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "4.2", "4.3"] },
    { "id": 3, "tasks": ["2.5", "2.6", "4.4", "4.5", "4.6", "4.7"] },
    { "id": 4, "tasks": ["4.8", "4.9"] },
    { "id": 5, "tasks": ["4.10", "4.11"] },
    { "id": 6, "tasks": ["6.1", "6.2", "6.3", "6.4"] }
  ]
}
```
