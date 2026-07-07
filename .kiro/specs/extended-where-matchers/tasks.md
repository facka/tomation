# Implementation Plan: Extended Where Matchers

## Overview

Add 9 new `where` matchers (valueIs, dataAttr, ariaLabel, roleIs, titleIs, hrefContains, isDisabled, nthChild, closestLabelIs) across 3 layers: DSL stubs + types, compiler extraction, and runtime DOM matching. The matchers fall into 4 categories: standard 1-arg string, 2-arg string, 0-arg boolean, and 1-arg numeric.

## Tasks

- [x] 1. Add DSL matcher factory stubs and TypeScript types
  - [x] 1.1 Add 9 new matcher factory functions to `packages/dsl/index.js`
    - Add `valueIs(val)`, `ariaLabel(val)`, `roleIs(val)`, `titleIs(val)`, `hrefContains(val)` as standard 1-arg string factories
    - Add `isDisabled()` as 0-arg boolean factory returning `{ isDisabled: true }`
    - Add `nthChild(n)` as 1-arg numeric factory returning `{ nthChild: n }`
    - Add `dataAttr(name, val)` returning `{ dataAttr: { name, value } }`
    - Add `closestLabelIs(tag, text)` returning `{ closestLabel: { tag, text } }`
    - Export all 9 new factories in `module.exports`
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1, 10.1_

  - [x] 1.2 Update `packages/dsl/index.d.ts` with new types and declarations
    - Add `value`, `ariaLabel`, `role`, `title`, `hrefContains` as optional string fields in `WhereDescriptor`
    - Add `dataAttr?: { name: string; value: string }` to `WhereDescriptor`
    - Add `isDisabled?: boolean` to `WhereDescriptor`
    - Add `nthChild?: number` to `WhereDescriptor`
    - Add `closestLabel?: { tag: string; text: string }` to `WhereDescriptor`
    - Add all 9 new return types to the `WhereMatcher` union
    - Add `declare function` signatures for all 9 new factories
    - Existing `WhereMatcher` members must remain unchanged
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 1.4, 2.4, 3.4, 4.4, 5.4, 6.4, 7.4, 8.4, 10.5_

  - [ ]* 1.3 Write property tests for DSL matcher factories
    - **Property 1: Single-arg matcher factory round-trip**
    - **Property 2: Two-arg matcher factory round-trip**
    - **Validates: Requirements 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1, 10.1**

- [x] 2. Extend compiler `extractMatcherCall` for new matcher shapes
  - [x] 2.1 Add special-case branches in `packages/compiler/src/parser.js`
    - Update `extractMatcherCall` signature to accept `warnings` and `filePath` parameters
    - Add `isDisabled` 0-arg branch: emit `{ isDisabled: true }`, warn if args > 0
    - Add `nthChild` numeric-arg branch: use `extractNumber`, emit `{ nthChild: n }`, warn if not a positive integer
    - Add `dataAttr` 2-arg branch: extract both strings, emit `{ dataAttr: { name, value } }`, warn if < 2 string args, warn if name starts with `data-`
    - Add `closestLabelIs` 2-arg branch: extract both strings, emit `{ closestLabel: { tag, text } }`, warn if < 2 string args
    - Place special-case branches BEFORE the existing `extractString(args[0])` early-return so they run first
    - Add `valueIs`, `ariaLabel`, `roleIs`, `titleIs`, `hrefContains` to the existing `matcherMap` object
    - Update all call sites of `extractMatcherCall` to pass the new parameters
    - _Requirements: 1.2, 2.2, 3.2, 4.2, 5.2, 6.2, 7.2, 8.2, 10.2, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 2.5, 2.6, 7.5, 8.5, 10.6_

  - [ ]* 2.2 Write property tests for compiler extraction
    - **Property 3: Compiler single-arg extraction preserves value**
    - **Property 4: Compiler two-arg extraction preserves both values**
    - **Property 5: Compiler numeric extraction preserves value**
    - **Property 6: Unrecognized matcher yields empty object**
    - **Property 12: Compiler data- prefix warning**
    - **Validates: Requirements 1.2, 2.2, 3.2, 4.2, 5.2, 6.2, 8.2, 10.2, 11.1–11.7, 2.6**

- [ ] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement runtime DOM matching for new matchers
  - [x] 4.1 Add simple matcher cases to `matchesWhere` in `packages/extension/src/runtime.js`
    - Add `value` case: check `el.value !== undefined && el.value === value`
    - Add `ariaLabel` case: check `el.getAttribute('aria-label') === value`
    - Add `role` case: check `el.getAttribute('role') === value`
    - Add `title` case: check `el.getAttribute('title') === value`
    - Add `hrefContains` case: check `el.getAttribute('href')` is not null and contains the substring
    - Add `isDisabled` case: check `el.disabled === true`
    - Add `dataAttr` case: check `el.getAttribute('data-' + value.name) === value.value`
    - Add `nthChild` case: count `previousElementSibling` chain for 1-based position
    - _Requirements: 1.3, 1.5, 2.3, 3.3, 3.5, 4.3, 5.3, 6.3, 6.5, 7.3, 8.3_

  - [x] 4.2 Implement `closestLabel` matching with `matchClosestLabel` algorithm
    - Add `closestLabel` case to the `matchesWhere` switch that delegates to `matchClosestLabel`
    - Thread `parentNode` parameter through `matchesWhere` (pass `root === document ? null : root` from `findElement`)
    - Implement `matchClosestLabel(el, spec, parentNode)`:
      - If `parentNode` is set: search within parent subtree only (Strategy A)
      - If no `parentNode`: try explicit `for` attribute (B1), walk up 3 ancestors (B2), check `aria-labelledby` (B3)
    - Implement `searchSubtreeForLabel(root, tag, text)` helper using `getElementsByTagName`
    - Tag comparison must be case-insensitive (compare against `toUpperCase()`)
    - Return `false` if no strategy matches
    - _Requirements: 10.3, 10.4, 10.7, 10.9_

  - [ ]* 4.3 Write property tests for runtime matching
    - **Property 7: Runtime exact-attribute matching**
    - **Property 8: Runtime value property matching**
    - **Property 9: Runtime href substring matching**
    - **Property 10: Runtime nthChild position matching**
    - **Property 11: Runtime dataAttr matching**
    - **Property 13: closestLabel childOf-bounded search**
    - **Property 14: closestLabel unbounded search — ancestor depth limit**
    - **Validates: Requirements 1.3, 1.5, 2.3, 3.3, 4.3, 5.3, 6.3, 6.5, 7.3, 8.3, 10.3, 10.4, 10.7, 10.9**

- [ ] 5. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Integration and wiring verification
  - [x] 6.1 Verify end-to-end compilation of all new matchers
    - Write a small `.pom.ts` fixture file using all 9 new matchers in `.where()` chains
    - Verify the compiler produces correct `spec.json` output with all new where descriptors
    - Ensure no regressions in existing matcher compilation
    - _Requirements: 1.2, 2.2, 3.2, 4.2, 5.2, 6.2, 7.2, 8.2, 10.2, 11.1–11.7_

  - [ ]* 6.2 Write unit tests for compiler warnings on invalid inputs
    - Test `dataAttr` with < 2 args produces warning + empty descriptor
    - Test `dataAttr` with `data-` prefix name produces warning (but still emits descriptor)
    - Test `closestLabelIs` with < 2 args produces warning + empty descriptor
    - Test `isDisabled` with args produces warning (but still emits valid descriptor)
    - Test `nthChild` with non-integer arg produces warning + empty descriptor
    - Test unrecognized matcher name returns empty object silently
    - _Requirements: 2.5, 2.6, 5.5, 7.5, 8.5, 10.6, 11.2, 11.5, 11.7_

- [ ] 7. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `extractNumber` helper already exists in `parser.js` — no need to create it
- The `fast-check` library is available as a dev dependency in `packages/compiler`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "4.1"] },
    { "id": 3, "tasks": ["4.2"] },
    { "id": 4, "tasks": ["4.3", "6.1"] },
    { "id": 5, "tasks": ["6.2"] }
  ]
}
```
