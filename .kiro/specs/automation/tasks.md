# Implementation Plan: Automation

## Overview

This plan implements the Automation feature across five layers: DSL stub/types, compiler parsing, flattener extension, side panel UI, and background runtime. Each task builds incrementally, starting with the foundation (DSL) and ending with wiring the full execution flow.

## Tasks

- [x] 1. DSL Automation stub and type definitions
  - [ ] 1.1 Add Automation runtime stub to `packages/dsl/index.js`
    - Add the `Automation(fn)` function that returns `{ __automation: true, fn, as(label) }` matching the design
    - Export `Automation` alongside existing `Task` and `Test` exports
    - _Requirements: 1.1, 1.2_

  - [ ] 1.2 Add Automation type definitions to `packages/dsl/index.d.ts`
    - Add `AutomationBuilder<P>` interface with `__automation`, `fn`, and `as(label)` method
    - Add `AutomationDescriptor<P>` interface with `__automation`, `fn`, and `label`
    - Add `Automation<P>(fn: (params: P) => void): AutomationBuilder<P>` function declaration
    - Constrain P to objects with values of `string | number | Date`
    - _Requirements: 1.3, 1.5_

  - [ ]* 1.3 Write property test for DSL Automation descriptor shape
    - **Property 1: DSL Automation descriptor shape**
    - For any function `fn` and non-empty string `label`, `Automation(fn).as(label)` produces `{ __automation: true, fn, label }`
    - **Validates: Requirements 1.1, 1.2**

- [x] 2. Compiler — Automation param type extraction
  - [x] 2.1 Implement `extractAutomationParamTypes` in `packages/compiler/src/parser.js`
    - Use `ts.createSourceFile()` from the TypeScript compiler API to parse the raw TypeScript source into an AST
    - Walk the AST to find the `Automation(` call expression and locate the params type annotation on the function argument
    - For each property in the params type literal, extract the name, check for `questionToken` (optional `?` marker), and inspect the type node
    - Map types: `StringKeyword` → `"string"`, `NumberKeyword` → `"number"`, TypeReference `Date` → `"date"`, union of string literals → `"enum"` with `options[]`, anything else → `"string"` + warning
    - For optional params (`?`), include `optional: true` in the param metadata
    - For enum params (string union literals), include `options: string[]` containing the literal values in declaration order
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.9, 2.10_

  - [x] 2.2 Implement optional param extraction
    - Detect `questionToken` on property signatures via the TS AST
    - Emit `optional: true` in the param metadata when present
    - Optional params without a default resolve to empty string at runtime
    - _Requirements: 8.1_

  - [x] 2.3 Implement enum/union literal type detection
    - Detect `ts.isUnionTypeNode` where all members are `ts.isLiteralTypeNode` with `ts.isStringLiteral`
    - Emit `type: "enum"` and `options: [...]` containing the string values in declaration order
    - If the union contains non-string-literal members, fall back to `"string"` with a warning
    - _Requirements: 9.1, 9.2_

  - [ ]* 2.4 Write property test for param extraction round-trip
    - **Property 2: Compilation round-trip — param extraction preserves names, types, and order**
    - For any list of N params with names and types from {string, number, Date}, optional flags, and enum union literals, extraction preserves names, types, order, optional markers, and options arrays
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.9, 2.10, 3.2, 3.3, 3.5**

  - [ ]* 2.5 Write property test for unknown type annotation default
    - **Property 4: Unknown type annotation defaults to string with warning**
    - For any type annotation not in {string, number, Date} and not a string union literal, compiler emits `"string"` and produces a warning
    - **Validates: Requirements 2.6**

  - [ ]* 2.6 Write property test for multi-line type extraction
    - **Property 16: TS compiler API handles multi-line and complex type syntax**
    - For any type annotation with whitespace, comments, or trailing commas, extraction produces the same result as a single-line equivalent
    - **Validates: Requirements 2.2, 2.9, 2.10**

- [x] 3. Compiler — Automation declaration extraction
  - [x] 3.1 Implement `extractAutomation` in `packages/compiler/src/parser.js`
    - Pattern match `const X = Automation(fn).as('Label')` using the same AST walking approach as `extractTask`
    - Extract label from `.as()` call, call `extractAutomationParamTypes` for params, reuse existing step extraction for the function body
    - Handle `params.X` references as `{{X}}` template placeholders (same as Task param resolution)
    - Return `{ automation: { name, label, params, steps, line }, error, warnings }`
    - _Requirements: 2.1, 2.7, 2.8, 1.4_

  - [x] 3.2 Integrate `extractAutomation` into `parseFile` / `parseSource`
    - Add `automations` array to the ParsedFile output shape
    - Walk VariableDeclarator nodes and attempt `extractAutomation` alongside existing `extractTask`/`extractTest`
    - Pass the raw TypeScript source (before stripping) to `extractAutomationParamTypes`
    - _Requirements: 2.1_

  - [ ]* 3.3 Write property test for template placeholder resolution
    - **Property 3: Template placeholder resolution in Automation steps**
    - For any param map and step values with `{{X}}` placeholders, resolution equals `params[X]`
    - **Validates: Requirements 1.4, 2.7, 2.8, 6.2**

- [x] 4. File type detection and resolver support
  - [x] 4.1 Extend `detectFileType` in `packages/compiler/src/parser.js`
    - Recognize files ending in `.automation.ts` as file type `"automation"`
    - Ensure `.pom.ts` and `.test.ts` detection remains unchanged
    - _Requirements: 11.1_

  - [x] 4.2 Extend config parsing to accept `automations` path
    - Update `tomation.config.ts` schema to accept an optional `automations` field (string path, defaults to `'./automations'`)
    - _Requirements: 11.2_

  - [x] 4.3 Extend resolver to scan `*.automation.ts` files
    - Scan the configured automations directory for `*.automation.ts` files
    - Include automation files in the parse pipeline alongside pom and test files
    - Automations do NOT need `export default` — extracted by AST pattern (like Tests)
    - _Requirements: 11.3, 11.4_

  - [x] 4.4 Implement namespace derivation for automation files
    - Derive namespace prefix from the automation file's relative path (e.g., `automations/user-creation.automation.ts` → `UserCreation`)
    - Prefix automation names in the flattened spec (e.g., `UserCreation__Create Users`)
    - Ensure cross-file Task imports (via `~/` aliases) resolve correctly in automation step extraction
    - _Requirements: 11.5, 11.6_

- [x] 5. Compiler — Automation validation warnings
  - [ ] 5.1 Add validation checks in `extractAutomation`
    - Missing `.as()` call → warning (Req 7.1)
    - Empty params object (zero params) → warning suggesting Test instead (Req 7.2)
    - No recognizable steps in body → warning (Req 7.4)
    - _Requirements: 7.1, 7.2, 7.4_

  - [ ] 5.2 Add duplicate label detection in the flattener or resolver
    - When two automations share the same label string, emit a warning (Req 7.3)
    - _Requirements: 7.3_

  - [ ]* 5.3 Write property tests for validation warnings
    - **Property 8: Missing .as() produces warning**
    - **Property 9: No-params Automation produces warning**
    - **Property 10: Duplicate Automation labels produce warning**
    - **Property 11: Empty body Automation produces warning**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Flattener — emit automations array in spec output
  - [ ] 7.1 Extend `flattenSpec` in `packages/compiler/src/flattener.js`
    - Add `automations` array to the output spec object
    - Collect automations from `parsedTestFiles[].automations`, stripping `line` and internal fields
    - Each entry: `{ name: label, params: [{name, type}], steps: [...] }`
    - Preserve param declaration order in the emitted array
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 7.2 Write unit tests for flattener automations output
    - Verify automations array present in output
    - Verify param order preserved
    - Verify steps included with template placeholders
    - _Requirements: 3.1, 3.4, 3.5_

- [x] 8. Side Panel — Automation listing in home view
  - [ ] 8.1 Extend `renderHomeView` in `packages/extension/src/panel.js`
    - Iterate `spec.automations[]` alongside `spec.tests[]` in the home view
    - Render automation entries with a distinguishing badge/icon (e.g., `⚙` prefix or CSS class `automation-item`)
    - Add click handler that sets `currentRunnable = { type: 'automation', index: i, data: automation }` and navigates to Test_Plan_View
    - Introduce unified `currentRunnable` state object: `{ type: 'test'|'automation', index: number, data: object }`
    - Update existing test click handlers to use `currentRunnable = { type: 'test', index: i, data: test }`
    - Update `renderTestPlanView` to branch on `currentRunnable.type` (render param form for automations, skip for tests)
    - _Requirements: 4.1, 4.2, 4.3, 11.1_

  - [ ] 8.2 Extend search filter to include automation names
    - Update `filterTests` and `applySearchFilter` to include automation names in case-insensitive substring matching
    - _Requirements: 4.4_

  - [ ]* 8.3 Write property test for search filter includes automation names
    - **Property 5: Search filter includes automation names**
    - For any query and automation names, filter returns all names containing the query as case-insensitive substring
    - **Validates: Requirements 4.4**

- [x] 9. Side Panel — Parameter form rendering
  - [x] 9.1 Implement `renderParamForm` in `packages/extension/src/panel.js`
    - Render a `<div class="param-form">` above the step checklist when an Automation is selected
    - For each param: render label (param name) and input matching type (`text`, `number`, `date`)
    - For enum params: render a `<select>` dropdown with `<option>` for each value in `options[]`
    - For optional params: add "(optional)" badge to label, omit `required` attribute, use `defaultValue` as placeholder if present
    - Add `data-param-name` and `data-param-type` attributes to inputs/selects
    - Preserve param order from the spec
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 9.2 Implement select dropdown rendering for enum params
    - Render `<select>` with one `<option value="x">x</option>` for each entry in `options[]`
    - Add `required` attribute (unless the param is also optional)
    - Constrain user to declared options — no free-text fallback
    - _Requirements: 9.3, 9.4_

  - [x] 9.3 Add param form CSS to `packages/extension/src/panel.html`
    - Style `.param-form`, `.param-row`, labels, and inputs
    - Add validation error styling (`.param-error`)
    - Add optional badge styling (`.optional-badge`)
    - Style `<select>` elements to match existing input styling
    - _Requirements: 5.1, 5.7_

  - [ ]* 9.4 Write property test for enum param renders as select dropdown
    - **Property 14: Enum param renders as select dropdown**
    - For any param with `type: "enum"` and `options`, a `<select>` is rendered with matching `<option>` elements
    - **Validates: Requirements 9.3, 9.4**

- [x] 10. Side Panel — Validation and Run for Automations
  - [ ] 10.1 Implement validation and RUN_AUTOMATION dispatch
    - On Run click, check `currentRunnable.type === 'automation'` to decide whether to collect param form values
    - Collect param form values (inputs and selects)
    - Validate only **required** fields (those without `optional: true`) are non-empty; if any required field is empty, show inline validation message and abort
    - For optional empty fields: send empty string
    - Coerce types: number → `parseFloat(value)`, date → value as-is (ISO YYYY-MM-DD), enum → value as-is (selected option)
    - Send `{ type: 'RUN_AUTOMATION', automationIndex: currentRunnable.index, params, checkedSteps, config }` message
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 8.3_

  - [ ]* 10.2 Write property test for empty param validation
    - **Property 6: Empty param validation prevents execution**
    - For any param form with at least one required empty field, Run is blocked and validation message shown
    - **Validates: Requirements 6.3, 8.4**

  - [ ]* 10.3 Write property test for number param coercion
    - **Property 7: Number param coercion**
    - For any valid numeric string, the sent value equals `parseFloat(input)`
    - **Validates: Requirements 6.4**

- [ ] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Background Runtime — RUN_AUTOMATION handler
  - [ ] 12.1 Add `RUN_AUTOMATION` message handler in `packages/extension/src/background.js`
    - Handle the `RUN_AUTOMATION` message type in the existing message listener
    - Look up `spec.automations[msg.automationIndex]`
    - Implement `startAutomationRun` with **full parity** to `startRun`:
      - Initialize `runState` with `passCount`, `failCount`, `stepIndex`, `running`, `contextStore` (seeded with user-provided params)
      - Lock tab and setup tab tracker (same as `startRun`)
      - Emit `IN_PROGRESS` message to panel before each step (same as test execution)
      - Resolve `{{paramName}}` placeholders via existing `resolveValue` function
      - Dispatch step to content script runtime
      - On success: increment `passCount`, emit `LOG` via `emitLog`, advance to next step
      - On failure: increment `failCount`, emit `LOG` via `emitLog`, enter `STEP_FAILED_AWAITING_ACTION` state if retry/skip is enabled
      - On completion: emit summary message with pass/fail counts, teardown tab tracker, unlock tab
    - Extract a shared `runStepLoop` helper if feasible, or explicitly wire all lifecycle hooks (LOG, IN_PROGRESS, retry/skip, tab tracking, teardown)
    - The only difference from test execution: automation has user-provided params pre-loaded into context store, and steps come from `spec.automations[i].steps`
    - _Requirements: 6.2_

  - [ ]* 12.2 Write unit tests for RUN_AUTOMATION handler
    - Verify automation steps resolved with provided params
    - Verify existing `resolveValue` handles automation param tokens
    - _Requirements: 6.2_

- [x] 13. Spec validator extension
  - [x] 13.1 Extend `validateSpec` in `packages/extension/src/panel.js`
    - Add validation for `automations` array structure (if present): each entry must have `name` (string), `params` (array), `steps` (array)
    - Each param entry must have `name` (string) and `type` (one of `"string"`, `"number"`, `"date"`, `"enum"`)
    - For params with `type: "enum"`, validate that `options` is a non-empty array of strings
    - Optional fields (`optional`, `defaultValue`, `options`) are validated only when present
    - Show error view on malformed automations data
    - _Requirements: 3.1, 3.2, 3.3, 9.2_

- [ ] 14. Side Panel — Param value persistence
  - [ ] 14.1 Implement `saveParamValues` and `loadParamValues` in `packages/extension/src/panel.js`
    - `saveParamValues(automationName, params)`: store param values in `chrome.storage.local` keyed by `automation_params_{automationName}`
    - `loadParamValues(automationName)`: retrieve stored values from `chrome.storage.local`
    - Handle storage errors gracefully (silent fail — form renders with empty fields)
    - _Requirements: 10.1, 10.4_

  - [ ] 14.2 Integrate persistence into form rendering and run completion
    - In `renderParamForm`: call `loadParamValues` and pre-fill inputs with stored values (if any)
    - After successful automation run: call `saveParamValues` with the param values used
    - If no stored values exist, render with empty fields (or defaults for optional params)
    - _Requirements: 10.2, 10.3, 5.9_

  - [ ]* 14.3 Write property test for value persistence round-trip
    - **Property 15: Last-used values are persisted and restored**
    - For any automation name and param value map, storing and then loading produces the same values; form pre-fills correctly
    - **Validates: Requirements 10.1, 10.2, 10.3**

- [ ] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Automations live in dedicated `*.automation.ts` files in a configured `automations` directory
- The existing `resolveValue` function in background.js already handles `{{paramName}}` template resolution, so the runtime reuses it directly
- The compiler's step extraction logic is shared between Task, Test, and Automation — no duplication needed
- The `typescript` package is already a dependency of `@tomationjs/compiler` — no new dependency needed for `ts.createSourceFile()`
- Param value persistence (task 14) is purely a panel feature — no compiler or runtime changes are needed
- `ts.createSourceFile` is used for fast single-file parsing without type-checking — it does NOT create a full TypeScript program
- JSDoc `@default` extraction is deferred — optional params without a default resolve to empty string at runtime
- The panel uses a unified `currentRunnable` abstraction (`{ type, index, data }`) to avoid duplicating test/automation branching logic
- `startAutomationRun` must have full parity with `startRun` — extract shared `runStepLoop` if feasible

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.1", "4.2"] },
    { "id": 4, "tasks": ["4.3", "4.4", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "7.1"] },
    { "id": 6, "tasks": ["7.2", "8.1", "8.2", "9.1"] },
    { "id": 7, "tasks": ["8.3", "9.2", "9.3", "9.4", "10.1"] },
    { "id": 8, "tasks": ["10.2", "10.3", "12.1"] },
    { "id": 9, "tasks": ["12.2", "13.1", "14.1"] },
    { "id": 10, "tasks": ["14.2", "14.3"] }
  ]
}
```
