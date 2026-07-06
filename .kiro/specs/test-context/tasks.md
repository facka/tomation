# Implementation Plan: Test Context — Per-Run Key-Value Store

## Overview

Implement the test context feature across four packages: DSL stubs, compiler parsing, background context store/resolution, and runtime DOM extraction. Each task builds incrementally, wiring components together as they're completed. Property-based tests validate the 11 correctness properties defined in the design.

## Tasks

- [x] 1. DSL Package — Save Action Stubs and Types
  - [x] 1.1 Add SaveText, SaveAttribute, SaveValue, and Save runtime stubs to `packages/dsl/index.js`
    - Implement `SaveText(element)` returning builder with `.as(keyName)` → `{ __step: true, action: 'saveText', target: element, contextKey: keyName }`
    - Implement `SaveAttribute(element, attributeName)` returning builder with `.as(keyName)` → `{ __step: true, action: 'saveAttribute', target: element, attributeName: attributeName, contextKey: keyName }`
    - Implement `SaveValue(element)` returning builder with `.as(keyName)` → `{ __step: true, action: 'saveValue', target: element, contextKey: keyName }`
    - Implement `Save(expression)` returning builder with `.as(keyName)` → `{ __step: true, action: 'saveExpression', value: expression, key: keyName }`
    - Add all four functions to `module.exports`
    - _Requirements: 1.3, 2.4, 3.3, 8.1_

  - [x] 1.2 Add TypeScript type declarations to `packages/dsl/index.d.ts`
    - Add `SaveBuilder` interface with `as(keyName: string): any`
    - Add `SaveText(element: any): SaveBuilder` export
    - Add `SaveAttribute(element: any, attributeName: string): SaveBuilder` export
    - Add `SaveValue(element: any): SaveBuilder` export
    - Add `Save(expression: any): SaveBuilder` export
    - _Requirements: 1.3, 2.4, 3.3, 8.1_

  - [ ]* 1.3 Write property test for DSL builder correctness (Property 1)
    - **Property 1: DSL Builder Produces Correct Step Objects**
    - For arbitrary element descriptors, attribute names, and key names, verify SaveText/SaveAttribute/SaveValue produce correct step shapes
    - Use fast-check with minimum 100 iterations
    - Add to `packages/dsl/index.test.js`
    - **Validates: Requirements 1.3, 2.4, 3.3**

  - [ ]* 1.4 Write property test for Save() builder correctness (Property 9)
    - **Property 9: DSL Save() Builder Produces Correct Step Objects**
    - For arbitrary expression values (strings, objects) and key names, verify Save(expr).as(key) produces correct step shape with action 'saveExpression', value field, and key field
    - Use fast-check with minimum 100 iterations
    - Add to `packages/dsl/index.test.js`
    - **Validates: Requirements 8.1, 8.6**

- [x] 2. Compiler — Save Action Parsing
  - [ ] 2.1 Add `extractSaveAction` detection to `packages/compiler/src/parser.js`
    - Detect `SaveText(element).as(key)` AST pattern and emit `{ action: 'saveText', target: resolvedRef, contextKey: key }`
    - Detect `SaveAttribute(element, attr).as(key)` AST pattern and emit `{ action: 'saveAttribute', target: resolvedRef, attributeName: attr, contextKey: key }`
    - Detect `SaveValue(element).as(key)` AST pattern and emit `{ action: 'saveValue', target: resolvedRef, contextKey: key }`
    - Detect `Save(expression).as(key)` AST pattern and emit `{ action: 'saveExpression', value: descriptor, key: key }`
    - For `Save()`, delegate expression argument to `extractValueExpression()` to handle string literals, date helper calls, and template literals
    - Integrate detection into the existing `extractStep` function
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 2.2 Add compiler error reporting for missing `.as(key)` chain
    - When `SaveText`, `SaveAttribute`, `SaveValue`, or `Save` is detected without `.as(key)`, emit a parse warning: "context key name is required"
    - When `.as('')` is called with an empty string, emit a warning: "context key name must be non-empty"
    - When `Save()` is called with no argument, emit a warning: "Save() requires an expression argument"
    - When `Save()` is called with an unsupported expression type, emit a warning with file path and line
    - _Requirements: 6.5, 8.5_

  - [ ]* 2.3 Write property test for compiler Save action emission (Property 2)
    - **Property 2: Compiler Emits Correct Save Action Steps**
    - For arbitrary valid element variable names, attribute names, and key strings, verify parsing `SaveText(el).as(key)`, `SaveAttribute(el, attr).as(key)`, `SaveValue(el).as(key)` emits correct step objects
    - Use fast-check with minimum 100 iterations
    - Add to `packages/compiler/src/parser.test.js`
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [ ]* 2.4 Write property test for compiler saveExpression emission (Property 10)
    - **Property 10: Compiler Emits Correct saveExpression Steps**
    - For valid expressions (string literals, date helper calls, template literals) and key strings, verify parsing `Save(expr).as(key)` emits correct step with action 'saveExpression', correct value descriptor, and key field
    - Use fast-check with minimum 100 iterations
    - Add to `packages/compiler/src/parser.test.js`
    - **Validates: Requirements 8.2, 8.3, 8.6**

- [ ] 3. Checkpoint - Verify DSL and Compiler
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Background — Context Store Lifecycle and Template Resolution
  - [x] 4.1 Add `contextStore` field to `runState` and manage lifecycle in `packages/extension/src/background.js`
    - Add `contextStore: {}` to `runState` initial declaration
    - Reset `contextStore` to `{}` in `resetRunState()`
    - Initialize `contextStore` to `{}` at the start of `startRun` (where `runState.running = true`)
    - Discard (reset to `{}`) in `finishRun`
    - _Requirements: 5.1, 5.3, 5.4_

  - [x] 4.2 Extend `resolveValue` to handle `{{ctx.keyName}}` token resolution in `packages/extension/src/background.js`
    - Add `contextStore` parameter to `resolveValue(value, params, contextStore)`
    - Before resolving `{{paramName}}` tokens, resolve `{{ctx.keyName}}` tokens from the context store
    - If a referenced context key does not exist, return an error object `{ __ctxError: "Context key \"keyName\" has not been saved yet" }`
    - Update all existing call sites of `resolveValue` to pass `runState.contextStore` (or `{}` when no store is available)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 4.3 Add `saveExpression` step handling in the step loop in `packages/extension/src/background.js`
    - Before dispatching a step to the runtime, check if `step.action === 'saveExpression'`
    - Evaluate `step.value` using `resolveValue(step.value, params, runState.contextStore)` — handles plain strings, dateHelper descriptors, and runtimeTemplate descriptors
    - Store the resolved string in `runState.contextStore[step.key]`
    - Emit success log and advance to the next step (no message sent to runtime)
    - If `resolveValue` returns a `__ctxError` object, fail the step with that error message
    - _Requirements: 8.4_

  - [x] 4.4 Add context store write logic for DOM save action responses in `packages/extension/src/background.js`
    - After receiving a successful `STEP_RESULT` for `saveText`, `saveAttribute`, or `saveValue` actions, extract `savedValue` from the response
    - Store `response.savedValue` in `runState.contextStore[step.contextKey]`
    - Overwrite existing keys without error (per Requirement 7.1)
    - _Requirements: 1.1, 2.1, 3.1, 7.1_

  - [ ]* 4.5 Write property tests for context template resolution (Properties 3, 4, 5)
    - **Property 3: Context Template Resolution Completeness**
    - **Property 4: Missing Context Key Produces Failure**
    - **Property 5: Mixed Context and Parameter Token Resolution**
    - Verify all `{{ctx.*}}` tokens are resolved when keys exist, missing keys produce errors, and mixed `{{ctx.*}}`/`{{param}}` tokens resolve independently
    - Use fast-check with minimum 100 iterations per property
    - Add to `packages/extension/src/background.test.js`
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

  - [ ]* 4.6 Write property tests for context lifecycle and overwrite (Properties 6, 7)
    - **Property 6: Context Values Persist Across Task Boundaries**
    - **Property 7: Context Key Overwrite Stores Last Value**
    - Verify saved values persist within a run and overwriting stores the last value
    - Use fast-check with minimum 100 iterations per property
    - Add to `packages/extension/src/background.test.js`
    - **Validates: Requirements 5.2, 7.1**

  - [ ]* 4.7 Write property test for saveExpression evaluation (Property 11)
    - **Property 11: Runtime saveExpression Evaluates and Stores Correct Value**
    - For valid value descriptors (plain strings, dateHelper descriptors, runtimeTemplate descriptors) and key names, verify that evaluating the descriptor via resolveValue and storing the result allows subsequent `{{ctx.key}}` resolution to return the same value
    - Use fast-check with minimum 100 iterations
    - Add to `packages/extension/src/background.test.js`
    - **Validates: Requirements 8.4**

- [ ] 5. Checkpoint - Verify Background Logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Runtime — DOM Extraction for Save Actions
  - [x] 6.1 Add `saveText`, `saveAttribute`, and `saveValue` cases to `executeAction` in `packages/extension/src/runtime.js`
    - `saveText`: return `{ ok: true, savedValue: element.textContent.trim() }`
    - `saveAttribute`: get `element.getAttribute(step.attributeName)`; if null, return `{ ok: false, error: 'Attribute "..." not found on element' }`; otherwise return `{ ok: true, savedValue: attrVal }`
    - `saveValue`: return `{ ok: true, savedValue: element.value || '' }`
    - _Requirements: 1.1, 2.1, 2.3, 3.1_

  - [x] 6.2 Add save actions to the message listener's element-finding flow in `packages/extension/src/runtime.js`
    - Add `'saveText'`, `'saveAttribute'`, `'saveValue'` to the `ACTIONS_NEEDING_ELEMENT` array
    - Ensure the `STEP_RESULT` response includes `savedValue` from the `executeAction` result
    - Pass `step.attributeName` and `step.contextKey` through the message to `executeAction`
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2_

  - [ ]* 6.3 Write property test for DOM extraction correctness (Property 8)
    - **Property 8: Save Actions Store Correct DOM Values**
    - For arbitrary textContent strings, attribute values, and input values, verify that the corresponding save action returns the correct `savedValue`
    - Use fast-check with minimum 100 iterations
    - Mock DOM elements with controlled properties
    - Add to a test file in `packages/extension/` (e.g., `src/runtime.test.js`)
    - **Validates: Requirements 1.1, 2.1, 3.1**

- [x] 7. Integration Wiring and Final Verification
  - [x] 7.1 Wire `contextKey` and `attributeName` fields through `buildStepMessage` in `packages/extension/src/background.js`
    - In `buildStepMessage`, copy `step.contextKey` to `msg.contextKey` when present
    - Copy `step.attributeName` to `msg.attributeName` when present
    - Copy `step.key` to `msg.key` when present (for saveExpression, though it doesn't go to runtime)
    - _Requirements: 1.1, 2.1, 3.1_

  - [x] 7.2 Add `saveText`, `saveAttribute`, `saveValue` to the compiler validator's known actions in `packages/compiler/src/validator.js`
    - Add the three new action strings plus `saveExpression` to any action whitelist/validation logic
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 8. Final Checkpoint - Full Integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (11 properties across 4 packages)
- The `Save(expression)` implementation reuses `extractValueExpression()` and `resolveValue()` from the dsl-runtime-utilities feature — no new evaluation logic needed
- Context resolution (`{{ctx.*}}`) is distinct from param resolution (`{{param}}`) and is resolved first, with missing keys producing hard errors rather than empty string substitution

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["4.2", "6.1"] },
    { "id": 5, "tasks": ["4.3", "4.4", "6.2"] },
    { "id": 6, "tasks": ["4.5", "4.6", "4.7", "6.3"] },
    { "id": 7, "tasks": ["7.1", "7.2"] }
  ]
}
```
