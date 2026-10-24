# Requirements Document

## Introduction

The Tomation DSL compiler lets test authors declare reusable test data with `Data({...})` templates. The compiler function that converts a `Data({...})` object into a parsed template, `parseDataTemplate` (in `packages/compiler/src/parser.js`), recognizes only three property value shapes today: `Fake.*(...)` calls, static literals (string / number / boolean), and nested object expressions. Any other value shape is silently dropped — the property never appears in the parsed template. When a test later references that property (for example `newTask.taskType`), data-path validation (`validateDataPath`) cannot find the key, emits an "Unknown data property" warning, and the compiled spec is missing the field.

Two author-facing value shapes are affected:

1. An enum / const member reference imported from a Page Object Model (POM), including the three-level namespaced form `NewTaskPage.TaskTypes.AUTHORIZATION_REQUEST` (a `MemberExpression` whose object is itself a `MemberExpression`) and the two-level form `TaskTypes.KEY` produced by a named import of a POM enum (`import { TaskTypes } from '~/pom/...'`) or a local/imported const (`SomeConst.MEMBER`).
2. A date-helper call such as `nextWeek('MM/DD/YYYY')`, `today(...)`, `tomorrow(...)`, or `firstDateOfMonth(...)`.

Reproduction (author code):

```ts
const newTask = Data({
  taskType: NewTaskPage.TaskTypes.AUTHORIZATION_REQUEST, // dropped today → "Unknown data property taskType"
  provider: 'Provider1',           // literal, works today
  dueDate: nextWeek('MM/DD/YYYY'),  // date helper, dropped today
})
```

```ts
// Alternate syntax — named import of the enum resolves to a 2-level reference
import NewTaskPage, { TaskTypes } from '~/pom/patient-chart/tasks/new-task.pom'

const newTask = Data({
  taskType: TaskTypes.AUTHORIZATION_REQUEST, // 2-level Enum.KEY (named import) — must resolve too
  dueDate: nextWeek('MM/DD/YYYY'),
})
```

Both import styles are supported. A default import of the POM yields a three-level namespaced reference (`NewTaskPage.TaskTypes.KEY`), covered by Requirement 1. A named import of the enum yields a two-level reference (`TaskTypes.KEY`), covered by Requirement 2. Either form must resolve to the same enum member value.

This feature extends `parseDataTemplate` to accept these two value shapes as `Data` property values, reusing machinery that already exists in the parser. The three-level namespace map is already present in the `constBindings` passed into `parseDataTemplate` (built via `resolveDefaultExportNamespace` and assigned to `constBindings[localName]` right before the `Data(...)` walk). The functions `extractDateHelperCall` and the three-level and two-level member-resolution logic already resolve both shapes correctly in other value positions, and the runtime already resolves the resulting `{ type: 'dateHelper', ... }` descriptors and literal values. This is therefore a compile-time parsing gap only — no runtime change is expected.

A delicate constraint governs the fix. The general value extractor (`extractValueExpression`) also turns a bare `Identifier` into a `{{name}}` param token and a data-var member chain into a `{{data...}}` token. Inside a `Data({...})` template those interpretations are wrong — a `Data` template's values are literal data, not params or data-var references. The new support must be restricted to date-helper call expressions and enum / const member references, and must not turn bare identifiers or arbitrary member chains into param or data tokens inside a `Data` template.

This spec is a scoped extension of the existing inline-test-data feature. It is a separate spec and does not modify the inline-test-data spec.

## Glossary

- **Compiler**: The Tomation DSL compiler implemented in `packages/compiler/src/parser.js`.
- **Data_Template_Parser**: The compiler function `parseDataTemplate`, which converts a `Data({...})` object expression into a parsed template object.
- **Data_Path_Validator**: The compiler function `validateDataPath`, which checks that a referenced data path (for example `newTask.dueDate`) exists in a parsed template and warns when it does not.
- **Data Template**: A `Data({...})` declaration whose properties define reusable test-data fields.
- **Data Property Value**: The right-hand side AST node of a single property inside a `Data({...})` object expression.
- **Enum_Const_Member_Reference**: A `MemberExpression` resolving to an enum or const member value. Two-level form `Const.MEMBER` and three-level namespaced form `Namespace.Enum.KEY` (where the `MemberExpression` object is itself a `MemberExpression`).
- **Date_Helper_Call**: A `CallExpression` to a recognized date-helper identifier, producing a descriptor of the form `{ type: 'dateHelper', kind, ... }`.
- **Day_Offset_Helper**: A date helper of kind `dayOffset`: `today`, `tomorrow`, `yesterday`, `nextWeek`, `lastWeek`, `nextMonth`, `lastMonth` (per `DAY_OFFSET_HELPERS`). Accepts an optional string `format` argument.
- **Month_Boundary_Helper**: A date helper of kind `monthBoundary`: `firstDateOfMonth`, `lastDateOfMonth` (per `MONTH_BOUNDARY_HELPERS`). Accepts an integer `monthOffset` argument and an optional string `format` argument.
- **Date_Helper_Descriptor**: The object returned by `extractDateHelperCall`, for example `{ type: 'dateHelper', kind: 'dayOffset', offset: <days>, format?: <string> }` or `{ type: 'dateHelper', kind: 'monthBoundary', boundary: <'first'|'last'>, monthOffset: <int>, format?: <string> }`.
- **Terminal_Leaf**: A parsed-template value that cannot be descended into during data-path validation (for example a `Fake.*` node, a static literal, or a date-helper descriptor).
- **Warn_And_Skip**: The existing diagnostics convention: on an unresolvable or unsupported value shape, record a warning object `{ message, filePath, line }` in the `warnings` array and continue parsing without throwing, omitting the affected property from the parsed template.
- **Param_Token**: A `{{name}}` placeholder produced for a parameter reference.
- **Data_Var_Token**: A `{{data.<Data_Name>...}}` placeholder produced for a data-variable member reference.

## Requirements

### Requirement 1: Resolve three-level namespaced-enum references as Data property values

**User Story:** As a test author, I want a three-level namespaced enum reference (for example `NewTaskPage.TaskTypes.AUTHORIZATION_REQUEST`) used as a `Data` property value to be resolved and stored, so that tests can reference the property without an "Unknown data property" warning and the compiled spec includes the field.

#### Acceptance Criteria

1. WHEN a Data Property Value is a `MemberExpression` whose object is itself a `MemberExpression` of the form `Namespace.Enum.KEY` (object and property of the inner member being Identifiers, and the outer member accessed via dot with an Identifier key) AND a matching entry exists at `constBindings[Namespace][Enum][KEY]`, THE Data_Template_Parser SHALL store the resolved value, coerced to its string representation, under the property key in the parsed template, and SHALL NOT emit an "Unknown data property" warning for that property.
2. WHEN a three-level reference uses computed bracket access whose key is a string literal (for example `Namespace.Enum["KEY"]`) AND a matching entry exists at `constBindings[Namespace][Enum][KEY]`, THE Data_Template_Parser SHALL store the same string-coerced resolved value under the property key as it would for the equivalent dot-access form `Namespace.Enum.KEY`.
3. IF a three-level `Namespace.Enum.KEY` reference (whether dot access or string-literal computed access) has no matching entry at `constBindings[Namespace][Enum][KEY]`, THEN THE Data_Template_Parser SHALL apply the Warn_And_Skip convention by emitting exactly one warning identifying the unresolved property and omitting that property entirely from the parsed template while retaining all other successfully resolved properties.
4. IF a three-level reference uses computed bracket access whose key is not a string literal (for example a numeric literal or computed identifier), THEN THE Data_Template_Parser SHALL treat the reference as unresolvable and apply the Warn_And_Skip convention defined in Acceptance Criterion 3.

### Requirement 2: Resolve two-level enum/const member references as Data property values

**User Story:** As a test author, I want a two-level const or enum member reference — including an enum imported by name from a POM (for example `import { TaskTypes } from '~/pom/...'` then `TaskTypes.AUTHORIZATION_REQUEST`) as well as a local or imported const (`Status.ACTIVE`) — used as a `Data` property value to be resolved and stored, so that const-backed values compile into the data template.

#### Acceptance Criteria

1. WHEN a Data Property Value is a `MemberExpression` whose object is an identifier naming a key present in `constBindings` AND whose property is an identifier naming a key present in that object's binding AND the bound value is of type string, number, or boolean, THE Data_Template_Parser SHALL store that bound value under the property key in the parsed template with its original primitive type preserved (not coerced to string).
2. IF a Data Property Value is a `MemberExpression` whose object identifier names a key present in `constBindings` but whose property identifier does not name a key present in that object's binding, THEN THE Data_Template_Parser SHALL append exactly one warning identifying the unknown property name, the object name, the file path, and the source line number, AND SHALL omit that property key from the parsed template (Warn_And_Skip convention).
3. IF a Data Property Value is a `MemberExpression` whose object identifier does not name a key present in `constBindings`, OR whose object or property is not a single `Identifier` node (for example a computed or deeper-than-two-level member access), THEN THE Data_Template_Parser SHALL omit that property key from the parsed template without appending a warning.
4. WHEN a Data Property Value is a two-level `MemberExpression` whose object identifier is a named import of an enum or const from a POM (and is therefore present in `constBindings` with its members) AND whose property names a member resolving to a string, number, or boolean, THE Data_Template_Parser SHALL resolve and store the value identically to any other two-level `Const.MEMBER` reference per Acceptance Criterion 1.

### Requirement 3: Resolve day-offset date-helper calls as Data property values

**User Story:** As a test author, I want day-offset date-helper calls (for example `today()`, `tomorrow()`, `nextWeek('MM/DD/YYYY')`) used as `Data` property values to be stored as date-helper descriptors, so that relative dates resolve correctly at runtime.

#### Acceptance Criteria

1. WHEN a Data Property Value is a Date_Helper_Call to a Day_Offset_Helper (one of: `today`, `tomorrow`, `yesterday`, `nextWeek`, `lastWeek`, `nextMonth`, `lastMonth`) with zero arguments, THE Data_Template_Parser SHALL store under the property key a Date_Helper_Descriptor whose `type` is `dateHelper`, whose `kind` is `dayOffset`, and whose `offset` is the integer day offset mapped to that helper, with no `format` field present.
2. WHEN a Data Property Value is a Date_Helper_Call to a Day_Offset_Helper with exactly one argument that is a string value, THE Data_Template_Parser SHALL store a Date_Helper_Descriptor with `type` `dateHelper`, `kind` `dayOffset`, the helper's `offset`, and a `format` field equal to that string value.
3. IF a Data Property Value is a Date_Helper_Call to a Day_Offset_Helper with exactly one argument that is not a string value, THEN THE Data_Template_Parser SHALL store a Date_Helper_Descriptor with `type` `dateHelper`, `kind` `dayOffset`, and the helper's `offset` and no `format` field, AND SHALL record one warning identifying the non-string format argument.
4. IF a Data Property Value is a Date_Helper_Call to a Day_Offset_Helper with more than one argument, THEN THE Data_Template_Parser SHALL record one warning indicating the helper accepts at most one argument AND SHALL store the Date_Helper_Descriptor derived from the first argument per criteria 2 and 3.

### Requirement 4: Resolve month-boundary date-helper calls as Data property values

**User Story:** As a test author, I want month-boundary date-helper calls (for example `firstDateOfMonth(0)`, `lastDateOfMonth(-1, 'MM/DD/YYYY')`) used as `Data` property values to be stored as date-helper descriptors, so that month-boundary dates resolve correctly at runtime.

#### Acceptance Criteria

1. WHEN a Data Property Value is a Date_Helper_Call to a Month_Boundary_Helper (`firstDateOfMonth` mapping to boundary `first`, `lastDateOfMonth` mapping to boundary `last`) with an integer offset argument, THE Data_Template_Parser SHALL store under the property key a Date_Helper_Descriptor whose `type` is `dateHelper`, whose `kind` is `monthBoundary`, whose `boundary` is the mapped value, and whose `monthOffset` is the parsed integer, with no `format` field present.
2. WHEN a Data Property Value is a Date_Helper_Call to a Month_Boundary_Helper with an integer offset argument followed by a trailing string `format` argument, THE Data_Template_Parser SHALL store a Date_Helper_Descriptor that additionally includes a `format` field equal to that string value.
3. IF a Data Property Value is a Date_Helper_Call to a Month_Boundary_Helper that omits the offset argument or supplies a non-integer offset argument, THEN THE Data_Template_Parser SHALL record one warning identifying the invalid or missing offset AND SHALL store a Date_Helper_Descriptor using the default `monthOffset` of 0.
4. IF a Data Property Value is a Date_Helper_Call to a Month_Boundary_Helper with more than two arguments, THEN THE Data_Template_Parser SHALL record one warning indicating the helper accepts at most two arguments AND SHALL store the Date_Helper_Descriptor derived from the first two arguments per criteria 1 through 3.

### Requirement 5: Restrict new support to enum/const references and date helpers

**User Story:** As a test author, I want `Data` template values to never be reinterpreted as params or data-variable references, so that literal data values are not corrupted into `{{...}}` tokens.

#### Acceptance Criteria

1. IF a Data Property Value is a bare `Identifier`, THEN THE Data_Template_Parser SHALL NOT emit a Param_Token or a Data_Var_Token for that property AND SHALL apply the Warn_And_Skip convention, omitting the property from the parsed template.
2. IF a Data Property Value is a `MemberExpression` whose shape is neither a two-level nor a three-level Enum_Const_Member_Reference, THEN THE Data_Template_Parser SHALL NOT emit a Param_Token or a Data_Var_Token for that property AND SHALL apply the Warn_And_Skip convention, omitting the property from the parsed template.
3. IF a Data Property Value is a `MemberExpression` whose shape matches a two-level or three-level Enum_Const_Member_Reference but does not resolve to a defined value in `constBindings`, THEN THE Data_Template_Parser SHALL NOT emit a Param_Token or a Data_Var_Token for that property AND SHALL apply the Warn_And_Skip convention, omitting the property from the parsed template.
4. THE Data_Template_Parser SHALL accept only Enum_Const_Member_References and Date_Helper_Calls as newly supported Data Property Value shapes, in addition to the existing `Fake.*` calls, static literals, and nested object expressions.
5. THE Data_Template_Parser SHALL NOT emit a Param_Token or a Data_Var_Token for any Data Property Value regardless of its AST shape.

### Requirement 6: Treat date-helper descriptors as terminal leaves in data-path validation

**User Story:** As a test author, I want a date-helper-valued property to validate as a reachable data path while rejecting attempts to descend into it, so that references like `newTask.dueDate` validate and `newTask.dueDate.x` warns.

#### Acceptance Criteria

1. WHEN the Data_Path_Validator resolves the final segment of a referenced path to a parsed-template value that is a Date_Helper_Descriptor, THE Data_Path_Validator SHALL classify that value as a Terminal_Leaf, treat the referenced path as valid, and emit zero unknown-path warnings for that reference.
2. IF a referenced path contains at least one additional segment after a segment that resolves to a Date_Helper_Descriptor, THEN THE Data_Path_Validator SHALL treat the Date_Helper_Descriptor as a Terminal_Leaf that cannot be descended into, SHALL emit exactly one unknown-path warning identifying the full referenced path and the owning Data name, and SHALL stop validating remaining segments of that reference.
3. WHEN the Data_Path_Validator emits an unknown-path warning for a descent into a Date_Helper_Descriptor, THE Data_Path_Validator SHALL still emit the corresponding data reference token unchanged (warn-only validation that does not block compilation).

### Requirement 7: Preserve backward compatibility for existing Data templates

**User Story:** As a test author with existing specs, I want every `Data` template that compiles today to compile identically after this change, so that no existing test output or behavior regresses.

#### Acceptance Criteria

1. WHEN a Data Property Value is a `Fake.*(...)` call, a static string / number / boolean literal, or a nested object expression, THE Data_Template_Parser SHALL produce a parsed-template entry byte-identical to the entry produced by the pre-change Data_Template_Parser for the same input AST and same `constBindings`.
2. WHEN the Data_Template_Parser encounters an unresolvable or unsupported Data Property Value shape, THE Data_Template_Parser SHALL apply the existing Warn_And_Skip convention (record one `{ message, filePath, line }` warning and omit the affected property) identically to the pre-change behavior.
3. IF any error is raised while parsing a Data Property Value of any shape, THEN THE Data_Template_Parser SHALL NOT propagate the error (SHALL NOT throw) AND SHALL continue parsing the remaining properties of the Data Template.
4. WHEN the Compiler resolves a newly supported value shape, THE Compiler SHALL emit a Date_Helper_Descriptor or resolved literal value whose structure is identical to the output consumed by the unchanged runtime, with no modification to the runtime resolution module.
