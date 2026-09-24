# Design Document: Table Cell Accessors

## Overview

Table cell accessors let a test reach a single cell of a table that was defined once as a normal `is.TABLE` UIElement. The accessors are called at the point of use:

```ts
// POM
const UsersTable = is.TABLE.where(idIs('users')).as('Users')

// Test
Click(UsersTable.cell(2, 3))
Click(UsersTable.firstRow(2))
Click(UsersTable.lastRow(3))

// Named columns
const UsersColumn = { Name: 1, Email: 2, Status: 3 } as const
AssertHasText(UsersTable.cell(2, UsersColumn.Email), 'john@example.com')
```

The `row` and `column` arguments each accept a **cell selector** — a 1-based number, the symbolic `first`/`last`, or an object `{ tag?, index }`:

```ts
Click(UsersTable.cell({ tag: 'tr', index: 2 }, 3))
Click(UsersTable.cell(2, { tag: 'td', index: 3 }))   // count only <td>, skipping a leading <th>
```

This follows **Option A**: the accessor is modeled as a structured descriptor attached to the step, mirroring the existing `navigate` feature. The runtime is the single source of truth for DOM/table semantics, so the resolver — not the compiler — flattens sections and picks the cell.

The feature flows through four layers:

1. **DSL** — The element descriptor returned by `.as()` gains `cell`, `firstRow`, and `lastRow` methods. Each returns a lightweight *cell reference* object that carries the base descriptor plus a `tableCell` accessor.
2. **Compiler** — When a step target is a `Base.cell(...)` / `firstRow(...)` / `lastRow(...)` call, the parser records the step's `target` as the base reference and adds an `accessor` field. Numeric columns pass through; `const`-bound named columns resolve to their numeric value and capture a `columnName`.
3. **Extension Runtime** — `buildStepMessage` clones the resolved base descriptor and attaches the accessor as `elementDescriptor.tableCell`. After the anchor resolves, `resolveTableCell` walks the table and returns the cell element.
4. **Side Panel / Log** — The step display prefers `columnName` over the numeric `column`.

### Design Decisions

- **Structured accessor, not XPath**: Consistent with `navigate`, the accessor is structured data resolved by dedicated runtime logic, keeping the DOM-resolution knowledge in the runtime and the compiler free of table semantics.
- **Accessor lives on the step, base ref stays a string**: Step targets today are strings (`"UsersTable"` / `"Login__submitButton"`) resolved to descriptors at runtime by `buildStepMessage`. Rather than change the target model, the base reference stays a string and the cell shape is carried in a parallel `accessor` field. `buildStepMessage` then clones the looked-up descriptor and stamps `tableCell` onto the clone (never mutating the shared `pageElements` entry).
- **Unified cell selector, normalized at compile time**: `row` and `column` share one shape — a number, `"first"`/`"last"`, or `{ tag?, index }`. The compiler normalizes all forms to `{ tag?, index }` so the runtime only ever handles one shape. The object form lets the author control *how* rows/columns are counted (e.g. only `<td>`); the bare form keeps the sensible default.
- **Symbolic `index: "first" | "last"`**: `lastRow` cannot be a fixed number at compile time, so an index is either a 1-based integer or a symbolic string resolved by the runtime. `firstRow`/`lastRow` are sugar for `row = { index: 'first' | 'last' }`.
- **Default counting rules**: With no `tag`, rows flatten all `<tr>` across `<thead>`/`<tbody>`/`<tfoot>` (and direct `<tr>` when no wrapper) in document order, 1-based; columns count `<th>` and `<td>` together, 1-based. A `tag` on the row selector counts the anchor's descendants of that tag; a `tag` on the column selector counts only the row's own children of that tag. This matches the natural reading of the HTML example and is robust across section variations.
- **`columnName` is additive**: The runtime resolves purely from `column`; `columnName` is display-only metadata. Numeric-column calls carry no `columnName`.
- **Named columns are plain numbers**: `const UsersColumn = { Email: 2 } as const` needs no runtime support — `UsersColumn.Email` *is* `2`. The only work is at compile time, where the parser reads the const binding to recover both the value and the property name.

## Architecture

```mermaid
flowchart LR
    subgraph DSL["@tomationjs/dsl"]
        DESC[ElementDescriptor] -->|.cell(r,c)| REF[Cell Reference<br/>+ tableCell accessor]
        DESC -->|.firstRow(c)/.lastRow(c)| REF
    end

    subgraph Compiler["@tomationjs/compiler"]
        Parser[parser.js] -->|extractElementRef<br/>+ extractAccessor| STEP[Step<br/>target + accessor]
        Parser -->|const bindings| CN[columnName + numeric column]
    end

    subgraph Extension["Extension"]
        BSM[background.js<br/>buildStepMessage] -->|clone descriptor<br/>+ tableCell| RT[runtime.js]
        RT -->|findElement| Anchor[table anchor]
        Anchor -->|resolveTableCell| Cell[cell element]
        BSM --> Panel[side panel / log<br/>columnName preferred]
    end

    REF -->|compiled by| Parser
    STEP -->|.tomation.json| BSM
```

**Data flow example** (`Click(UsersTable.cell(2, UsersColumn.Email))` with `UsersColumn = { Name:1, Email:2, Status:3 }`):

1. DSL: `UsersTable.cell(2, 2)` → cell reference `{ ...UsersTable, tableCell: { row: 2, column: 2 } }`.
2. Compiler: step `{ action: "click", target: "Users__UsersTable", accessor: { type: "tableCell", row: 2, column: 2, columnName: "Email" } }`.
3. Runtime (`buildStepMessage`): looks up `pageElements["Users__UsersTable"]`, clones it, attaches `tableCell: { row: 2, column: 2, columnName: "Email" }` → `msg.elementDescriptor`.
4. Runtime (`findElementWithParent`): resolves `<table id="users">`, then `resolveTableCell` returns the 2nd flattened row's 2nd cell.
5. Panel/log: `Users → Row: 2, Column: Email`.

## Components and Interfaces

### DSL Package (`packages/dsl/`)

The descriptor produced by `.as()` is a plain object. We attach non-enumerable-friendly accessor methods to it. Because descriptors flow into `pageElements` and are JSON-serialized as data, the accessor methods themselves are only meaningful at authoring time (in `.test.ts`/`.pom.ts` where the compiler reads the AST, not the runtime value). The DSL stubs exist so authored code runs and type-checks.

The DSL stores whatever selectors it is given (number, string, or `{ tag?, index }` object) — it does not normalize; the compiler normalizes from the AST. The runtime DSL value only needs to exist so authored code runs and type-checks.

```javascript
function makeCellRef(base, row, column) {
  var ref = Object.assign({}, base);
  ref.tableCell = { row: row, column: column };
  return ref;
}

// In ElementBuilder.prototype.as, after building `descriptor`:
descriptor.cell = function (row, column) { return makeCellRef(descriptor, row, column); };
descriptor.firstRow = function (column) { return makeCellRef(descriptor, 'first', column); };
descriptor.lastRow = function (column) { return makeCellRef(descriptor, 'last', column); };
```

**TypeScript definitions (`index.d.ts`)**

```typescript
/** A 1-based index or a symbolic first/last position. */
export type CellIndex = number | 'first' | 'last';

/**
 * How a row or column is identified: a 1-based index (or a named column value
 * from a `const` object, which is a number), a symbolic first/last, or an
 * object narrowing the counted elements by tag.
 */
export type CellSelector = CellIndex | { tag?: string; index: CellIndex };

export interface ElementDescriptor {
  tag: string;
  label?: string;
  childOf?: string;
  where: WhereDescriptor;
  xpath?: string;
  navigate?: string;
  __el?: true;
  /** Cell at the given row and column selectors. */
  cell(row: CellSelector, column: CellSelector): ElementDescriptor;
  /** Cell in the first row at the given column selector. */
  firstRow(column: CellSelector): ElementDescriptor;
  /** Cell in the last row at the given column selector. */
  lastRow(column: CellSelector): ElementDescriptor;
}
```

`CellSelector` accepts a bare `number`, so both `cell(2, 2)` and `cell(2, UsersColumn.Email)` type-check (a `const` object's values are `number` literals) — the existing "const object as enum" convention (e.g. `skills.enum.ts`), no custom abstraction. The object form `{ tag?, index }` is shared by rows and columns.

### Compiler Package (`packages/compiler/src/parser.js`)

**`extractElementRef` (extended)** — today it handles an `Identifier` (`submitButton`) and a two-level `MemberExpression` (`Login.submitButton`). It gains recognition of an accessor `CallExpression`:

```
Base.cell(row, column)      // CallExpression, callee = MemberExpression(Base.cell)
Base.firstRow(column)
Base.lastRow(column)
```

Because a step needs both the base target string and the accessor object, extraction returns a small result rather than only a string. A new helper `extractTableAccessor(node, constBindings, warnings, filePath)` returns `{ baseRef, accessor }` or `null`:

- `baseRef` is derived by running the existing base-reference logic on `node.callee.object` (`Base` may be an `Identifier` or `A.b` member expression).
- `accessor.type = "tableCell"`.
- `accessor.row`: for `cell`, the normalized first argument; for `firstRow`/`lastRow`, `{ index: "first" }` / `{ index: "last" }`.
- `accessor.column`: the normalized second (or only) argument. If the argument is a member expression on a known const binding, capture the numeric value **and** the property name → `columnName`.

**Selector normalization** — a helper `normalizeCellSelector(argNode, constBindings, warnings, filePath)` maps each argument to `{ tag?, index }`:

- Numeric literal `n` → `{ index: n }`.
- String literal `"first"`/`"last"` → `{ index: "first" | "last" }`.
- Member expression on a const binding (e.g. `UsersColumn.Email`) → `{ index: <value> }`, and (for the column argument only) records `columnName = "Email"`.
- Object expression `{ tag: 't', index: e }` → `{ tag: 't', index: <resolved index> }`, resolving `index` by the same rules; a `tag` key is read as a string literal.

`extractStep` is updated so every place that extracts a target uses a shared helper `resolveTarget(node, constBindings, warnings, filePath)` returning `{ target, accessor? }`, and the action branches thread `accessor` onto the returned step object. This keeps churn small.

**Const/enum resolution** — the parser already builds `constBindings` and resolves member expressions for matcher arguments (`buildConstBindings`, used by `extractMatcherCall`). The selector resolver reuses this: given `UsersColumn.Email`, look up `constBindings["UsersColumn"].Email` → `2`, and record `columnName = "Email"` when it is the column argument (never for the row, and never for the object form).

**Validation** — a resolved numeric `index` (row or column, bare or object form) that is zero, negative, or non-integer pushes a warning via the existing `warnings` array with file/line; the accessor is still emitted best-effort (mirrors navigate's "invalid omitted, error surfaced" approach).

### Extension Package

**`background.js` — `buildStepMessage` (extended)**

```javascript
if (step.target && pageElements) {
  var descriptor = pageElements[step.target];
  if (descriptor) {
    if (step.accessor && step.accessor.type === 'tableCell') {
      // Clone so the shared pageElements entry is never mutated.
      descriptor = Object.assign({}, descriptor);
      descriptor.tableCell = {
        row: step.accessor.row,
        column: step.accessor.column
      };
      if (step.accessor.columnName !== undefined) {
        descriptor.tableCell.columnName = step.accessor.columnName;
      }
    }
    msg.elementDescriptor = descriptor;
    // ... existing childOf / parentChain handling unchanged ...
  }
}
```

The step's `accessor` is copied onto `msg` earlier (alongside `target`) so the panel/log can read it.

**`runtime.js` — `resolveTableCell` (new)**

```javascript
/**
 * Pick an element from a candidate NodeList/array by a normalized selector index.
 * @param {Array|NodeList} candidates
 * @param {number|'first'|'last'} index
 * @returns {number} chosen 0-based index (may be out of range; caller checks)
 */
function selectorIndexToOffset(candidates, index) {
  if (index === 'first') return 0;
  if (index === 'last') return candidates.length - 1;
  return index - 1; // 1-based → 0-based
}

/**
 * Resolve a table cell relative to a resolved <table> (or table-like) anchor.
 * @param {Element} table - resolved anchor element
 * @param {{row: {tag?: string, index}, column: {tag?: string, index}}} spec
 * @returns {{ok: true, element: Element} | {ok: false, error: string}}
 */
function resolveTableCell(table, spec) {
  var rowSel = spec.row || {};
  var colSel = spec.column || {};

  // Candidate rows: default flattens all <tr> across sections in document order;
  // a tag narrows to the anchor's descendants of that tag.
  var rows = table.querySelectorAll(rowSel.tag || 'tr');
  if (!rows || rows.length === 0) {
    return { ok: false, error: 'Table has no rows' };
  }
  var rowOffset = selectorIndexToOffset(rows, rowSel.index);
  if (rowOffset < 0 || rowOffset >= rows.length) {
    return { ok: false, error: 'Row ' + rowSel.index + ' not found (table has ' + rows.length + ' rows)' };
  }
  var row = rows[rowOffset];

  // Candidate cells: default counts the row's own <th>+<td>; a tag narrows to
  // only that tag among the row's own children.
  var cellSelector = colSel.tag ? (':scope > ' + colSel.tag) : ':scope > th, :scope > td';
  var cells = row.querySelectorAll(cellSelector);
  var colOffset = selectorIndexToOffset(cells, colSel.index);
  if (colOffset < 0 || colOffset >= cells.length) {
    return { ok: false, error: 'Column ' + colSel.index + ' not found (row has ' + cells.length + ' cells)' };
  }
  return { ok: true, element: cells[colOffset] };
}
```

Notes:
- `table.querySelectorAll('tr')` returns every `<tr>` regardless of `<thead>`/`<tbody>`/`<tfoot>` wrapping, in document order — exactly the Row_Flattening rule, and it naturally handles tables without a `<tbody>`.
- `:scope > th, :scope > td` counts only the row's own cells (not nested-table cells), `<th>` and `<td>` together; a column `tag` narrows to `:scope > {tag}`.
- Because the runtime handles a single normalized shape (`{ tag?, index }`), it needs no knowledge of the bare-number/symbolic authoring forms.

**`runtime.js` — `findElementWithParent` (integrated)**

After the anchor (and any `childOf`/`navigate`) resolves, if `elementDescriptor.tableCell` is present, apply `resolveTableCell` to the resolved element and use its result as the final target. On failure, feed the error into the same not-found trace path used by navigate-hop failures, so the existing waiting/retry/error reporting applies (Req 4.8). `navigate` and `tableCell` are mutually independent; when both exist, navigate applies first, then the cell is resolved relative to the navigated element (kept simple; typical usage has only `tableCell`).

### Side Panel / Log

The step-rendering path that shows the element/target for a step is extended: when a step (or its resolved message) carries a `tableCell`/accessor, render two extra lines — `Row: <row>` and `Column: <columnName || column>`. `row` prints `first`/`last` directly. This reuses whatever component already renders per-step target metadata; no new message type is added.

## Data Models

### DSL Cell Reference (authoring-time value)

```js
{
  tag: 'table',
  label: 'Users',
  where: { id: 'users' },
  __el: true,
  tableCell: { row: 2, column: 2 }        // authoring value; selectors not yet normalized
}
```

### Compiled Step (`.tomation.json`)

Selectors are normalized to `{ tag?, index }`.

Numeric column:

```json
{ "action": "click", "target": "Users__UsersTable",
  "accessor": { "type": "tableCell", "row": { "index": 2 }, "column": { "index": 2 } } }
```

Named column:

```json
{ "action": "click", "target": "Users__UsersTable",
  "accessor": { "type": "tableCell", "row": { "index": 2 },
    "column": { "index": 2 }, "columnName": "Email" } }
```

`firstRow` / `lastRow`:

```json
{ "action": "click", "target": "Users__UsersTable",
  "accessor": { "type": "tableCell", "row": { "index": "first" }, "column": { "index": 2 } } }
```

Object-form selectors (`cell({ tag: 'tr', index: 2 }, { tag: 'td', index: 3 })`):

```json
{ "action": "click", "target": "Users__UsersTable",
  "accessor": { "type": "tableCell",
    "row": { "tag": "tr", "index": 2 }, "column": { "tag": "td", "index": 3 } } }
```

### Accessor Schema

| Field        | Type                     | Required | Description                                             |
|--------------|--------------------------|----------|---------------------------------------------------------|
| `type`       | `"tableCell"`            | yes      | Discriminator for the accessor kind.                    |
| `row`        | `{ tag?, index }`        | yes      | Normalized row selector; `index` is a 1-based integer or `"first"`/`"last"`. |
| `column`     | `{ tag?, index }`        | yes      | Normalized column selector; same shape as `row`.        |
| `columnName` | string                   | no       | Original named-column identifier, for display only (numeric named-const form only). |

Where `index` is an integer or `"first"`/`"last"`, and `tag` is an optional HTML tag string (e.g. `"tr"`, `"td"`, `"th"`).

## Correctness Properties

### Property 1: Accessor descriptor shape

*For any* accessor call `Base.cell(r, c)` / `firstRow(c)` / `lastRow(c)` used as a step target, where each of `r`/`c` is a numeric literal, a `"first"`/`"last"` string, a const-bound member, or an object `{ tag?, index }`, the compiled step SHALL have `target` equal to the resolved base reference and `accessor.type === "tableCell"`, with `accessor.row` and `accessor.column` each normalized to `{ index }` or `{ tag, index }` where `index` is the resolved integer or symbolic value (and `accessor.row.index` is `"first"`/`"last"` for `firstRow`/`lastRow`).

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

### Property 2: Named-column resolves to number, preserves name

*For any* `const` object binding mapping identifiers to positive integer literals, using `Base.cell(r, Obj.Prop)` SHALL emit `accessor.column.index` equal to the integer value of `Obj.Prop` and `accessor.columnName` equal to `"Prop"`; while `Base.cell(r, n)` with a numeric literal `n` SHALL emit `accessor.column.index === n` and no `columnName`; and the object form `Base.cell(r, { tag, index })` SHALL emit no `columnName`.

**Validates: Requirements 3.1, 3.2, 3.3, 3.6**

### Property 3: Cell resolution selects the correct DOM element

*For any* HTML table (with any combination of `<thead>`/`<tbody>`/`<tfoot>` and `<th>`/`<td>`) and any in-range normalized selectors, `resolveTableCell` SHALL return the element equal to the `column.index`-th cell (1-based) of the `row.index`-th candidate row (1-based; `first`/`last` mapping to the first/last candidate), where the row candidates are the anchor's `row.tag` descendants (default `tr`) and the cell candidates are the row's own `column.tag` children (default `th`+`td` together).

**Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.7**

### Property 4: Out-of-range yields not-found

*For any* table and any normalized selectors where the row or column index exceeds the available candidates, `resolveTableCell` SHALL return `{ ok: false }` with an error rather than an element.

**Validates: Requirements 4.8**

### Property 5: Backward compatibility of bare targets

*For any* step whose target is a bare identifier or `A.b` member expression (no accessor call), the compiled step SHALL contain no `accessor` field and SHALL have the same `target` as before this feature.

**Validates: Requirements 2.6, 6.2**

## Error Handling

### Compile-Time Errors (Compiler)

| Condition                           | Error Message Pattern                                        | Recovery                              |
|-------------------------------------|-------------------------------------------------------------|---------------------------------------|
| Row index ≤ 0 or non-integer        | `"Invalid table cell row \"{v}\": must be a positive integer"` | Warning surfaced; step still emitted |
| Column index ≤ 0 or non-integer     | `"Invalid table cell column \"{v}\": must be a positive integer"` | Warning surfaced; step still emitted |
| Unresolved const member for column  | `"Cannot resolve column value from \"{expr}\""`             | Warning surfaced; step still emitted  |

Validation applies to the resolved numeric `index` whether it was given as a bare number or as the `index` of the object form.

Errors integrate with the existing `warnings` array pattern in `parser.js`.

### Runtime Errors (Extension)

| Condition                     | Error Message Pattern                                        | Behavior                          |
|-------------------------------|-------------------------------------------------------------|-----------------------------------|
| Table anchor not found        | existing `"Element not found: {target}"`                    | Standard step failure/waiting     |
| Row index out of range        | `"Row {row} not found (table has {N} rows)"`                | Step fails via not-found trace    |
| Column index out of range     | `"Column {column} not found (row has {M} cells)"`           | Step fails via not-found trace    |
| Table has no rows             | `"Table has no rows"`                                       | Step fails via not-found trace    |

Runtime errors are routed through the existing step-failure flow that navigate uses, so out-of-range cells honor the same waiting/retry/error reporting as any unresolved element (no separate waiting mechanism).

## Testing Strategy

### Unit Tests (Example-Based)

**DSL package (`packages/dsl/index.test.js`)**
- `.as()` result exposes `cell`/`firstRow`/`lastRow`.
- `cell(2,3)` produces `tableCell: { row: 2, column: 3 }` and inherits `tag`/`where`/`label`.
- `firstRow(2)` / `lastRow(3)` produce symbolic `row`.
- A named column (`{Email:2}` → `cell(2, Obj.Email)`) yields `column: 2` (value is a plain number).
- Object-form selectors (`cell({tag:'tr',index:2}, {tag:'td',index:3})`) are stored on `tableCell` as given.

**Compiler package (`packages/compiler/src/parser.test.js` or a new `table-accessor.test.js`)**
- `Click(UsersTable.cell(2,3))` → step target base ref + `accessor {type,row,column}`.
- Named column via const binding → `column` numeric + `columnName`.
- `firstRow`/`lastRow` → symbolic `row`.
- Cross-file base `A.b.cell(...)` resolves base to `A__b`.
- Bare target unchanged (no `accessor`).
- Invalid literal row/column produces a warning.

**Extension runtime (`packages/extension/src/runtime.test.js`)**
- `resolveTableCell` for `thead`+`tbody`+`tfoot`, `tbody`-only, no-`tbody`, header `<th>`, data `<td>`.
- `first`/`last` row selection.
- Out-of-range row and column return `{ ok: false }`.
- Integration: descriptor with `tableCell` resolves to the correct element for a Click.

**Extension background (`packages/extension/src/background.*.test.js`)**
- `buildStepMessage` clones the descriptor and attaches `tableCell` without mutating the shared `pageElements` entry.
- Step without accessor is unchanged.

### Property-Based Tests

`fast-check` (already used). Properties 1–2 target the compiler (pure AST → step). Properties 3–4 target `resolveTableCell` over generated tables (via JSDOM). Property 5 targets compiler backward-compat.

### Test File Locations

- `packages/dsl/index.test.js` — DSL accessor unit tests (extend existing).
- `packages/compiler/src/parser.test.js` — accessor parsing unit + property tests (or a dedicated `table-accessor.test.js`).
- `packages/extension/src/runtime.test.js` — `resolveTableCell` unit + property tests (extend existing).
- `packages/extension/src/background.test.js` — `buildStepMessage` accessor cloning tests (extend existing).
