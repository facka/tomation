# Implementation Plan: DSL v2 — Improved Readability with TypeScript Support

## Overview

This plan implements the DSL v2 compiler pipeline across three packages: `@tomation/dsl` (builder API + types), `@tomation/compiler` (TypeScript-aware parsing), and `tomation-extension` (XPath runtime + conditional flattening). Tasks are ordered so each step builds on the previous, starting with the DSL stubs, then the compiler pipeline (stripper → parser → POM extractor → resolver), and finally the extension runtime changes.

## Tasks

- [x] 1. DSL Package — Builder API and Type Definitions
  - [x] 1.1 Implement the `is` proxy, `Element()` constructor, and matcher factories in `packages/dsl/index.js`
    - Implement the `is` Proxy that returns an `ElementBuilder` for any uppercase property access (e.g., `is.BUTTON`, `is.INPUT`)
    - Implement `is.ELEMENT(xpath)` returning an `XPathElementBuilder`
    - Implement standalone `Element(xpath)` function returning an `XPathElementBuilder`
    - Implement `ElementBuilder` with `.where()`, `.childOf()`, and `.as()` methods
    - Implement `XPathElementBuilder` with `.as()` method
    - Implement matcher factories: `innerTextIs`, `innerTextContains`, `classIncludes`, `placeholderIs`, `nameIs`, `typeIs`, `idIs`
    - Implement `Task`, `Test`, and all action stubs: `Click`, `Type`, `TypePassword`, `Select`, `AssertExists`, `AssertNotExists`, `AssertHasText`, `Navigate`, `Wait`, `WaitFor`, `WaitForGone`, `Manual`
    - _Requirements: 2.5, 3.1, 3.2, 5.1, 6.1, 15.1–15.12_

  - [x] 1.2 Update TypeScript type definitions in `packages/dsl/index.d.ts` and `packages/dsl/globals.d.ts`
    - Add `ElementBuilder`, `XPathElementBuilder`, `ElementDescriptor` interfaces
    - Add `WhereMatcher` type union for all matcher return types
    - Add type signatures for `Task`, `Test`, all action functions, and matcher factories
    - Add `Element(xpath: string): XPathElementBuilder` function signature
    - Add `is` proxy type with mapped HTML tag names and `ELEMENT` method
    - _Requirements: 2.5, 3.1, 3.2, 5.1, 6.1_

  - [x] 1.3 Write unit tests for the DSL package builder and stubs
    - Test `is.BUTTON.where(innerTextIs('X')).as('Y')` returns correct descriptor
    - Test `Element(xpath).as('Label')` and `is.ELEMENT(xpath).as('Label')` produce equivalent descriptors
    - Test `.childOf(parent)` chains
    - Test all matcher factories return correct shape
    - Test action stubs (Click, Type, etc.) are callable
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 4.1_

- [ ] 2. Compiler — TypeScript Stripper
  - [ ] 2.1 Create `packages/compiler/src/ts-stripper.js` implementing `stripTypes(source, filePath)`
    - Add `typescript` as a production dependency in `packages/compiler/package.json`
    - Implement `stripTypes()` using `ts.transpileModule` with `isolatedModules: true`
    - Configure `target: ESNext`, `module: ESNext`, preserve JSX for `.tsx` files
    - Return `{ code }` object with stripped JavaScript
    - Handle transpilation errors — return `{ error: { message, line } }` on failure
    - _Requirements: 1.1, 1.4, 1.5_

  - [ ]* 2.2 Write property test: Type stripping produces valid JS with preserved line count
    - **Property 1: Type Stripping Produces Valid JavaScript with Preserved Line Count**
    - Generate TypeScript snippets with type annotations, interfaces, type aliases inserted into valid JS
    - Assert output is parseable by acorn and has the same line count as input
    - **Validates: Requirements 1.1, 1.5**

  - [ ]* 2.3 Write unit tests for `ts-stripper.js`
    - Test stripping interfaces, type annotations, generics, enums
    - Test `.tsx` files preserve JSX
    - Test syntax errors return error with file path and line number
    - Test `.js` passthrough (no-op if already valid JS)
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

- [ ] 3. Compiler — Namespace Derivation
  - [ ] 3.1 Implement `deriveNamespace(filePath)` in `packages/compiler/src/pom.js` (or new `namespace.js` module)
    - Convert kebab-case file name to PascalCase
    - Strip `.pom.ts`, `.page.ts`, `.pom.js`, `.page.js` suffixes before conversion
    - Throw error if file name contains underscores (with kebab-case suggestion)
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 3.2 Write property test: Namespace derivation is deterministic and injective
    - **Property 7: Namespace Derivation Is Deterministic and Injective**
    - Generate valid kebab-case file names → assert same input always produces same output
    - Generate file names with underscores → assert error is thrown
    - Generate pairs of distinct kebab-case names → assert distinct namespaces
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

  - [ ]* 3.3 Write unit tests for namespace derivation
    - Test `login-page.ts` → `LoginPage`
    - Test `login-page.pom.ts` → `LoginPage` (suffix stripped)
    - Test `my-app.page.js` → `MyApp` (suffix stripped)
    - Test `login_page.ts` → throws with suggestion
    - Test duplicate namespace detection
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 4. Compiler — Parser v2 (Element Patterns)
  - [ ] 4.1 Extend `packages/compiler/src/parser.js` to detect `is.TAG.where(matcher).as('Label')` element patterns
    - Implement `extractV2Element()` to walk the method chain: `.as()` → `.where()` → `.childOf()` → `is.TAG`
    - Extract tag (lowercase), label (from `.as()`), where matcher (from factory call), childOf (from `.childOf()`)
    - Emit error for multiple `.where()` calls on same chain
    - Emit error for missing `.as()` argument or non-string label
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.1_

  - [ ] 4.2 Extend parser to detect XPath element patterns: `Element(xpath).as('Label')` and `is.ELEMENT(xpath).as('Label')`
    - Implement `extractXPathElement()` detecting both constructor forms
    - Set tag to `'*'`, where to `{}`, populate `xpath` field
    - Emit error for missing/non-string xpath argument
    - Emit error for missing `.as('Label')` call
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 4.3 Write property test: Element builder pattern produces valid descriptors
    - **Property 2: Element Builder Pattern Produces Valid Descriptors**
    - Generate tag names, matcher types, and label strings
    - Assert extracted ElementDef has lowercase tag, non-empty label, and correct where shape
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 4.4 Write property test: XPath element constructor equivalence
    - **Property 4: XPath Element Constructor Equivalence**
    - Generate XPath strings and labels
    - Assert `Element(xpath).as(label)` and `is.ELEMENT(xpath).as(label)` produce identical ElementDef
    - **Validates: Requirements 3.1, 3.2**

  - [ ]* 4.5 Write property test: Multiple .where() calls are rejected
    - **Property 3: Multiple Where Calls Are Rejected**
    - Generate element chains with 2+ `.where()` calls
    - Assert error is emitted and no ElementDef is produced
    - **Validates: Requirement 2.3**

- [ ] 5. Compiler — Parser v2 (Task/Test Patterns and Actions)
  - [ ] 5.1 Extend parser to detect `Task('name', fn)` and `Test('name', fn)` declarations
    - Implement `extractV2Task()` — extract task name, function params (destructured)
    - Implement `extractV2Test()` — extract test name and steps from body
    - Track `const { x, y } = params` destructuring for conditional resolution
    - _Requirements: 5.1, 5.2, 6.1_

  - [ ] 5.2 Implement step extraction and action mapping for all 12 DSL actions
    - Implement `extractV2Step()` with the full action table: Click, Type, TypePassword, Select, AssertExists, AssertNotExists, AssertHasText, Navigate, Wait, WaitFor, WaitForGone, Manual
    - Handle `.in(element)` chain pattern for Type/TypePassword/Select
    - Handle `PageName.taskName(params)` → task invocation steps
    - Implement element reference resolution to namespaced keys
    - _Requirements: 15.1–15.12, 5.3, 5.4_

  - [ ] 5.3 Implement conditional `if` step extraction in the parser
    - Implement `extractIfStep()` supporting truthy, falsy, equals, notEquals patterns
    - Implement `extractCondition()` resolving identifiers against tracked destructured params
    - Recursively extract steps from if-block bodies (including nested ifs)
    - Emit warning for `else` blocks
    - Emit warning for unsupported condition patterns
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ] 5.4 Implement unrecognized statement warning logic
    - Emit warning with file path, line number, source snippet for unrecognized statements inside task/test bodies
    - Skip without producing a step, continue parsing
    - Silently ignore top-level statements outside Task/Test bodies
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 14.1, 14.2_

  - [ ]* 5.5 Write property test: Task extraction completeness
    - **Property 6: Task Extraction Completeness**
    - Generate task bodies with N recognized action calls
    - Assert parser extracts exactly N steps in source order plus correct param names
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ]* 5.6 Write property test: Conditional step parsing correctness
    - **Property 9: Conditional Step Parsing Correctness**
    - Generate if-statements with supported condition patterns and tracked params
    - Assert correct op/param values and recursive then-step extraction
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

  - [ ]* 5.7 Write property test: Action mapping correctness
    - **Property 12: Action Mapping Correctness**
    - Generate each recognized action call → assert correct spec.json step structure
    - **Validates: Requirements 15.1–15.12**

  - [ ]* 5.8 Write property test: Unrecognized statement handling
    - **Property 11: Unrecognized Statement Handling**
    - Generate unrecognized statements inside task bodies → assert warning emitted, no step produced
    - Generate top-level statements → assert no warning emitted
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4**

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Compiler — POM Extractor v2
  - [ ] 7.1 Extend `packages/compiler/src/pom.js` to implement `extractPomV2(parsedFile)` 
    - Derive namespace from file name using `deriveNamespace()`
    - Namespace element keys as `<Namespace>__<variableName>`
    - Namespace task keys as `<Namespace>__<taskName>`
    - Resolve `childOf` variable references to namespaced keys
    - Detect namespace collisions across files
    - _Requirements: 8.1, 8.4, 4.2, 4.3_

  - [ ]* 7.2 Write property test: childOf produces valid parent references
    - **Property 5: childOf Produces Valid Parent References**
    - Generate element chains with childOf referencing declared elements in the same file
    - Assert POM extractor resolves variable name to a valid namespaced key in pageElements
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [ ]* 7.3 Write unit tests for POM extractor v2
    - Test namespace derivation + element key namespacing
    - Test task key namespacing
    - Test childOf resolution
    - Test namespace collision error
    - _Requirements: 4.2, 4.3, 8.1, 8.4_

- [ ] 8. Compiler — Resolver v2 (TypeScript + Path Aliases + Config)
  - [ ] 8.1 Extend `packages/compiler/src/resolver.js` to support `.ts`/`.tsx` file discovery and `~/` path aliases
    - Add `.ts`, `.tsx`, `.pom.ts`, `.test.ts` to file discovery patterns
    - Implement `resolveAlias()` handling `~/` → `baseUrl` resolution
    - Implement `resolveWithExtensions()` trying `.ts`, `.tsx`, `.js`, `.pom.ts`, `.test.ts`, `index.ts`, `index.js`
    - Emit error for unresolvable `~/` imports
    - _Requirements: 1.2, 9.1, 9.2, 9.3_

  - [ ] 8.2 Implement config loading for `tomation.config.ts` with `meta.urls` array support
    - Support both `tomation.config.ts` and `tomation.config.js`
    - Strip types from `.ts` config before evaluating
    - Parse `meta.urls` as array of URL strings
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ]* 8.3 Write property test: Path alias resolution consistency
    - **Property 8: Path Alias Resolution Consistency**
    - Generate `~/` imports from different source files → assert same absolute path regardless of importer
    - Generate relative imports → assert resolution depends on importer location
    - **Validates: Requirements 9.1, 9.3**

  - [ ]* 8.4 Write unit tests for resolver v2
    - Test `.ts`/`.tsx` file discovery
    - Test `~/` alias resolution with various baseUrl configs
    - Test unresolvable `~/` import error
    - Test config loading from `.ts` file
    - Test `meta.urls` array parsing
    - _Requirements: 1.2, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3_

- [ ] 9. Checkpoint - Ensure all compiler tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Extension Runtime — XPath Element Support
  - [ ] 10.1 Extend `findElement()` in `packages/extension/src/runtime.js` to support XPath-based element lookup
    - When element descriptor has `xpath` field, use `document.evaluate()` with `XPathResult.FIRST_ORDERED_NODE_TYPE`
    - Bypass normal tag+where polling logic for XPath elements
    - Poll with `requestAnimationFrame` until node found or 5-second timeout expires
    - Fail step with standard "element not found" error on timeout
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 3.5, 3.6_

  - [ ]* 10.2 Write unit tests for XPath runtime support
    - Test XPath element found immediately
    - Test XPath polling timeout
    - Test normal elements still use tag+where logic
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [ ] 11. Extension Runtime — URL Array Hostname Matching
  - [ ] 11.1 Update hostname matching in `packages/extension/src/background.js` to check `meta.urls` array
    - Replace single `meta.url` check with `meta.urls.some(...)` check
    - No warning if current page hostname matches any URL in the array
    - _Requirements: 10.4_

  - [ ]* 11.2 Write property test: URL array hostname matching
    - **Property 13: URL Array Hostname Matching**
    - Generate arrays of URLs and page hostnames → assert no warning iff any URL matches
    - **Validates: Requirement 10.4**

  - [ ]* 11.3 Write unit tests for URL array matching
    - Test single URL match (backward compat shape)
    - Test multiple URLs — first matches, last matches, none match
    - _Requirements: 10.4_

- [ ] 12. Extension Background — Conditional Step Flattening
  - [ ] 12.1 Extend the step flattener in `packages/extension/src/background.js` to evaluate `"if"` steps at runtime
    - Implement `evaluateCondition(condition, params)` supporting truthy, falsy, equals, notEquals
    - Splice `then` steps into flat list when condition is true
    - Skip `then` steps entirely when condition is false
    - Handle nested `if` steps recursively
    - Apply normal template resolution to included `then` steps
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [ ]* 12.2 Write property test: Flattener conditional evaluation semantics
    - **Property 10: Flattener Conditional Evaluation Semantics**
    - Generate if-steps with various conditions and param values
    - Assert correct inclusion/exclusion of then-steps and total step count
    - **Validates: Requirements 7.7, 7.8, 7.9, 13.1–13.7**

  - [ ]* 12.3 Write unit tests for conditional step flattening
    - Test truthy param includes then-steps
    - Test falsy param excludes then-steps
    - Test equals/notEquals conditions
    - Test nested if-steps
    - Test template resolution in included steps
    - _Requirements: 13.1–13.7_

- [ ] 13. Integration — Full Pipeline Wiring
  - [ ] 13.1 Wire the v2 pipeline in the compiler CLI entry point
    - Integrate: resolve → stripTypes → parseFile (v2) → extractPomV2 → flatten → deduplicate → emit
    - Ensure the pipeline handles mixed `.ts` and `.js` files
    - Ensure `spec.json` output format is unchanged
    - _Requirements: 1.1, 1.2, 2.1, 5.1, 6.1, 8.1_

  - [ ]* 13.2 Write integration tests with the example v2 POM + test files
    - Compile a full v2 project (POM files with elements, tasks, conditions + test files)
    - Assert spec.json output matches expected structure
    - Test that warnings are emitted for unrecognized statements without halting
    - _Requirements: 1.1, 2.1, 5.1, 6.1, 7.1, 8.1, 11.3, 15.1–15.12_

- [ ] 14. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses Node.js built-in test runner (`node --test`) and `fast-check` for property-based tests
- All code is JavaScript (the compiler itself is JS, not TS) — TypeScript is only used by the DSL authors

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.3", "2.2", "2.3", "3.2", "3.3", "4.1", "4.2"] },
    { "id": 2, "tasks": ["4.3", "4.4", "4.5", "5.1", "5.2", "5.3", "5.4"] },
    { "id": 3, "tasks": ["5.5", "5.6", "5.7", "5.8", "7.1", "8.1", "8.2"] },
    { "id": 4, "tasks": ["7.2", "7.3", "8.3", "8.4", "10.1", "11.1", "12.1"] },
    { "id": 5, "tasks": ["10.2", "11.2", "11.3", "12.2", "12.3", "13.1"] },
    { "id": 6, "tasks": ["13.2"] }
  ]
}
```
