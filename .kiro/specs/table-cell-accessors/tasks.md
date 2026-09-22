# Implementation Plan: Table Cell Accessors

## Overview

Add `cell(row, column)`, `firstRow(column)`, and `lastRow(column)` accessors to Tomation table elements. A table is defined once as `is.TABLE`, and cells are reached inline at the point of use (e.g. `Click(UsersTable.cell(2, 3))`). Each of `row`/`column` is a cell selector: a 1-based number, `first`/`last`, or an object `{ tag?, index }` (same shape for rows and columns). Columns also accept a named/enum value; named values resolve to their numeric index while preserving the column name for display (object form carries no name). The compiler normalizes every selector to `{ tag?, index }` so the runtime handles one shape. Implementation follows Option A (a structured `tableCell` accessor on the descriptor, resolved by the runtime), mirroring the existing `navigate` feature. Flows through DSL, Compiler, Extension Runtime, Side Panel, and Documentation.

## Tasks

- [x] 1. Implement DSL cell accessors
  - [x] 1.1 Add `cell`/`firstRow`/`lastRow` to the descriptor in `packages/dsl/index.js`
    - In `ElementBuilder.prototype.as`, attach `cell(row, column)`, `firstRow(column)`, `lastRow(column)` methods to the returned descriptor
    - Each returns a shallow copy of the descriptor with `tableCell = { row, column }`, storing selectors as given (number/string/object); `firstRow`/`lastRow` pass `'first'`/`'last'` as the row selector
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 1.2 Update TypeScript definitions in `packages/dsl/index.d.ts`
    - Add `CellIndex` and `CellSelector` type aliases and `cell`/`firstRow`/`lastRow` signatures to `ElementDescriptor`
    - _Requirements: 1.1, 1.2, 1.6_

  - [ ]* 1.3 Write DSL unit tests in `packages/dsl/index.test.js`
    - `.as()` exposes accessors; `cell(2,3)` shape; object-form selectors stored as given; `firstRow`/`lastRow` symbolic row; named column resolves to a number; base `tag`/`where`/`label` inherited
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Implement compiler accessor recognition
  - [x] 2.1 Add accessor extraction to `packages/compiler/src/parser.js`
    - Add `extractTableAccessor(node, constBindings, warnings, filePath)` recognizing `Base.cell/firstRow/lastRow(...)` call expressions and returning `{ baseRef, accessor }`
    - Add `normalizeCellSelector(argNode, constBindings, ...)` mapping number / `'first'`/`'last'` / const-member / `{ tag?, index }` object to the normalized `{ tag?, index }`; capture `columnName` only for the column's named-const form
    - Resolve base reference via existing bare/`A.b` logic
    - Add a `resolveTarget(node, constBindings, warnings, filePath)` helper returning `{ target, accessor? }` and use it wherever step targets are extracted in `extractStep`; thread `accessor` onto the step
    - Validate resolved numeric `index` (positive integer) and push warnings on invalid values
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.6, 5.1, 5.2, 5.3, 5.4_

  - [ ]* 2.2 Write compiler unit tests in `packages/compiler/src/parser.test.js` (or `table-accessor.test.js`)
    - `Click(UsersTable.cell(2,3))` → base target + normalized accessor; named column → numeric + `columnName`; object-form `{tag,index}` for row and column; `firstRow`/`lastRow` symbolic; cross-file base; bare target unchanged; invalid literal warns
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 3.1, 3.2, 3.3, 3.6, 5.1, 5.2_

  - [ ]* 2.3 Property test — accessor descriptor shape (Property 1)
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 3.2**

  - [ ]* 2.4 Property test — named column resolves to number, preserves name (Property 2)
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]* 2.5 Property test — bare-target backward compatibility (Property 5)
    - **Validates: Requirements 2.6, 6.2**

- [ ] 3. Checkpoint — Ensure DSL and compiler tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement runtime cell resolution
  - [x] 4.1 Add `resolveTableCell(table, spec)` to `packages/extension/src/runtime.js`
    - Rows: `querySelectorAll(row.tag || 'tr')` in document order; map `row.index` (integer / `first` / `last`) 1-based
    - Columns: `:scope > {col.tag}` when tag present, else `:scope > th, :scope > td`; map `column.index` 1-based
    - Return `{ ok, element }` or `{ ok: false, error }` for out-of-range/no-rows
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 4.2 Integrate `resolveTableCell` into `findElementWithParent` in `packages/extension/src/runtime.js`
    - After the anchor resolves (and any `childOf`/`navigate`), if `elementDescriptor.tableCell` is present, apply `resolveTableCell` and use its result as the final target; route failures through the existing not-found trace/step-failure flow
    - _Requirements: 4.1, 4.7, 4.8_

  - [x] 4.3 Attach the accessor in `buildStepMessage` in `packages/extension/src/background.js`
    - Copy `step.accessor` onto the message; when `accessor.type === 'tableCell'`, clone the looked-up descriptor and set `tableCell` (with optional `columnName`) without mutating the shared `pageElements` entry
    - _Requirements: 3.5, 6.2, 6.3_

  - [ ]* 4.4 Write runtime unit tests in `packages/extension/src/runtime.test.js`
    - `resolveTableCell` across `thead`/`tbody`/`tfoot`, `tbody`-only, no-`tbody`, `<th>`/`<td>`; `first`/`last`; out-of-range row/column; integration for a descriptor with `tableCell`
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 4.5 Write `buildStepMessage` tests in `packages/extension/src/background.test.js`
    - Clone + attach `tableCell`; shared `pageElements` entry not mutated; step without accessor unchanged
    - _Requirements: 3.5, 6.2, 6.3_

  - [ ]* 4.6 Property tests — cell resolution correctness and out-of-range (Properties 3, 4)
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8**

- [ ] 5. Checkpoint — Ensure runtime tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Side panel / log display
  - [x] 6.1 Display row/column, preferring `columnName`
    - In the per-step target display path (panel + run log), render `Row: <row>` and `Column: <columnName || column>` when a step carries a `tableCell`/accessor; print `first`/`last` for symbolic rows
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 6.2 Write display tests
    - Named column shows the name; numeric-only shows the index; `first`/`last` render readably
    - _Requirements: 7.2, 7.3, 7.4_

- [x] 7. Documentation
  - [x] 7.1 Add table accessor section to `README.md`
    - Document `cell`/`firstRow`/`lastRow`, 1-based indexing, `<th>`/`<td>` examples, numeric vs named-column forms, out-of-range behavior; recommend named columns for stable semantic columns
    - _Requirements: 8.1, 8.3, 8.4_

  - [x] 7.2 Add table accessor documentation to `examples/playground/docs.html`
    - Mirror README content within the Element/Locators Builder API section
    - _Requirements: 8.2, 8.3, 8.4_

- [x] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests/PBT) and can be skipped for a faster MVP; the user runs tests manually.
- All runtime/compiler/DSL code must be ES5 (var, function declarations, no arrow functions) except TypeScript definition files.
- The accessor is carried on the step as a parallel `accessor` field; the base `target` stays a string and is resolved by `buildStepMessage`, which clones the descriptor before stamping `tableCell` (never mutates shared `pageElements`).
- `row` and `column` are each a normalized selector `{ tag?, index }` where `index` is a 1-based integer or the symbolic `"first"`/`"last"`; the DSL stores the authored form and the compiler normalizes. `columnName` is display-only metadata the resolver ignores, present only for the numeric named-const column form.
- Named columns use the existing "const object as enum" convention and the existing const-binding resolver — no new abstraction. The object form (`{ tag?, index }`) is shared by rows and columns and never carries a `columnName`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3"] },
    { "id": 5, "tasks": ["4.4", "4.5", "4.6"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2", "7.1", "7.2"] }
  ]
}
```
