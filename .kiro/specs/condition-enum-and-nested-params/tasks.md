# Implementation Plan: Condition Enum Resolution & Nested Param Paths

## Overview

This plan implements the condition pipeline changes across the Compiler
(`packages/compiler/src/parser.js`) and the Runtime_Condition_Evaluator
(`packages/extension/src/background.js`), joined by the evolved `Condition_Descriptor`
shape (`path: string[]`). Work proceeds pure-core-first: build the new pure LHS/RHS
helpers and predicate, integrate them into `extractCondition`, thread the warn-and-skip
warning up through `extractIfStep`/`extractWhenStep` (using the existing warnings array),
then wire the runtime path-walk in `evaluateCondition`. The parser emit change (`path` for all
param-based conditions) and the runtime consume change land together and are guarded by
the cross-component round-trip (Property 12). Consumer pass-through (`flattener.js`,
`emitter.js`, `expandStep`/`emitLog`/plan-builder) is verified, not modified.

Implementation language: JavaScript (Node.js), matching the existing `.js` sources and
`node:test` + `fast-check` test suites. Property tests carry the tag comment
`// Feature: condition-enum-and-nested-params, Property {n}: {property text}` and run a
minimum of 100 iterations. Per workspace convention, test steps are "write and run" — the
user runs the test suite manually.

## Tasks

- [x] 1. Implement `extractParamPath` pure LHS helper in parser.js
  - [x] 1.1 Add `extractParamPath(node, trackedParams)` to `packages/compiler/src/parser.js`
    - Walk a `MemberExpression` chain (or bare `Identifier`) collecting segments from the outermost node inward, then reverse to source order
    - Support dot access and string-literal bracket access (`encounter['type']` ≡ `encounter.type`)
    - Root at a tracked param → keep the root segment (`encounter.type` → `['encounter','type']`); root at `params` → drop the `params` root segment (`params.encounter.type` → `['encounter','type']`)
    - Bare tracked-param identifier or single-segment `params.X` → single-segment path (`['X']`), identical to flat-param behavior
    - Return `null` (→ Warn_And_Skip) for: computed non-string-literal segments (`x[key]`, `x[0]`), any non-identifier segment, a root that is neither a tracked param nor `params`, or a chain exceeding 16 segments
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 1.2 Write and run property tests for `extractParamPath` in parser.test.js
    - **Property 1: Path extraction round-trip (depth 1..16)** — tag `// Feature: condition-enum-and-nested-params, Property 1` (Validates Req 3.1, 3.2, 3.4)
    - **Property 2: `params` root is excluded from the path** — tag `Property 2` (Validates Req 3.3, 3.4)
    - **Property 3: String-literal bracket access equals dot access** — tag `Property 3` (Validates Req 3.5)
    - Generators build acorn AST member-access chains (or small source strings parsed with `locations: true`), matching the existing `parser.test.js` fast-check pattern
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 2. Implement RHS resolution helpers in parser.js
  - [x] 2.1 Add `resolveRhsReference(node, constBindings, filePath)` to parser.js
    - Accept `EnumName.KEY`, `EnumName["KEY"]`, `ConstName.KEY`, `ConstName["KEY"]`; normalize the string-literal `["KEY"]` computed form to the property name before delegating to the existing `resolveConstMemberExpression`
    - Resolve against `constBindings` only (built by `buildConstBindings`, already merging imported enum/const bindings) — no global-scope or extra import lookup (Req 1.6)
    - Return `{ ok: true, value }` when it resolves to a string/number/boolean literal (type preserved); `{ ok: false, reason }` for unknown object, unknown key, non-primitive, or computed non-literal
    - Use a throwaway warnings array when calling `resolveConstMemberExpression` so its low-level "Unknown property" warning is not double-emitted (existing element-matcher callers stay unchanged)
    - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.2, 2.5, 5.2_

  - [ ]* 2.2 Write and run property test for enum/const RHS resolution in parser.test.js
    - **Property 6: Enum/const RHS resolution preserves type and maps operator** — tag `// Feature: condition-enum-and-nested-params, Property 6` (Validates Req 1.1–1.5, 2.1–2.5, 5.2, 5.4)
    - Generate `constBindings` maps with string and number member values; assert resolved `value` strictly equals the binding with matching `typeof`, `op` is `equals`/`notEquals`, and boolean members map to `truthy`/`falsy` with no `value`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 5.2, 5.4_

- [x] 3. Implement `usesNewConditionConstruct` predicate in parser.js
  - [x] 3.1 Add `usesNewConditionConstruct(testNode, trackedParams)` to parser.js
    - Return true when the condition (including the operand wrapped by a negation or binary expression) uses (a) an enum/const member reference on the RHS (`Identifier.Identifier` or `Identifier["str"]` where the object is not `ctx` and not a bare param root), or (b) a nested LHS member-access path of depth > 1 rooted at a tracked param or `params`
    - Single-segment param paths and pure string/boolean/number literal RHS are NOT new constructs
    - This predicate is now OPTIONAL / message-only: it no longer gates control flow (all unresolvable conditions → `null` → Warn_And_Skip). It may be used only to craft a more specific warning message (e.g. "unresolvable enum/const reference" vs a generic "unsupported condition"), or omitted entirely
    - _Requirements: 6.1 (warn-and-skip), 6.2 (warn-and-skip), 6.5 (warn-and-skip)_

- [x] 4. Integrate helpers into `extractCondition` (parser.js — signature change)
  - [x] 4.1 Change `extractCondition` to `(testNode, trackedParams, constBindings, filePath)` and integrate LHS/RHS/new-construct logic
    - Replace the internal `getParamName` usage with `extractParamPath` for the LHS; a resolved path yields `{ path, op, value? }`; keep `ctx.key` handling unchanged (Req 3.8, 7.5)
    - RHS resolution order for the equality branch (`===`/`==`/`!==`/`!=`): `extractBoolean` → `extractString` → `extractNumber` → `resolveRhsReference`; boolean → `truthy`/`falsy` (no value), string/number → `equals`/`notEquals` preserving type, enum/const → map by resolved literal's type
    - Preserve all existing supported forms: flat truthy (`if (flag)`), negation (`if (!flag)`), string/boolean equality, `params.X`, `ctx.key` (Req 7.1–7.6, 3.8)
    - Return contract (two-way): `Condition_Descriptor` on success; `null` for Warn_And_Skip (covers BOTH non-new-construct unsupported AND unresolvable New_Condition_Construct — unknown enum/const, missing key, computed/non-primitive resolved value). There is no `{ __compileError }` sentinel
    - On an unresolvable new construct, return `null`; the caller emits a warning identifying the offending enum/const/path via `filePath` + line. `filePath` stays in the signature and feeds the WARNING message (file path, 1-based line via `lineOf(node)`, offending reference text)
    - _Requirements: 1.6, 1.7, 1.8, 2.6, 2.7, 2.8, 3.8, 5.1, 5.3, 5.4, 6.1, 6.2, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 4.2 Write and run property tests for literal typing and warn-and-skip scoping in parser.test.js
    - **Property 5: Literal RHS typing is preserved** — tag `Property 5` (Validates Req 5.1, 5.3, 5.4, 7.3, 7.4)
    - **Property 7: Unresolvable or bad new-construct RHS warns and skips** — tag `Property 7`; assert `extractCondition` returns `null` (Warn_And_Skip) and records a warning for absent object, missing key, or non-primitive value; never throws, never emits a descriptor (Validates Req 1.6–1.8, 2.6–2.8, 6.1, 6.2)
    - **Property 4: Invalid path shapes warn-and-skip** — tag `Property 4`; assert `extractParamPath` returns `null` and `extractCondition` returns `null` for computed segments and non-param roots (Validates Req 3.6, 3.7)
    - _Requirements: 5.1, 5.3, 5.4, 7.3, 7.4, 1.6, 1.7, 1.8, 2.6, 2.7, 2.8, 6.1, 6.2, 3.6, 3.7_

- [ ] 5. Checkpoint - Ensure all parser helper and extractCondition tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Wire Warn_And_Skip handling into `extractIfStep` and `extractWhenStep` (parser.js)
  - [ ] 6.1 Pass `constBindings` and `filePath` into `extractCondition` and branch on the return value
    - In both `extractIfStep` and `extractWhenStep` (two-way branch): on a descriptor, proceed as today; on `null`, push the existing `Unsupported if-condition …` / `Unsupported When() condition …` warning and return null (Warn_And_Skip) — this covers unsupported non-new-construct conditions AND unresolvable New_Condition_Constructs alike, so no step is produced and the file still emits its spec
    - Keep `When()` and `if` handling behaviorally identical through the shared `extractCondition`
    - _Requirements: 6.1 (warn-and-skip), 6.2 (warn-and-skip), 6.3 (warn-and-skip), 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 7. Ensure unresolvable-condition warnings surface via the existing warnings array (parser.js)
  - [ ] 7.1 Confirm unresolvable New_Condition_Construct conditions warn through the existing warnings array
    - No `errors` array is added; no clearing of `tests`/`tasks`/`automations`; no file-level failure. `parseSource` continues to emit the spec
    - The warning message for an unresolvable new construct includes the source file path, the 1-based line number (`lineOf(node)`), and the offending reference text (Req 6.1)
    - This is mostly ensuring `extractCondition`/`extractIfStep`/`extractWhenStep` push the right warning onto the existing `warnings` array; if the existing warning message is already sufficient, this is a light verification step
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 7.2 Write and run property tests for warn-and-skip spec emission in parser.test.js
    - **Property 13: Unresolvable new construct warns and still emits the spec** — tag `Property 13`; assert the compiled artifacts (`tests`/`tasks`/`automations`) are NOT cleared and a warning is recorded; there is no errors array and no file failure (Validates Req 6.1, 6.2, 6.5, 8.4)
    - **Property 14: Non-new-construct unsupported condition still emits the spec** — tag `Property 14`; assert emitted artifacts and a recorded warning; ALL unresolvable conditions emit the spec (Validates Req 6.3, 6.4, 6.5, 8.5)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 8.4, 8.5_

- [ ] 8. Implement runtime path-walk in `evaluateCondition` (background.js) — SYNC POINT with parser emit
  - [ ] 8.1 Add nested `path` walking to `evaluateCondition(condition, params, contextStore)` in `packages/extension/src/background.js`
    - When `condition.path` is present and non-empty, walk segments left-to-right from `params`; on a `null`/`undefined` intermediate, stop with `val = undefined` and never throw
    - When `path` is absent, keep the legacy flat lookup `params ? params[condition.param] : undefined`
    - Keep `ctx` handling unchanged (`contextStore` presence-checked); operator switch unchanged with strict `===`/`!==` (no coercion) and `default: return false`
    - Guard all `params` states (present/valid, absent, null, empty) so evaluation never throws
    - **This is the coordinated change:** it MUST land together with the parser emitting `path` (task 9) and is guarded by the Property 12 round-trip (task 10.2)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.8, 5.5, 5.6, 7.6_

  - [ ]* 8.2 Write and run property tests for `evaluateCondition` in background.property.test.js
    - **Property 8: Runtime path-walk equals manual property access** — tag `Property 8` (Validates Req 4.1)
    - **Property 10: Operator semantics match native operators (strict, no coercion)** — tag `Property 10`; include `"200"` vs `200` non-equality (Validates Req 4.4, 4.5, 5.5, 5.6, 7.6)
    - **Property 11: No-throw and safe-undefined across arbitrary params** — tag `Property 11`; generate params states `object`/partial/`{}`/`null`/`undefined` (Validates Req 4.3, 4.7, 4.8)
    - Mirror the existing `background.property.test.js` fast-check style (`evaluateCondition` is exported)
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.7, 4.8, 5.5, 5.6, 7.6_

- [ ] 9. Emit `path` for all param-based conditions (parser.js) — SYNC POINT with runtime consume
  - [ ] 9.1 Update the descriptor emit shape so every param-based condition carries `path: string[]`
    - Flat param emits `path: ['name']`; nested emits the full segment list; stop emitting the `param` field for newly compiled specs
    - Confirm the runtime reads `path` when present and falls back to `param` for previously compiled specs (coordinate with task 8.1)
    - This is the parser half of the emit/consume sync — keep it in the same change set as task 8
    - _Requirements: 4.6_

  - [ ]* 9.2 Write and run property test for flat-descriptor backward compatibility in background.property.test.js
    - **Property 9: Flat descriptor backward-compat equivalence** — tag `Property 9`; assert `{ param: key, op }` and `{ path: [key], op }` produce identical operator results (Validates Req 4.2, 4.6, 7.1, 7.2, 7.6)
    - _Requirements: 4.2, 4.6, 7.1, 7.2, 7.6_

- [ ] 10. Cross-component round-trip and When/if parity
  - [ ]* 10.1 Write and run the `When()` vs `if` parity property test in parser.test.js
    - **Property 15: `When()` and `if` produce identical descriptors** — tag `Property 15`; assert the result (descriptor or `null`) from `extractCondition` is identical whether sourced from an `if` statement or a `When(cond, cb)` call (Validates Req 8.1, 8.2, 8.3, 8.4)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 10.2 Write and run the compiler→runtime shared-shape round-trip property test
    - **Property 12: Compiler → runtime shared-shape round-trip** — tag `Property 12`; compile a generated `<path> === <value>` (nested path, string/number value), take the emitted descriptor, and evaluate with `evaluateCondition` — `true` for matching params, `false` for differing params. This is the primary guard for the emit/consume sync (Validates Req 4.6, 3.1, 5.1)
    - _Requirements: 4.6, 3.1, 5.1_

  - [ ]* 10.3 Write and run the motivating-example compiler round-trip unit test in parser.test.js
    - Assert `if (encounter.type === EncounterTypes.OFFICE_NOTE)` compiles to `{ path: ['encounter','type'], op: 'equals', value: 'office_note' }`
    - Add one import-based example: enum/const declared in an imported file resolves via merged `constBindings` (Req 1.5, 2.5)
    - Add one warn-and-skip warning example for an unresolvable new construct, asserting the warning message contains file path, 1-based line, and offending reference text (Req 6.1)
    - Add one `When()` warn-and-skip example for a non-new-construct unsupported condition (Req 8.5)
    - _Requirements: 3.1, 1.1, 4.6, 1.5, 2.5, 6.1, 8.5_

- [ ] 11. Checkpoint - Ensure all compiler and runtime tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Verify consumer pass-through of the `condition` object
  - [ ] 12.1 Verify `flattener.js` and `emitter.js` forward the `condition` object (including the new `path` field) unchanged
    - Confirm both recurse into `step.then` and read only `step.action`/`step.source`, forwarding `step.condition` opaquely; make no functional edits unless a gap is found
    - _Requirements: 4.6, 7.6_

  - [ ] 12.2 Verify `expandStep`/`emitLog`/plan-builder in background.js forward the `condition` object unchanged
    - Confirm the whole `condition` object (with `path`) passes through the flatten/emit/log layers; param-based descriptors evaluate eagerly via `evaluateCondition`, `ctx` descriptors defer as `ctxIf`
    - _Requirements: 4.6, 7.6_

  - [ ]* 12.3 Add or adjust a pass-through test if a gap is found
    - Only if 12.1/12.2 surface a missing forward of the `path` field, add a targeted test in `parser.test.js` or the relevant `background.*.test.js`; otherwise no test change
    - _Requirements: 4.6_

- [ ] 13. Preservation tests for existing condition forms and backward compatibility
  - [ ]* 13.1 Write and run preservation tests for existing condition forms in parser.test.js
    - Assert flat truthy `if (flag)`, negation `if (!flag)`, string equality, boolean equality, and `ctx.key` truthy/negation still compile unchanged (Req 7.1–7.5, 3.8)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 3.8_

  - [ ]* 13.2 Write and run legacy flat-descriptor evaluation tests in background.preservation.test.js
    - Assert legacy `{ param, op }` descriptors still evaluate identically at runtime (backward compat, reuses Property 9 coverage)
    - _Requirements: 4.2, 7.6_

- [ ] 14. Final wiring / end-to-end verification
  - [ ] 14.1 Confirm the full pipeline works end-to-end with no orphaned code
    - Write and run a compiler-emit → spec JSON → runtime-evaluate check covering: a nested-path condition, an enum/const RHS condition, and a numeric condition — asserting each emitted descriptor evaluates to the correct boolean in `evaluateCondition`
    - Confirm every new helper (`extractParamPath`, `resolveRhsReference`, `usesNewConditionConstruct`) is reached through `extractCondition`/`extractIfStep`/`extractWhenStep`, and that the parser emit and runtime consume of `path` are in sync
    - _Requirements: 4.6, 3.1, 1.1, 5.1, 6.5, 8.1_

- [ ] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test/verification sub-tasks and can be skipped for a faster MVP; core implementation sub-tasks are never optional.
- Each task references specific requirement clauses (not just user stories) for traceability.
- Checkpoints ensure incremental validation at sensible breaks.
- Property tests validate the universal correctness properties from the design and use the tag convention `// Feature: condition-enum-and-nested-params, Property N`; unit/example tests cover the motivating example, imports, warn-and-skip warning messaging, and preserved forms.
- **Key sync point:** the descriptor-shape change is coordinated across the parser emit (task 9) and the runtime consume (task 8). They must land together and are guarded by the Property 12 round-trip (task 10.2). This is the highest-risk area for regressions.
- Per workspace convention, all test steps are "write and run" — the user runs the test suite manually.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "6.1"] },
    { "id": 4, "tasks": ["7.1", "8.1"] },
    { "id": 5, "tasks": ["7.2", "8.2", "9.1"] },
    { "id": 6, "tasks": ["9.2", "10.1", "10.2", "10.3", "12.1", "12.2"] },
    { "id": 7, "tasks": ["12.3", "13.1", "13.2", "14.1"] }
  ]
}
```
