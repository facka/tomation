# Implementation Plan: Test Panel Search

## Overview

This plan adds search/filtering capability to the Tomation browser extension's Home view. The implementation uses case-insensitive substring matching (`indexOf`) to filter tests in real time as the user types. The feature is entirely a Panel concern — no background messaging is involved.

The extension uses ES5-compatible vanilla JavaScript with Node's built-in `node:test` runner and fast-check for property-based testing.

---

## Tasks

- [ ] 1. Implement search filter in Home view
  - [ ] 1.1 Add search input and filter logic to Home view in `packages/extension/src/panel.js`
    - Add `<input type="text" maxlength="100">` above the spec/test list in the Home view
    - On each `input` event: filter visible test items using case-insensitive `indexOf` against test names
    - Hide spec section headers when no tests in that section match
    - Show empty state message when no tests match across any spec
    - When search input is cleared: restore full unfiltered list
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ] 1.2 Clear search on view navigation in `packages/extension/src/panel.js`
    - When user navigates away from Home view and returns, clear the search input value and restore full test list
    - _Requirements: 1.7_

- [ ]* 2. Write property test: Search filter correctness
  - **Property 1: Search Filter Correctness**
  - Generate random lists of test names and random query strings; verify filter returns exactly those tests containing the query as case-insensitive substring; empty query returns all; no match returns empty
  - **Validates: Requirements 1.2, 1.3, 1.5, 1.6**

- [ ] 3. Final checkpoint — search tests pass
  - Run test suite: `node --test` in `packages/extension/`
  - Verify property test passes with minimum 100 iterations
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP iteration
- Property tests use fast-check (v3.23.2, already in devDependencies) with minimum 100 iterations per property
- Unit tests use Node's built-in `node:test` runner
- DOM-dependent panel tests use jsdom (already in devDependencies)
- The extension uses ES5-compatible vanilla JS — no modern syntax, no bundler
- The search feature is entirely a Panel concern — no background messaging is involved

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2"] },
    { "id": 2, "tasks": ["3"] }
  ]
}
```
