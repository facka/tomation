# Implementation Plan: Inline Test Data

## Overview

Make `Data()` declarable inline at the top level of a `.test.ts` / `.automation.ts` file, with an optional `.as(name)` override, so file-local deterministic data can sit next to the tests that use it. The guiding principle is that inline data is **additive and shape-compatible**: an inline `Data()` produces the same compiled artifacts (per-file `dataTemplates`, `{{data.<name>.<path>}}` tokens, and the per-test/automation `data` object) as an imported `.data.ts` one.

Almost all work lands in the **Compiler** (`packages/compiler/src/parser.js` for `.as` handling, the variable→Data_Name map, nested-path token emission, lexical scope, warn-only validation, and conflict resolution; `packages/compiler/src/flattener.js` for additive automation-data attachment) and the **DSL types** (`packages/dsl/index.d.ts`). The **Runtime** (`background.js`) and **Panel** (`panel-vue`) are deliberately **unchanged** — the compiled `data` shape is identical to the imported-data shape — so the tasks that touch them are **verification** tasks, not re-implementation. A backward-compatibility golden task guards the shared-only flow. Property tests implement the 12 correctness properties from the design, then an inline-data playground example and docs updates finish the work.

Ordering: compiler core (parse `.as` + `dataVars` + nested token emission + scope + validation + conflict) → flattener automation attachment → DSL types → runtime/panel verification + backward-compat → property tests → playground example + recompile → documentation → final wiring.

## Tasks

- [x] 1. Compiler parse: `.as()` handling and Data_Name derivation in `packages/compiler/src/parser.js`
  - [x] 1.1 Add `unwrapDataCall(initNode)` helper
    - Return `{ dataCall, asArg }` for both a plain `Data(...)` `CallExpression` (callee Identifier `Data`) and a `.as(...)`-chained `CallExpression` (callee `MemberExpression` with `property.name === 'as'` whose `object` is the `Data(...)` call); return `null` otherwise
    - `asArg` is the first argument node of `.as(...)` when present, else `null`
    - ES5 only (`var`, `function`, no arrow functions)
    - _Requirements: 2.2, 2.4_

  - [x] 1.2 Extend `parseDataDeclaration(declarator, constBindings, filePath, warnings)` to derive `varName` and Data_Name
    - Use `unwrapDataCall` to accept the plain and `.as()`-chained init shapes
    - Set `varName` = declarator identifier name; set `name` (Data_Name) from a valid `.as()` argument (a non-empty string literal), else fall back to `varName`
    - When `.as()` has no argument, a non-string/non-literal argument, or an empty string, push one `{ message, filePath, line }` warning and fall back to `varName` (E1 / Warn_And_Skip)
    - Return the updated shape `{ name, varName, template, seed? }`; preserve existing `Data(obj, { seed })` seed parsing
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.4, 11.3_

  - [ ]* 1.3 Write unit tests for `unwrapDataCall` and `parseDataDeclaration` in `packages/compiler/src/parser.test.js`
    - Plain `const user = Data({...})` → `name === varName === 'user'`; `.as('customer')` → `name === 'customer'`, `varName === 'user'`; seed recorded/omitted; invalid `.as` (empty string, numeric literal, identifier, missing) warns and falls back to `varName`
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.4, 11.3_

- [x] 2. Compiler parse: file-wide data-variable tracking (`dataVars`)
  - [x] 2.1 Build the `dataVars` map in `parseSource` and thread it through step/value helpers
    - After `dataTemplates` are collected, build `dataVars: Map<varName, { dataName, template }>` from each `result.dataTemplates[*]` (`varName`→`{ dataName: name, template }`) and from each import whose path ends in `.data` (`localName`→`{ dataName: localName, template: null }`)
    - Replace the `dataTemplateVars` `Set` usage: pass `dataVars` where `dataTemplateVars` is passed today, renaming the threaded parameter to `dataVars` across `extractValueExpression`, `extractStringOrTemplate`, `extractStep`, `extractSteps`, `extractIfStep`, `extractWhenStep`, `extractTaskInvocationParams`, `extractTest`, and the automation walk/`extractAutomation`
    - `has(name)` → `dataVars.has(name)`; emitted first segment → `dataVars.get(name).dataName`
    - _Requirements: 2.3, 3.5, 4.1, 4.2, 8.1, 8.3_

  - [ ]* 2.2 Write unit tests for `dataVars` construction in `packages/compiler/src/parser.test.js`
    - Inline var maps to its Data_Name (incl. `.as` override); imported `.data` var maps `localName`→`localName`; mixed inline + imported both present
    - _Requirements: 2.3, 3.5, 8.1, 8.3_

- [x] 3. Compiler parse: nested-path token emission
  - [x] 3.1 Add `extractDataMemberPath(node, dataVars)` helper
    - Walk a (possibly nested) member-access chain; if the **root object identifier** is a tracked data var, return `{ rootVar, path: [p1, p2, ...] }` (k ≥ 1), else `null`
    - Support dot access and string-literal computed access (`obj["task"]["type"]`)
    - _Requirements: 3.1, 3.4_

  - [x] 3.2 Emit nested data tokens in `extractValueExpression` and `extractStringOrTemplate`
    - Replace the existing 2-level data branch in **both** functions with a single branch using `extractDataMemberPath`: emit `'{{data.' + entry.dataName + '.' + dm.path.join('.') + '}}'`
    - Preserve branch ordering: `ctx.*` first, then data vars, then `constBindings` enum resolution, then the param fallback; leave the namespaced-enum 3-level `constBindings` branch untouched
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.1_

  - [ ]* 3.3 Write unit tests for nested token emission in `packages/compiler/src/parser.test.js`
    - `user.name` → `{{data.user.name}}`; `user.task.type` → `{{data.user.task.type}}`; `.as('buyer')` → `Data({color:'red'}).as('buyer')` referenced as `customer.color` → `{{data.buyer.color}}`; computed `user["task"]["type"]`; literal leaf and `Fake.*` leaf both emit a token (never inline the literal); assertion expected-value position (`AssertHasText(label, user.color)`)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.1_

- [x] 4. Compiler parse: lexical scope and warn-only path validation
  - [x] 4.1 Scope data resolution to test/automation bodies (empty data-var map for tasks)
    - Call task extraction with an empty data-var map (`new Map()`) so a bare identifier in a task body resolves as a param reference (`{{paramName}}`), never a data token; keep passing the real `dataVars` to test and automation extraction
    - Ensure task **invocations** from a test/automation body still resolve arguments against `dataVars` (via `extractTaskInvocationParams`), so `login({ user: user.name })` passes `{{data.user.name}}`
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 4.2 Add `validateDataPath(entry, path, filePath, line, warnings)` (warn-only) and call it on emission
    - Walk `entry.template` along `path`; if a segment is missing (incl. descending into a `Fake.*` leaf), push exactly one warning naming the unknown path, the Data_Name, and `file:line` (E4/E5)
    - NEVER throw and NEVER suppress the token — the token is still emitted; skip validation when `entry.template` is `null` (imported var with no local template)
    - Call from the `extractDataMemberPath` emission branch (task 3.2)
    - _Requirements: 11.4, 11.5, 11.6_

  - [ ]* 4.3 Write unit tests for scope and path validation in `packages/compiler/src/parser.test.js`
    - Data var inside a task body → `{{param}}` not `{{data...}}`; same ref in test/automation body → data token; invocation arg data-var member → `{{data.N.path}}` param; unknown path warns once and still emits the token; descend into `Fake.*` leaf warns
    - _Requirements: 9.1, 9.2, 9.3, 11.4_

- [x] 5. Compiler parse: Data_Name conflict detection
  - [x] 5.1 Detect and resolve Data_Name conflicts in `parseSource`
    - After building `dataVars`, detect two inline declarations resolving to the same Data_Name (E2) and an inline declaration colliding with an imported `.data` Data_Name (E3)
    - Push a warning naming the conflicting Data_Name and the file; deterministically pick one Data_Template (stable by source order / declaration line, documented precedence) and map all conflicting variables to it
    - Still emit output for every affected test and automation; continue compiling the rest (Warn_And_Skip)
    - _Requirements: 11.1, 11.2, 11.5, 11.6_

  - [ ]* 5.2 Write unit tests for conflict resolution in `packages/compiler/src/parser.test.js`
    - Two inline decls → one warning + deterministic pick + both vars resolve to the same Data_Name; inline vs imported collision → warning + deterministic pick; repeated compilation of the same input is stable; remaining tests still emitted
    - _Requirements: 11.1, 11.2, 11.5, 11.6_

- [ ] 6. Checkpoint — compiler parse layer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Compiler flatten: attach data to automations in `packages/compiler/src/flattener.js`
  - [x] 7.1 Add token-driven data attachment to the automation branch of `flattenSpec`
    - Mirror the existing test branch: when templates exist and `automationOut.steps` is present, use `extractReferencedTemplateNames(steps)` to collect referenced Data_Names, pull them from `allDataTemplates` (keyed by Data_Name), and set `automationOut.data` when non-empty
    - Leave the test branch verbatim; keep attachment keyed by Data_Name so inline and shared templates attach identically (also benefits imported shared data used by automations)
    - _Requirements: 4.1, 4.2, 4.3, 7.2, 7.3_

  - [ ]* 7.2 Write unit tests for automation attachment in `packages/compiler/src/flattener.test.js`
    - Automation referencing inline data gets `data` attached keyed by Data_Name; automation referencing nothing gets no `data`; a test and an automation referencing the same Data_Name both carry the identical template (incl. `__seed`)
    - _Requirements: 4.1, 4.2, 4.3, 7.2, 7.3_

- [x] 8. DSL types: optional `.as(name)` in `packages/dsl/index.d.ts`
  - [x] 8.1 Add `.as(name: string)` to the `Data()` return type
    - Add an optional `as(name: string): DataTemplate<T> & T` to the `DataTemplate<T>` interface so typed property access and re-chainability are preserved (`Data({...}).as('x').color` type-checks); keep `Data<T>(template, options?): DataTemplate<T> & T`
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ]* 8.2 Add type tests for `.as()` and typed property access
    - `tsd` (or equivalent) checks: `.as` present and optional on the `Data()` return (10.1); `user.name` typed from `T` (10.2); `Data({...}).as('x').color` type-checks (10.3)
    - _Requirements: 10.1, 10.2, 10.3_

- [ ] 9. Verify Runtime is unchanged for inline data (no feature code)
  - [ ]* 9.1 Add a compiler-side shape-equivalence test proving the runtime needs no change
    - Compile one fixture using inline `Data()` and an equivalent fixture using an imported `.data.ts` variable; assert the compiled per-test/automation `data` object (keys, nested structure, `__seed`) and the emitted `{{data.*}}` tokens are shape-identical, so `background.js` `resolveTestData` / `dataStore` / `DATA_RESOLVED` resolve inline data through the existing path with no code change
    - Confirm the existing `background.js` resolver suite (dot-path resolution, `dataStore` populated, `contextStore` untouched, store reset per run, `DATA_RESOLVED` emission) still passes unchanged — do NOT modify `background.js`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.2, 7.1_

- [ ] 10. Verify Panel is unchanged for inline data (no feature code)
  - [ ]* 10.1 Confirm inline data renders through the existing `testDataDisplay`
    - Assert `TestPlanView.vue` and `RunView.vue` display inline data via the existing `testDataDisplay` path (fed by `DATA_RESOLVED` → `setResolvedTestData`, falling back to the compiled `runnable.data.data` template) with no new display component and no `panel-vue` code change
    - _Requirements: 7.2, 7.3, 7.4_

- [ ] 11. Backward-compatibility golden test for the shared-only flow
  - [ ]* 11.1 Add a golden-output test for shared-only (`.data.ts` import) files
    - Compile a corpus of files that use only imported `.data.ts` data (no inline `Data()`, no `.as()`) and assert the emitted spec is byte-identical to the committed pre-feature baseline (e.g. the `examples/playground-tests` output)
    - _Requirements: 8.1, 8.2, 8.4_

- [ ] 12. Checkpoint — compiler + DSL + verification
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Property tests — name derivation and structure (fast-check, min 100 iterations each)
  - [ ]* 13.1 Property 1 — inline Data parses into a key-faithful template
    - **Property 1: Inline Data parses into a key-faithful template**
    - **Validates: Requirements 1.1, 1.4**
    - Tag `// Feature: inline-test-data, Property 1: ...`; min 100 iterations; in `packages/compiler/src/parser.test.js`
  - [ ]* 13.2 Property 2 — default Data_Name equals var name iff no valid `.as`
    - **Property 2: Default Data_Name equals the variable name iff there is no valid `.as`**
    - **Validates: Requirements 1.2, 2.1, 2.4, 11.3**
    - Tag `// Feature: inline-test-data, Property 2: ...`; min 100 iterations
  - [ ]* 13.3 Property 3 — valid `.as(S)` overrides the Data_Name
    - **Property 3: Valid `.as(S)` overrides the Data_Name**
    - **Validates: Requirements 2.2**
    - Tag `// Feature: inline-test-data, Property 3: ...`; min 100 iterations
  - [ ]* 13.4 Property 7 — seed recorded iff provided
    - **Property 7: Seed is recorded iff provided**
    - **Validates: Requirements 1.3, 5.4**
    - Tag `// Feature: inline-test-data, Property 7: ...`; min 100 iterations

- [ ] 14. Property tests — token emission and references (fast-check, min 100 iterations each)
  - [ ]* 14.1 Property 4 — member-access tokens round-trip to `{{data.<Data_Name>.<dotpath>}}`
    - **Property 4: Member-access tokens round-trip to `{{data.<Data_Name>.<dotpath>}}`**
    - **Validates: Requirements 2.3, 3.1, 3.4, 3.5, 6.1, 9.1**
    - Parameterize over Data_Name, path depth 1–4, and position (action value / assertion expected value / task-invocation argument); tag `// Feature: inline-test-data, Property 4: ...`; min 100 iterations
  - [ ]* 14.2 Property 5 — references emit a token rather than inlining the value
    - **Property 5: References emit a token rather than inlining the value**
    - **Validates: Requirements 3.2, 3.3**
    - Cover both static-literal and `Fake.*` leaves; tag `// Feature: inline-test-data, Property 5: ...`; min 100 iterations
  - [ ]* 14.3 Property 8 — data scope is lexical to test/automation bodies
    - **Property 8: Data scope is lexical to test/automation bodies**
    - **Validates: Requirements 9.1, 9.2, 9.3**
    - Positive in test/automation bodies, negative in task bodies; invocation arg passes `{{data.N.path}}`; tag `// Feature: inline-test-data, Property 8: ...`; min 100 iterations

- [ ] 15. Property tests — attachment, mixed origins, backward-compat, warnings (fast-check, min 100 iterations each)
  - [ ]* 15.1 Property 6 — referenced inline templates attach to every referencing test and automation
    - **Property 6: Referenced inline templates attach to every referencing test and automation**
    - **Validates: Requirements 4.1, 4.2, 4.3, 7.2, 7.3**
    - Over N tests/automations; tag `// Feature: inline-test-data, Property 6: ...`; min 100 iterations; in `packages/compiler/src/flattener.test.js`
  - [ ]* 15.2 Property 9 — mixed inline and imported data each map to their own Data_Name
    - **Property 9: Mixed inline and imported data each map to their own Data_Name**
    - **Validates: Requirements 8.3**
    - Tag `// Feature: inline-test-data, Property 9: ...`; min 100 iterations
  - [ ]* 15.3 Property 10 — backward-compatible compilation for shared-only files (golden)
    - **Property 10: Backward-compatible compilation for shared-only files**
    - **Validates: Requirements 8.1, 8.2, 8.4**
    - Golden-output comparison against the pre-feature baseline; tag `// Feature: inline-test-data, Property 10: ...`; min 100 iterations
  - [ ]* 15.4 Property 11 — unknown property path warns but still emits the token
    - **Property 11: Unknown property path warns but still emits the token**
    - **Validates: Requirements 11.4**
    - Exactly one warning naming unknown path + Data_Name + `file:line`; token still emitted; tag `// Feature: inline-test-data, Property 11: ...`; min 100 iterations
  - [ ]* 15.5 Property 12 — name conflicts warn and resolve deterministically without dropping output
    - **Property 12: Name conflicts warn and resolve deterministically without dropping output**
    - **Validates: Requirements 11.1, 11.2, 11.5, 11.6**
    - Deterministic pick stable across repeated compilation; all affected tests/automations still emitted; tag `// Feature: inline-test-data, Property 12: ...`; min 100 iterations

- [ ] 16. Checkpoint — all property tests created
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Playground example and recompile
  - [x] 17.1 Add an inline-data example under `examples/playground-tests`
    - Add a `.test.ts` that declares inline `Data()` both with and without `.as()`, uses nested properties (e.g. `user.task.type`), and references the data in `Type`/assertion steps; wire it into the existing playground spec/config so it compiles with the suite
    - _Requirements: 1.1, 2.2, 3.1, 3.4, 4.1, 6.1_
  - [x] 17.2 Recompile the playground spec
    - Run `npm run compile:playground` (single-shot) and confirm the inline-data example compiles into the spec with the expected `{{data.*}}` tokens and attached `data`
    - _Requirements: 4.1, 4.2, 4.3_

- [ ] 18. Documentation
  - [ ] 18.1 Document inline `Data()` in `examples/playground/docs.html`
    - Document inline `Data()`, optional `.as(name)`, nested `{{data.*}}` access, and that inline data is additive to the existing `.data.ts` + import flow
    - _Requirements: 1.1, 2.1, 2.2, 3.4, 8.1_
  - [ ] 18.2 Document inline `Data()` in `tomation-ai.md`
    - Mirror the docs.html content: inline `Data()`, `.as(name)`, nested access, additive-to-shared note
    - _Requirements: 1.1, 2.1, 2.2, 3.4, 8.1_

- [ ] 19. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (unit tests, property tests, type tests, verification tests) and can be skipped for a faster MVP. Per the workspace convention, the **user runs tests manually** — these tasks CREATE tests; they do not run them. The agent must not run `node --test` or `npm test`.
- All Compiler and Runtime code must be ES5 (`var`, function declarations, no arrow functions). TypeScript definition files (`index.d.ts`) are the exception.
- The Runtime (`background.js`) and Panel (`panel-vue`) are **not modified**; tasks 9–10 are verification only, resting on the design's shape-identical-JSON contract.
- Property tests use `fast-check` with `node:test`, a minimum of 100 iterations each, and a `// Feature: inline-test-data, Property <n>: <text>` tag, matching the existing compiler property-test convention.
- Build/compile verification uses single-shot commands only (e.g. `npm run compile:playground`); no watch modes or dev servers.
- All inline-data problems follow Warn_And_Skip: record a `{ message, filePath, line }` warning, apply a best-effort resolution, emit output, and continue. No inline-data condition is fatal — including unknown paths (standardized away from the earlier "hard error" wording).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "8.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1"] },
    { "id": 3, "tasks": ["2.2", "3.1"] },
    { "id": 4, "tasks": ["3.2"] },
    { "id": 5, "tasks": ["3.3", "4.1", "4.2", "5.1"] },
    { "id": 6, "tasks": ["4.3", "5.2", "7.1", "8.2"] },
    { "id": 7, "tasks": ["7.2", "9.1", "10.1", "11.1"] },
    { "id": 8, "tasks": ["13.1", "13.2", "13.3", "13.4", "14.1", "14.2", "14.3", "15.1", "15.2", "15.3", "15.4", "15.5"] },
    { "id": 9, "tasks": ["17.1"] },
    { "id": 10, "tasks": ["17.2"] },
    { "id": 11, "tasks": ["18.1", "18.2"] }
  ]
}
```
