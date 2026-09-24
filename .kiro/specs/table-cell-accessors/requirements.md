# Requirements Document

## Introduction

This feature adds **table cell accessors** to the Tomation DSL. A table is defined once as a normal `is.TABLE` UIElement, and tests reach individual cells by calling accessor methods on the table reference at the point of use — for example `Click(UsersTable.cell(2, 3))`. The accessors resolve to normal Tomation elements so they work with every existing action and assertion.

Three accessors are provided:

- `cell(row, column)` — the cell at an explicit 1-based `row` and `column`.
- `firstRow(column)` — the cell in the first row at the given 1-based `column`.
- `lastRow(column)` — the cell in the last row at the given 1-based `column`.

The `row` and `column` arguments each accept a **cell selector**: a 1-based numeric index, the symbolic values `first`/`last`, or an object form `{ tag?, index }` that lets the author say *how* the row/column is identified (e.g. `{ tag: 'tr', index: 2 }` or `{ tag: 'td', index: 3 }`). The object form uses the same shape for both rows and columns. The `column` argument also accepts a named/enum value (a `const` object property such as `UsersColumn.Email`); named columns are a developer-facing convenience where the runtime always receives the numeric index while the original column name is preserved in the locator metadata for the extension side panel and execution log. Named columns apply only to the numeric form — the object form does not carry a column name.

The feature spans the DSL package (accessor stubs + descriptor), the compiler package (recognizing accessor calls as step targets and emitting the structured accessor), the extension runtime (resolving the accessor against the live DOM), and the side panel (displaying the column name).

## Glossary

- **Table_Element**: A UIElement defined via `is.TABLE.where(...).as(label)` that resolves to an HTML `<table>`.
- **Cell_Accessor**: A method call on a Table_Element reference (`cell`, `firstRow`, or `lastRow`) that designates a single cell relative to the table.
- **Cell_Selector**: The way a row or column is identified. Authored as a 1-based integer, the symbolic `first`/`last`, or an object `{ tag?, index }` where `index` is an integer or `first`/`last` and `tag` narrows the counted elements (e.g. `tr`, `td`, `th`). Normalized by the Compiler to the object form `{ tag?, index }` so the runtime handles a single shape.
- **Table_Cell_Descriptor**: The structured accessor `{ row, column, columnName? }` attached to a step, where `row` and `column` are each a normalized Cell_Selector `{ tag?, index }`, and `columnName` is the optional original named-column identifier (present only when the column came from a named `const`).
- **Named_Column**: A column referenced through a `const` object/enum property (e.g. `UsersColumn.Email`) rather than a bare numeric literal.
- **Compiler**: The `@tomationjs/compiler` package that transforms TypeScript POM/test files into `.tomation.json` output.
- **Extension_Runtime**: The content script in the browser extension that resolves element descriptors and executes test steps against the live DOM.
- **Page_Element_Descriptor**: The JSON object representing a page element in the compiled output (`tag`, `label`, `where`, and optionally `childOf`, `xpath`, `navigate`).
- **Row_Flattening**: The default rule (row selector with no `tag`) that all `<tr>` elements across `<thead>`, `<tbody>`, and `<tfoot>` are collected in document order and indexed 1-based, regardless of section wrappers. When the selector specifies a `tag`, the candidate list is the anchor's descendants matching that tag instead.

## Requirements

### Requirement 1: DSL Cell Accessors

**User Story:** As a test author, I want to call `cell(row, column)`, `firstRow(column)`, and `lastRow(column)` on a table reference, so that I can target a table cell inline where I use it, without defining a separate element per cell.

#### Acceptance Criteria

1. THE Table_Element reference returned by `.as()` SHALL expose `cell(row, column)`, `firstRow(column)`, and `lastRow(column)` methods.
2. THE `row` and `column` arguments SHALL each accept a Cell_Selector: a 1-based integer, the symbolic values `first`/`last`, or an object `{ tag?, index }` where `index` is a 1-based integer or `first`/`last`.
3. WHEN `cell(row, column)` is called, THE DSL SHALL return an element reference that carries a Table_Cell_Descriptor with the given `row` and `column` selectors, and otherwise inherits the base table's `tag`, `label`, and `where`.
4. WHEN `firstRow(column)` is called, THE DSL SHALL return an element reference whose Table_Cell_Descriptor `row` selector is `first` and whose `column` is the given selector.
5. WHEN `lastRow(column)` is called, THE DSL SHALL return an element reference whose Table_Cell_Descriptor `row` selector is `last` and whose `column` is the given selector.
6. WHEN a Named_Column value is passed as the `column` argument, THE DSL SHALL use its numeric value as the column index (a named value is a plain number at runtime).
7. THE Cell_Accessor return value SHALL be usable as the target argument of any existing action or assertion (e.g. `Click`, `Type().in`, `AssertHasText`) exactly like a normal element reference.

### Requirement 2: Compiler Recognition of Accessor Targets

**User Story:** As a compiler developer, I want accessor calls used as step targets to be parsed into a base element reference plus a structured accessor, so that the runtime can resolve the cell relative to the table.

#### Acceptance Criteria

1. WHEN the Compiler encounters a step whose target is `Base.cell(row, column)`, `Base.firstRow(column)`, or `Base.lastRow(column)`, THE Compiler SHALL emit the step with its `target` set to the base element reference (`Base`) and an `accessor` field describing the cell.
2. THE Compiler SHALL normalize each Cell_Selector to the object form `{ index }` (bare integer / symbolic) or `{ tag, index }` (object form), so `accessor.row` and `accessor.column` are always objects with an `index` field (a 1-based integer or `"first"`/`"last"`) and an optional `tag` string.
3. WHEN the accessor is `cell(row, column)`, THE Compiler SHALL emit `accessor` = `{ type: "tableCell", row, column }` with `row` and `column` as normalized selectors.
4. WHEN the accessor is `firstRow(column)`, THE Compiler SHALL emit `accessor.row` = `{ index: "first" }`.
5. WHEN the accessor is `lastRow(column)`, THE Compiler SHALL emit `accessor.row` = `{ index: "last" }`.
6. THE Compiler SHALL resolve the base reference (`Base`) using the same rules as a bare element target, including namespace prefixing for same-file references and `A.b` cross-file references.
7. WHEN a step has no accessor call as its target, THE Compiler SHALL emit the step without an `accessor` field (unchanged behavior).

### Requirement 3: Named Column Resolution and Metadata

**User Story:** As a test author, I want to pass a named column value (e.g. `UsersColumn.Email`) instead of a bare number, so that my page objects and tests read clearly, while execution still uses the numeric index.

#### Acceptance Criteria

1. WHEN the `column` argument is a numeric literal, THE Compiler SHALL emit `column.index` as that integer and SHALL NOT emit a `columnName`.
2. WHEN the `column` argument is a member expression on a `const` object binding (e.g. `UsersColumn.Email`), THE Compiler SHALL resolve it to the numeric value defined in the binding and emit that integer as `column.index`.
3. WHEN the `column` argument is a Named_Column resolved from a `const` binding, THE Compiler SHALL emit a `columnName` field on the accessor set to the property name (e.g. `"Email"`).
4. THE Compiler SHALL reuse the existing `const`/enum binding resolution mechanism used for matcher arguments; no separate abstraction is introduced.
5. THE `columnName` field SHALL be additive metadata only; the Extension_Runtime SHALL resolve the cell using `column` alone and SHALL NOT read `columnName`.
6. WHEN the `column` argument is the object form `{ tag?, index }`, THE Compiler SHALL NOT emit a `columnName` (the object form does not carry a name).

### Requirement 4: Runtime Cell Resolution

**User Story:** As a tester running automation in the browser, I want the extension to resolve the table anchor and then select the correct cell by row and column, so that actions and assertions operate on the intended cell.

#### Acceptance Criteria

1. WHEN the Extension_Runtime resolves an element descriptor that carries a Table_Cell_Descriptor, THE Extension_Runtime SHALL first locate the table anchor using the standard `tag`/`where` (and optional `childOf`) resolution with the existing polling timeout.
2. WHEN the `row` selector has no `tag`, THE Extension_Runtime SHALL apply Row_Flattening: collect all `<tr>` descendants across `<thead>`, `<tbody>`, and `<tfoot>` (and direct-child `<tr>` when no section wrapper exists) in document order.
3. WHEN the `row` selector has a `tag`, THE Extension_Runtime SHALL collect the anchor's descendants matching that tag in document order as the candidate rows.
4. WHEN the `row` selector `index` is a positive integer `n`, THE Extension_Runtime SHALL select the `n`-th candidate row (1-based); WHEN `index` is `"first"`/`"last"`, THE Extension_Runtime SHALL select the first/last candidate row.
5. WHEN the `column` selector has no `tag`, THE Extension_Runtime SHALL count the selected row's own `<th>` and `<td>` children together in document order; WHEN it has a `tag`, THE Extension_Runtime SHALL count only the row's own children matching that tag.
6. WHEN the `column` selector `index` is a positive integer `n`, THE Extension_Runtime SHALL select the `n`-th counted cell (1-based); WHEN `index` is `"first"`/`"last"`, THE Extension_Runtime SHALL select the first/last counted cell.
7. WHEN the cell is resolved, THE Extension_Runtime SHALL use it as the target element for the test action.
8. IF the requested row or column does not exist in the resolved table, THEN THE Extension_Runtime SHALL report a not-found failure through the existing step-failure flow, following the same waiting/error semantics as any element that cannot be resolved (no separate waiting mechanism is introduced).

### Requirement 5: Index Validation

**User Story:** As a test author, I want clearly invalid indexes to fail early with a helpful message, so that mistakes surface immediately rather than producing a broken locator.

#### Acceptance Criteria

1. IF the resolved `index` of the `row` selector is zero, negative, or a non-integer number (whether given as a bare number or as the `index` of the object form), THEN the feature SHALL reject it with a clear error identifying the invalid row.
2. IF the resolved `index` of the `column` selector is zero, negative, or a non-integer number, THEN the feature SHALL reject it with a clear error identifying the invalid column.
3. THE validation SHALL surface at compile time when the invalid index is a literal, and SHALL be reported through the existing warnings/errors mechanism.
4. WHEN an `index` is valid (a positive integer, or the symbolic `"first"`/`"last"`), THE feature SHALL proceed normally.

### Requirement 6: Backward Compatibility

**User Story:** As an existing Tomation user, I want all current locator and action functionality to keep working unchanged, so that adding table accessors does not break my suites.

#### Acceptance Criteria

1. THE existing element builders (`is.BUTTON`, `is.INPUT`, `is.TABLE`, `.where`, `.childOf`, `.navigate`, `.as`) SHALL continue to behave exactly as before.
2. WHEN a step target is a bare element reference or an `A.b` cross-file reference with no accessor call, THE Compiler SHALL emit it exactly as before (no `accessor` field).
3. THE Extension_Runtime SHALL resolve descriptors without a Table_Cell_Descriptor exactly as before.
4. A Cell_Accessor result SHALL behave like a normal UIElement wherever an element reference is accepted.

### Requirement 7: Side Panel and Log Display

**User Story:** As someone reading the execution log, I want a cell step to show a readable row/column, preferring the named column when available, so that logs are easy to understand.

#### Acceptance Criteria

1. WHEN a step carries a Table_Cell_Descriptor, THE side panel/log SHALL display the row and column of the targeted cell.
2. WHEN the accessor has a `columnName`, THE side panel/log SHALL display the column as the `columnName` (e.g. `Column: Email`) rather than the numeric index.
3. WHEN the accessor has no `columnName`, THE side panel/log SHALL display the numeric column index (e.g. `Column: 2`).
4. WHEN `row` is `"first"` or `"last"`, THE side panel/log SHALL display a readable form of the row (e.g. `Row: first`).

### Requirement 8: Documentation

**User Story:** As a user or contributor, I want table accessors documented, so that I can learn the API without reading source code.

#### Acceptance Criteria

1. THE project README (`README.md`) SHALL document `cell(row, column)`, `firstRow(column)`, and `lastRow(column)` under the DSL Reference, including the 1-based indexing convention and examples using `<th>` and `<td>`.
2. THE playground docs page (`examples/playground/docs.html`) SHALL document the table accessors within the Element/Locators Builder API section.
3. THE documentation SHALL describe both the numeric-index form (`cell(2, 2)`) and the Named_Column form (`cell(2, UsersColumn.Email)`), and SHALL explain that named columns are recommended when a table has stable semantic columns.
4. THE documentation SHALL describe behavior when the requested row/column does not exist (standard not-found/waiting semantics).
