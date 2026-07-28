# Implementation Plan: Element Navigate Method

## Overview

Add a `.navigate(path)` chainable method to the Tomation element builder that enables relative DOM traversal from an anchor element. Implementation flows through three packages: DSL (method stub + descriptor), Compiler (path parsing/validation + JSON emission), and Extension Runtime (DOM traversal execution). Documentation updates complete the feature.

## Tasks

- [x] 1. Implement DSL navigate method
  - [x] 1.1 Add `.navigate(path)` method to ElementBuilder in `packages/dsl/index.js`
    - Add `_navigate` property initialized to `undefined` in the ElementBuilder constructor
    - Add `navigate` prototype method that stores the path string in `_navigate` and returns `this`
    - Modify `.as()` to include `navigate` field in the descriptor only when `_navigate` is defined
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.2 Update TypeScript definitions in `packages/dsl/index.d.ts`
    - Add `navigate(path: string): ElementBuilder` to the `ElementBuilder` interface
    - Add `navigate?: string` to the `ElementDescriptor` interface
    - _Requirements: 1.1_

  - [ ]* 1.3 Write unit tests for DSL navigate method in `packages/dsl/index.test.js`
    - Test `.navigate()` is chainable (returns builder instance)
    - Test all method ordering permutations: `.where().navigate().as()`, `.navigate().where().as()`, `.childOf().navigate().as()`
    - Test descriptor omits `navigate` when not called
    - Test last `.navigate()` call wins when called multiple times
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

  - [ ]* 1.4 Write property test for DSL builder (Property 3)
    - **Property 3: DSL builder last-navigate-wins and descriptor inclusion**
    - For any sequence of `.navigate(path)` calls, descriptor contains only the last path; builder returns same instance
    - **Validates: Requirements 1.2, 1.4**

- [x] 2. Implement compiler navigate path parser
  - [x] 2.1 Create `packages/compiler/src/navigate-parser.js` with `parseNavigatePath` and `serializeNavigatePath` functions
    - Implement `parseNavigatePath(path)` that splits on commas, trims tokens, validates each against the grammar, and returns `{ ok: true, steps: [] }` or `{ ok: false, error: string }`
    - Recognize tokens: `parent`, `firstChild`, `lastChild`, `nextSibling`, `prevSibling`, `child[n]`, `sibling[n]`
    - Validate index for `child[n]`/`sibling[n]`: must be integer in range [1, 9999]
    - Report errors with token text and 1-based position
    - Implement `serializeNavigatePath(steps)` that converts step array back to comma-separated string
    - Export both functions via `module.exports`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 2.2 Write unit tests for navigate parser in `packages/compiler/src/navigate-parser.test.js`
    - Test each recognized token parses correctly (one example per token)
    - Test whitespace trimming between tokens
    - Test empty string produces error
    - Test empty brackets (`child[]`, `sibling[]`) produce error
    - Test invalid index values (0, -1, decimals, non-numeric) produce errors
    - Test index out of range (> 9999) produces error
    - Test unrecognized tokens produce error with position
    - Test comma-only and whitespace-only strings produce error
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 2.3 Write property test for round-trip consistency (Property 1)
    - **Property 1: Navigate path round-trip**
    - For any valid path string, `serializeNavigatePath(parseNavigatePath(path).steps)` equals the input after trimming each token
    - **Validates: Requirements 2.1, 2.5, 2.6, 3.7**

  - [ ]* 2.4 Write property test for step array shape (Property 2)
    - **Property 2: Navigate path compilation produces correctly shaped step array**
    - For any valid path, output is an array where each element has correct `step` field and optional `index` in [1, 9999]
    - **Validates: Requirements 2.3, 3.1, 3.2, 3.4, 3.5**

  - [ ]* 2.5 Write property test for invalid index errors (Property 6)
    - **Property 6: Invalid index error reporting**
    - For any index value not a positive integer in [1, 9999], parsing `child[value]` or `sibling[value]` produces a validation error
    - **Validates: Requirements 5.2, 5.3**

  - [ ]* 2.6 Write property test for unrecognized token error (Property 7)
    - **Property 7: Unrecognized token error with position**
    - For any unrecognized token at position P, error contains both the token string and position P
    - **Validates: Requirements 2.4**

  - [ ]* 2.7 Write property test for empty/whitespace-only path (Property 8)
    - **Property 8: Empty/whitespace-only path error**
    - For any string producing zero non-empty segments, compiler reports a validation error
    - **Validates: Requirements 5.1, 5.4**

- [x] 3. Integrate navigate parsing into compiler pipeline
  - [x] 3.1 Modify `packages/compiler/src/parser.js` to recognize `.navigate()` calls in `extractElement`
    - Detect `.navigate(stringArg)` in the method chain (alongside `.where()` and `.childOf()`)
    - Store the string argument in the element definition object as `navigate` field
    - _Requirements: 2.1, 3.1_

  - [x] 3.2 Modify compiler emission to transform navigate field from raw string to structured step array
    - After parsing element definitions, call `parseNavigatePath` on the `navigate` string
    - If parsing succeeds, replace the raw string with the `steps` array in the output
    - If parsing fails, omit the `navigate` field from output and add the error to the warnings/errors array
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 3.3 Write integration tests for compiler navigate pipeline in `packages/compiler/src/navigate-parser.test.js`
    - Test that a POM file with `.navigate('parent,child[2]')` produces correct JSON output
    - Test that `childOf` and `navigate` coexist in output
    - Test that invalid navigate path produces warning and omits field from output
    - _Requirements: 3.1, 3.6, 6.2_

- [x] 4. Checkpoint - Ensure DSL and compiler tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement runtime navigation execution
  - [x] 5.1 Add `applyNavigateSteps` function to `packages/extension/src/runtime.js`
    - Implement synchronous DOM traversal: iterate steps array, apply each step to current element
    - Handle all step types: `parent`, `child`, `firstChild`, `lastChild`, `nextSibling`, `prevSibling`, `sibling`
    - Return `{ ok: true, element }` on success or `{ ok: false, error }` with step token and 1-based position on failure
    - Handle `sibling` step's null parent edge case
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [x] 5.2 Integrate `applyNavigateSteps` into element resolution in `packages/extension/src/runtime.js`
    - In the element resolution flow (after anchor is found via `tag`+`where` polling), check for `navigate` array on the descriptor
    - If present, call `applyNavigateSteps` on the resolved anchor and use the result as the final target
    - If navigate fails, report the error through the existing step failure flow
    - Support composition with `childOf`: resolve parent first, then anchor within parent, then navigate from anchor
    - _Requirements: 4.1, 4.2, 4.11, 4.12, 6.1_

  - [ ]* 5.3 Write unit tests for `applyNavigateSteps` in `packages/extension/src/runtime.test.js`
    - Test each step type traverses to correct element (using mock DOM or JSDOM)
    - Test null element at any step produces error with step token and position
    - Test sibling with null parent produces specific error
    - Test multi-step path resolves correctly
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [ ]* 5.4 Write property test for DOM traversal correctness (Property 4)
    - **Property 4: DOM traversal correctness**
    - For any DOM tree and valid navigate path where each step has a valid target, applying steps arrives at the correct element
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.11**

  - [ ]* 5.5 Write property test for navigation failure reporting (Property 5)
    - **Property 5: Navigation failure reports step and position**
    - For any path where step at position P yields null, error message contains both the step token and position P
    - **Validates: Requirements 4.10**

- [x] 6. Checkpoint - Ensure runtime tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Update documentation
  - [x] 7.1 Add `.navigate(path)` section to `README.md` under the DSL Reference
    - Document method signature and purpose
    - List all supported navigation steps with brief descriptions
    - Include at least two usage examples (simple path, combined with `.where()` and `.childOf()`)
    - _Requirements: 7.1, 7.3, 7.4_

  - [x] 7.2 Add `.navigate(path)` documentation to `examples/playground/docs.html`
    - Add section within the Element/Locators Builder API area
    - Include supported navigation steps table
    - Include usage examples matching the README content
    - Include example combining `.navigate()` with `.where()` and `.childOf()`
    - _Requirements: 7.2, 7.3, 7.4_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check
- All code must be ES5 (var, function declarations, no arrow functions) except TypeScript definition files
- The DSL stores navigate as a raw string; the compiler transforms it to a structured step array
- Runtime traversal is synchronous after anchor resolution (no per-step polling)
- 1-based indexing convention throughout (matches existing `nthChild` matcher)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "3.1"] },
    { "id": 3, "tasks": ["3.2"] },
    { "id": 4, "tasks": ["3.3", "5.1"] },
    { "id": 5, "tasks": ["5.2"] },
    { "id": 6, "tasks": ["5.3", "5.4", "5.5"] },
    { "id": 7, "tasks": ["7.1", "7.2"] }
  ]
}
```
