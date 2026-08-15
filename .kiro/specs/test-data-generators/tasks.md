# Implementation Plan: Test Data Generators

## Overview

This plan implements structured test data generation for the Tomation DSL, following the existing compiler pipeline pattern (DSL stubs → compiler parsing → JSON emission → runtime resolution → UI display). Work is organized bottom-up: DSL stubs first, then compiler support, then the faker module, then runtime resolution, and finally UI display.

## Tasks

- [ ] 1. DSL package — Add Data and Fake stubs
  - [ ] 1.1 Add `Data` function and `Fake` object runtime stubs to `packages/dsl/index.js`
    - Add the `Data(template)` function that returns `{ __data: true, template: template }`
    - Add the `Fake` object with all generator methods (`firstName`, `lastName`, `fullName`, `dateOfBirth`, `phone`, `address`, `email`, `oneOf`, `number`) each returning a `{ __fake: true, type: 'fake', method, options }` descriptor
    - Export both `Data` and `Fake` from `module.exports`
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1_

  - [ ] 1.2 Add TypeScript declarations for `Data` and `Fake` to `packages/dsl/index.d.ts`
    - Declare the `DataTemplate<T>` interface with `__data: true` and `template: T`
    - Declare the `Data<T>` function with generic type inference
    - Declare the `Fake` object with typed method signatures including optional parameters (`gender`, `options`, etc.)
    - _Requirements: 1.1, 1.4, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1_

- [ ] 2. Compiler — Resolver and Parser support for Data files
  - [ ] 2.1 Extend `packages/compiler/src/resolver.js` to discover `.data.ts` files
    - Add `.data.ts` to the discovery extensions list
    - Support an optional `data` property in `tomation.config.ts` for specifying the data directory path
    - When `data` config is absent, discover `.data.ts` files by following import paths from test files (existing behavior)
    - Include discovered data files in the dependency graph and topological sort
    - _Requirements: 9.1, 9.2, 9.4, 9.5_

  - [ ] 2.2 Add `parseDataDeclaration` logic to `packages/compiler/src/parser.js`
    - Detect `const X = Data({...})` variable declarations in the AST
    - For properties that are `Fake.*()` call expressions, emit `{ type: "fake", method, options }` descriptors
    - For properties that are literals (string, number, boolean), emit inline values
    - Support nested object properties in Data templates
    - Handle both inline Data declarations in test files and imported Data templates from `.data.ts` files
    - _Requirements: 1.2, 1.3, 10.1, 10.2, 10.3, 10.5_

  - [ ]* 2.3 Write unit tests for Data/Fake parsing in `packages/compiler/src/parser.test.js`
    - Test parsing of inline `Data()` declarations with static and Fake values
    - Test parsing of imported Data templates from `.data.ts` files
    - Test nested object handling in Data templates
    - _Requirements: 1.2, 1.3, 10.5_

  - [ ] 2.4 Add const object resolution to the compiler parser
    - Track top-level `const X = { key: 'value' }` declarations in a `constBindings` map during AST traversal
    - When parsing `Fake.oneOf([X.key1, X.key2])` array elements, resolve `MemberExpression` nodes to their literal values from `constBindings`
    - When parsing step values (e.g., `Type(X.key).in(el)`), resolve member expressions to literal strings
    - Support const objects imported from other files via `~/` path aliases (follow imports, parse source, extract bindings)
    - Report validation error when a member expression references a non-existent property on a tracked const object
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ] 3. Compiler — Validator and Flattener support for Data
  - [ ] 3.1 Extend `packages/compiler/src/validator.js` with data validation rules
    - Validate that `Fake.oneOf` is called with a non-empty array; report error with file path and line number if empty
    - Validate data property references in test steps; error on references to non-existent template properties
    - Emit a warning when a `.data.ts` file exports no Data_Template definitions
    - _Requirements: 7.3, 9.6, 10.4_

  - [ ] 3.2 Extend `packages/compiler/src/flattener.js` to emit the `data` field in test JSON
    - When a test references Data templates, add a `data` field to the test entry in the emitted JSON
    - Represent static values as literals and Fake generators as typed placeholder objects `{ type: "fake", method, options }`
    - Support multiple Data templates per test
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ]* 3.3 Write unit tests for validator and flattener data handling
    - Test validator reports error on empty `Fake.oneOf([])`
    - Test validator reports error on invalid property references
    - Test validator warns on empty data file
    - Test flattener emits correct `data` field structure
    - _Requirements: 7.3, 9.6, 10.1, 10.2, 10.3, 10.4_

- [ ] 4. Checkpoint — Compiler pipeline verification
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Extension runtime — Faker module
  - [ ] 5.1 Create `packages/extension/src/faker.js` with all generator functions
    - Implement `pick(arr)`, `randomInt(min, max)`, `randomDigits(n)` utility functions
    - Implement `generateFirstName(options)` with male/female/random gender support using bundled name arrays
    - Implement `generateLastName()` using bundled last name array
    - Implement `generateFullName(options)` composing first + last name
    - Implement `generateDateOfBirth(options)` with minAge/maxAge constraints and format string support (tokens: YYYY, MM, DD, M, D)
    - Implement `generatePhone(options)` with US/UK/ES format patterns
    - Implement `generateAddress(options)` with part selection (street, city, country, zip, full)
    - Implement `generateEmail()` producing `{adjective}{noun}{digits}@{domain}` format
    - Implement `generateOneOf(options)` selecting from provided values array
    - Implement `generateNumber(options)` with min/max/decimals support
    - Implement `resolveFake(descriptor)` dispatch function mapping method names to generators
    - Include bundled data arrays (names, streets, cities, countries, email domains)
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 3.2, 3.3, 3.4, 3.5, 3.6, 4.2, 4.3, 4.4, 4.5, 4.6, 5.2, 5.3, 5.4, 5.5, 5.6, 6.2, 7.2, 8.2, 8.3, 8.4, 8.5, 8.6, 11.5_

  - [ ]* 5.2 Write property test for firstName gender correctness
    - **Property 4: firstName gender correctness**
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 5.3 Write property test for lastName membership
    - **Property 5: lastName membership**
    - **Validates: Requirements 2.4**

  - [ ]* 5.4 Write property test for fullName composition
    - **Property 6: fullName composition**
    - **Validates: Requirements 2.5**

  - [ ]* 5.5 Write property test for dateOfBirth age bounds
    - **Property 7: dateOfBirth age bounds**
    - **Validates: Requirements 3.2, 3.3, 3.6**

  - [ ]* 5.6 Write property test for date format token fidelity
    - **Property 8: Date format token fidelity**
    - **Validates: Requirements 3.4**

  - [ ]* 5.7 Write property test for phone format by country
    - **Property 9: Phone format by country**
    - **Validates: Requirements 4.2, 4.3, 4.4**

  - [ ]* 5.8 Write property test for address part correctness
    - **Property 10: Address part correctness**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6**

  - [ ]* 5.9 Write property test for email validity
    - **Property 11: Email validity**
    - **Validates: Requirements 6.2**

  - [ ]* 5.10 Write property test for oneOf membership
    - **Property 12: oneOf membership**
    - **Validates: Requirements 7.2**

  - [ ]* 5.11 Write property test for number range bounds and decimal precision
    - **Property 13: Number range bounds**
    - **Property 14: Number decimal precision**
    - **Validates: Requirements 8.2, 8.5, 8.6**

- [ ] 6. Extension runtime — Data resolution and value substitution
  - [ ] 6.1 Add `resolveTestData()` and `resolveTemplateRecursive()` to `packages/extension/src/background.js`
    - Implement `resolveTestData(testData)` that iterates all templates and resolves Fake descriptors to concrete values
    - Implement `resolveTemplateRecursive(prefix, obj, dataStore)` for dot-path key building with nested object support
    - Store resolved values in `runState.dataStore` as a flat map (`"templateName.property" → value`)
    - Call `resolveTestData` at the start of each test run before step execution begins
    - Import `resolveFake` from `faker.js`
    - _Requirements: 11.1, 11.2, 1.5_

  - [ ] 6.2 Extend `resolveValue()` in `packages/extension/src/background.js` to handle `{{data.X.Y}}` tokens
    - Add regex replacement for `{{data.<path>}}` patterns using `runState.dataStore` lookup
    - Log warning for unknown data paths without crashing execution
    - Ensure same resolved value is returned for repeated references to the same path within a single run
    - _Requirements: 11.3, 11.4_

  - [ ] 6.3 Send `DATA_RESOLVED` message to UI panel after resolution
    - After `resolveTestData` completes, send a `{ type: 'DATA_RESOLVED', data: dataStore }` message to the panel via `safeSendMessage`
    - _Requirements: 12.1, 12.3_

  - [ ]* 6.4 Write property test for resolveTestData completeness
    - **Property 15: resolveTestData completeness**
    - **Validates: Requirements 11.1**

  - [ ]* 6.5 Write property test for data token substitution consistency
    - **Property 16: Data token substitution consistency**
    - **Validates: Requirements 11.3, 11.4**

- [ ] 7. Checkpoint — Runtime resolution verification
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Extension UI — Test Data Panel
  - [ ] 8.1 Create `packages/extension/panel-vue/src/components/TestDataPanel.vue`
    - Display a collapsible "Test Data" section showing field name → resolved value pairs in a table
    - Accept resolved data as a prop (flat map of dot-path keys to values)
    - Support collapse/expand toggle for the section
    - _Requirements: 12.1, 12.2_

  - [ ] 8.2 Integrate `TestDataPanel` into the test plan view
    - Import and render `TestDataPanel` at the top of the step list when the test has data references
    - Listen for `DATA_RESOLVED` messages and update the panel with new values on each test run
    - Hide the Test Data section when the loaded test has no Data_Template references
    - _Requirements: 12.1, 12.3, 12.4_

- [ ] 9. Integration — End-to-end wiring and validation
  - [ ] 9.1 Create an example `.data.ts` file in `examples/playground-tests/` demonstrating the feature
    - Define a sample Data template (e.g., patient registration data) using `Data()` and `Fake.*` generators
    - Import and reference the Data template from an existing or new test file
    - Verify the compiled `.tomation.json` output includes the `data` field with correct structure
    - _Requirements: 1.1, 1.2, 1.3, 9.1, 9.2_

  - [ ]* 9.2 Write integration test for end-to-end compiler data pipeline
    - Compile a test project with `.data.ts` files and verify the JSON output
    - Test that imported Data templates are correctly resolved and flattened
    - _Requirements: 9.3, 10.1, 10.2, 10.3_

- [ ] 10. Final checkpoint — Full verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The faker module is implemented as a zero-dependency module bundled with the extension
- All property tests use fast-check and are located in `packages/compiler/src/faker.test.js`
- The design follows the existing pattern: DSL stubs → compiler serialization → runtime resolution (same as date helpers)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "5.1"] },
    { "id": 2, "tasks": ["2.3", "2.4", "3.1", "3.2", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "5.10", "5.11"] },
    { "id": 3, "tasks": ["3.3", "6.1"] },
    { "id": 4, "tasks": ["6.2", "6.3"] },
    { "id": 5, "tasks": ["6.4", "6.5", "8.1"] },
    { "id": 6, "tasks": ["8.2", "9.1"] },
    { "id": 7, "tasks": ["9.2"] }
  ]
}
```
