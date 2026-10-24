# Inline Data Enum Member Value Bugfix Design

## Overview

A Data template property can legitimately take its value from a member of another
`Data({...})` template whose leaf members are primitive literals — using that template
as an enum-like value source (e.g. `taskType: TaskTypes.Type1`). Today the compiler
silently **drops** that property key and the validator later emits
`Unknown data property "<key>"`, so the compile exits 0 but the output is wrong (the
field is missing).

The root cause is isolated to one function: `buildConstBindings` in
`packages/compiler/src/parser.js`. It registers const-member bindings only for plain
object literals (`const X = { ... }`) and transpiled TS enums; it skips
`const X = Data({ ... })` because that declaration's init is a `CallExpression`, not an
`ObjectExpression`. Because `constBindings['X']` is never populated, both the two-level
resolver (Case 6, `resolveConstMemberExpression`) and the three-level resolver (Case 5)
return null, and the key is dropped. The identical gap defeats the cross-file import
path, which calls `buildConstBindings` on the imported module and copies nothing.

The fix is surgical and additive: in `buildConstBindings`, when a `const X = ...` init is
a `Data({...})` (or `Data({...}).as(...)`) call, unwrap it with the existing
`unwrapDataCall` helper to reach the `ObjectExpression` argument, then extract that
object's **primitive-literal leaf members** into `bindings[X]` using the exact same
extraction logic already applied to plain object literals. No other function changes:
Case 5, Case 6, `resolveConstMemberExpression`, and both import-resolution paths read
from `constBindings` and start resolving automatically once the binding exists.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — a Data template property
  whose value is a member expression (`T.M` or `Ns.T.M`) where the base `T` resolves to a
  `Data({...})` template with a primitive-literal leaf member, and the member fails to
  resolve (key dropped, `Unknown data property` warning).
- **Property (P)**: The desired behavior — the property resolves to the referenced
  member's primitive literal value, the key is present, and no `Unknown data property`
  warning is emitted.
- **Preservation**: All other resolution paths (TS enums, plain const objects, `Fake.*`,
  nested objects, date-helpers, `{{data.*}}` step tokens) must behave exactly as before.
- **F / F'**: The original (unfixed) / fixed parser const-binding resolution.
- **`buildConstBindings(ast)`**: The function in `packages/compiler/src/parser.js` (~line
  205) that walks `const` declarations and produces the `constBindings` map
  `{ varName: { memberKey: literalValue } }`. It currently skips `Data()` declarations via
  the guard `if (initNode.type !== 'ObjectExpression') continue;`.
- **`unwrapDataCall(initNode)`**: Existing helper (~line 744) that returns
  `{ dataCall, asArg }` for both `Data({...})` and `Data({...}).as(name)` shapes, or null
  if the init is not a Data call. `dataCall.arguments[0]` is the template's
  `ObjectExpression`.
- **`resolveConstMemberExpression(node, constBindings, filePath, warnings)`**: Resolver
  (~line 484) for two-level `T.M`; reads `constBindings[objName][propName]`.
- **Case 5 / Case 6**: The three-level (`Ns.T.M`, ~line 632) and two-level (`T.M`, ~line
  699) member-expression branches inside `parseDataTemplate`. Both consume `constBindings`.
- **`constBindings` vs `dataVars`**: Two independent maps. `constBindings` drives
  member-VALUE resolution inside `parseDataTemplate`. `dataVars` (consumed by
  `extractDataMemberPath`) drives `{{data.*}}` step-token resolution. They are populated
  and read by different code paths.

## Bug Details

### Bug Condition

The bug manifests when a Data template property value is a member expression whose base
identifier resolves to a `Data({...})` template with primitive-literal leaf members. The
`buildConstBindings` function never registers the `Data()` template as a const binding
(because its init is a `CallExpression`, not an `ObjectExpression`), so both the two-level
(Case 6) and three-level (Case 5) member resolvers find no entry in `constBindings` and
return null, dropping the property key.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type DataTemplateProperty
  OUTPUT: boolean

  // input.value is a member expression of the form T.M (two-level) or
  // Ns.T.M (three-level) where the base identifier T resolves to a
  // Data({...}) template (imported or locally declared) whose referenced
  // leaf member M is a primitive literal (string | number | boolean).
  RETURN isMemberExpression(input.value)
         AND baseIdentifier(input.value) resolves to a Data({...}) template
         AND referencedLeaf(input.value) is a primitive literal (string | number | boolean)
         AND NOT memberResolved(input.value)   // key dropped + "Unknown data property"
END FUNCTION
```

### Examples

- **Imported two-level (reproduction)**: `taskType: TaskTypes.Type1` where
  `import TaskTypes from '~/data/task-types.data'` resolves to
  `Data({ Type1: 'Type1', Type2: 'Type2' })`. Expected: `taskType: "Type1"`. Actual: key
  dropped, `Unknown data property "taskType"` warning.
- **Local two-level**: `const T = Data({ A: 'a', B: 'b' })` then `x: T.A` in another
  local Data template. Expected: `x: "a"`. Actual: key dropped (same gap, same file).
- **Three-level namespaced**: `taskType: NewTaskPage.TaskTypes.Type1` where
  `NewTaskPage.TaskTypes` resolves (via `resolveDefaultExportNamespace`) to a `Data({...})`
  template. Expected: `taskType: "Type1"` (string-coerced per Case 5). Actual: key dropped,
  `Unknown namespaced enum reference` warning.
- **Edge case (primitive-type preservation, two-level)**: `const N = Data({ Zero: 0 })`
  then `count: N.Zero`. Expected: `count: 0` (number, not `"0"`) — Case 6 preserves the
  primitive type.
- **Edge case (non-primitive leaf, must stay unresolved)**: a `Data({...})` leaf that is a
  `Fake.*`, nested object, or date-helper value is NOT a const-member value and must not
  become resolvable as `T.M` — such a reference remains unresolved as it does today.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- TypeScript enum member references continue to resolve to the enum member's value (3.1).
- Plain const-object-literal member references (`const X = { ... }` → `X.K`) continue to
  resolve to that member's value (3.2).
- `Fake.*` expressions continue to resolve exactly as today (3.3).
- Nested-object property values continue to resolve exactly as today (3.4).
- Date-helper expressions (e.g. `nextWeek('MM/DD/YYYY')`) continue to resolve exactly as
  today (3.5).
- `{{data.*}}` step tokens continue to resolve via the separate `dataVars` mechanism,
  unaffected by the const-binding change (3.6).

**Scope:**
All inputs that do NOT satisfy the bug condition must be completely unaffected by this fix.
This includes:
- TS enum members and plain const-object members (already in `constBindings` today).
- `Fake.*`, nested objects, and date-helper values — these are value SHAPES handled by
  Cases 1/3/4 in `parseDataTemplate` before Case 5/6, and are not primitive literals, so
  they are never registered as const members even when they appear as leaves of a Data
  template that is used as a value source.
- `{{data.*}}` step tokens — resolved through `dataVars` / `extractDataMemberPath`, a
  different map and code path than `constBindings`.

**Note:** The expected CORRECT resolution behavior for buggy inputs is defined in the
Correctness Properties section (Property 1). This section focuses on what must NOT change.

## Hypothesized Root Cause

This root cause is confirmed by inspection of `packages/compiler/src/parser.js`.

1. **`buildConstBindings` excludes `Data()` declarations (the single defect)**: the loop
   over `const` declarators short-circuits with `if (initNode.type !== 'ObjectExpression')
   continue;`. A `const X = Data({ ... })` has `initNode.type === 'CallExpression'`
   (callee `Data`), so it is skipped and `bindings['X']` is never set. This is the one and
   only gap.

2. **Case 6 (two-level `T.M`) depends on that binding**: `resolveConstMemberExpression`
   begins with `if (!(objName in constBindings)) return null;`. With `TaskTypes` absent it
   returns null WITHOUT a warning, and Case 6 drops the property.

3. **Case 5 (three-level `Ns.T.M`) depends on the nested binding**: it reads
   `constBindings[nsName][enumName][memberKey]`. With the Data template absent from the
   namespace it never matches, emits `Unknown namespaced enum reference`, and drops the key.

4. **Cross-file import path copies nothing**: import resolution parses the imported module
   and calls `buildConstBindings(subAst)`, then looks up `imp.localName` in the result;
   `resolveDefaultExportNamespace` likewise calls `buildConstBindings` on the module. Both
   find nothing for the `Data()` declaration, so the imported binding is never propagated.

Because every downstream failure flows from gap (1), fixing `buildConstBindings` fixes all
of them with no changes to Cases 5/6 or the import paths.

## Correctness Properties

Property 1: Bug Condition - Data-template member resolves to its literal value

_For any_ Data template property whose value is a member expression (`T.M` two-level or
`Ns.T.M` three-level) where the base `T` resolves to a `Data({...})` template (imported or
locally declared) with a primitive-literal leaf member (isBugCondition returns true), the
fixed parser SHALL resolve the property to the referenced member's literal value, keep the
property key present in the compiled template, and emit NO `Unknown data property` warning
for that key. Two-level references preserve the member's primitive type (Case 6
behavior); three-level references follow the existing Case 5 behavior (string-coerced).

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Non-buggy resolution paths unchanged

_For any_ input where the bug condition does NOT hold (isBugCondition returns false) — TS
enum members, plain const-object members, `Fake.*` expressions, nested objects,
date-helper expressions, and `{{data.*}}` step tokens — the fixed parser SHALL produce
exactly the same result as the original parser, preserving all existing resolution and
tokenization behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct, the entire fix is confined to one function.

**File**: `packages/compiler/src/parser.js`

**Function**: `buildConstBindings` (~line 205)

**Specific Changes**:

1. **Unwrap `Data()` inits before the ObjectExpression guard**: for each const
   declarator whose `initNode` is not an `ObjectExpression`, attempt
   `unwrapDataCall(initNode)`. If it returns a non-null `{ dataCall, asArg }`, use
   `dataCall.arguments[0]` as the candidate `ObjectExpression` to extract members from.
   This reuses the existing helper rather than re-detecting the `Data` callee by hand, and
   covers both `Data({...})` and `Data({...}).as(name)` shapes.

2. **Extract only primitive-literal leaf members, reusing existing logic**: run the SAME
   per-property extraction already used for plain object literals — key via `Identifier`
   name or `Literal` value, value via `extractString(prop.value) ?? extractNumber(...) ??
   extractBoolean(...)`. Set `bindings[varName][key] = val` only for primitive leaves and
   only register `bindings[varName]` when `hasLiterals` is true. Nested objects, `Fake.*`
   calls, and date-helper call expressions are NOT primitive literals, so they are
   naturally skipped and never become resolvable const members.

3. **Preserve `__scalars` handling unchanged**: the scalar-const branch
   (`const API = '...'`) runs before the guard and is not touched. A `Data()` init is not
   a scalar, so `extractString/extractNumber` of the `CallExpression` yields null and
   `__scalars` is unaffected.

4. **Preserve the TS-enum merge unchanged**: the post-walk `buildEnumBindings` merge keeps
   its existing "do not overwrite an existing key" semantics. Data-template bindings are
   added under the template's variable name during the walk; the enum merge only fills keys
   not already present, so the two never collide destructively.

5. **No changes anywhere else**: `resolveConstMemberExpression`, Case 5, Case 6, the
   cross-file import lookup, and `resolveDefaultExportNamespace` are left untouched. Once
   `buildConstBindings` registers the Data template's primitive members, every one of these
   consumers resolves the reference automatically.

### Why Case 5, Case 6, and the import path need no changes

- **Case 6 (two-level)** calls `resolveConstMemberExpression(value, constBindings, ...)`,
  which returns `constBindings[objName][propName]`. Once `constBindings['TaskTypes']`
  exists, the lookup succeeds and the value is stored with its ORIGINAL primitive type
  (not string-coerced), satisfying 2.1/2.2 type preservation.
- **Case 5 (three-level)** reads `constBindings[nsName][enumName][memberKey]`.
  `resolveDefaultExportNamespace` already builds that nested namespace by calling
  `buildConstBindings` on the imported module; once the Data template is registered there,
  the lookup matches and the existing Case 5 string-coercion applies, satisfying 2.3.
- **Cross-file import** parses the imported module and calls `buildConstBindings(subAst)`,
  then copies `importedBindings[localName]` into `constBindings`. With the Data template
  now registered, the copy carries its members across, satisfying 2.4 for the imported
  case — with no change to the import code itself.

### Preservation reasoning (why the fix is safe and non-regressive)

- The change is purely ADDITIVE to `constBindings`: it registers entries for `Data()`
  templates that were previously absent. Existing object-literal consts and TS-enum
  bindings are produced by the same unchanged code paths and are not modified (3.1, 3.2).
- `Fake.*`, nested objects, and date-helper values (3.3, 3.4, 3.5) are value SHAPES inside
  a Data template, handled by Cases 1/3/4 in `parseDataTemplate` before Case 5/6. They are
  not primitive literals, so even when they appear as leaves of a Data template used as a
  value source they are skipped by the primitive-only extraction and never become
  resolvable const members.
- The `{{data.*}}` step-token path (3.6) uses the separate `dataVars` map consumed by
  `extractDataMemberPath`, not `constBindings`, so it is untouched.
- **Dual-role edge case**: a Data template whose SAME variable is used BOTH as a
  value source (`T.M` inside another template) AND as a `{{data.*}}` step token. Adding it
  to `constBindings` does not disturb its `dataVars` role: the two maps are independent and
  consumed by different code paths (member-value resolution in `parseDataTemplate` reads
  `constBindings`; step tokenization reads `dataVars` via `extractDataMemberPath`). Both
  roles coexist after the fix.

### Affected files

- `packages/compiler/src/parser.js` — the only production change, inside
  `buildConstBindings`.
- `packages/compiler/src/parser.test.js` — authored unit + property-based tests (run
  manually by the user).
- Fixtures (reproduction, no change needed):
  `examples/playground-tests/data/task-types.data.ts`,
  `examples/playground-tests/tests/new-task.test.ts`.

## Testing Strategy

### Validation Approach

Two phases: first surface counterexamples that demonstrate the bug on the UNFIXED code,
then verify the fix resolves the member value and preserves all other behavior. Per
workspace rules, the only agent-run verification is a single-shot
`npm run compile:playground`; property-based and unit tests are AUTHORED here but run
MANUALLY by the user. No `npm test`, no `node --test`, no `node -c`, no watch/dev
processes.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix and
confirm the root-cause hypothesis (that `buildConstBindings` ignores `Data()`). If the
counterexample does not appear as predicted, re-hypothesize.

**Test Plan**: Use the existing fixture (`data/task-types.data.ts` +
`tests/new-task.test.ts`), which already reproduces the bug, and run the single-shot
compile on the UNFIXED code to observe the dropped key and warning.

**Test Cases**:
1. **Imported two-level**: `taskType: TaskTypes.Type1` from an imported `Data({...})`
   (will drop the key + warn on unfixed code).
2. **Local two-level**: `const T = Data({ A: 'a' })` then `x: T.A` in the same file (will
   drop the key on unfixed code).
3. **Three-level namespaced**: `Ns.TaskTypes.Type1` resolving to a `Data({...})` template
   (will drop the key + `Unknown namespaced enum reference` on unfixed code).
4. **Primitive-type edge**: `const N = Data({ Zero: 0 })` then `count: N.Zero` (dropped on
   unfixed code; after fix must be number `0`, not `"0"`).

**Expected Counterexamples**:
- The property key is absent from the compiled template and `Unknown data property`
  (two-level) / `Unknown namespaced enum reference` (three-level) is emitted.
- Cause: `constBindings[base]` is never populated because `buildConstBindings` skips the
  `Data()` `CallExpression` init.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function
produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := parseDataTemplate_fixed(input)
  ASSERT result[input.key] = literalValueOf(referencedLeaf(input.value))
     AND propertyKeyPresent(result, input.key)
     AND NO "Unknown data property" warning emitted for input.key
END FOR
```

Agent-run gate: after the fix, `npm run compile:playground` must emit
`taskType: "Type1"` (the referenced member's literal) for `newTaskDefault` with NO
`Unknown data property` warning.

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed
function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT parseDataTemplate_original(input) = parseDataTemplate_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation because it
generates many inputs across the domain, catches edge cases manual tests miss, and gives
strong guarantees that non-buggy behavior is unchanged.

**Test Plan**: Observe current behavior on the UNFIXED code for TS enums, const objects,
`Fake.*`, nested objects, date-helpers, and `{{data.*}}` tokens, then write tests that
assert this behavior is unchanged after the fix.

**Test Cases**:
1. **TS enum preservation**: enum member reference still resolves to its value (3.1).
2. **Const-object preservation**: `const X = { ... }` member still resolves (3.2).
3. **`Fake.*` preservation**: `Fake.*` value shape unchanged (3.3).
4. **Nested-object preservation**: nested object value unchanged (3.4).
5. **Date-helper preservation**: `nextWeek('MM/DD/YYYY')` unchanged (3.5).
6. **`{{data.*}}` token preservation**: step tokens via `dataVars` unchanged (3.6).
7. **Dual-role preservation**: a Data template used both as `T.M` value source and as a
   `{{data.*}}` token resolves correctly in both roles.

### Unit Tests

- `buildConstBindings` registers primitive leaf members of `const X = Data({...})` and
  `Data({...}).as(name)`.
- `buildConstBindings` does NOT register non-primitive leaves (`Fake.*`, nested object,
  date-helper) of a Data template.
- Case 6 two-level resolution preserves primitive type (number/boolean) for Data-template
  members.
- Case 5 three-level resolution returns the string-coerced value for Data-template members.
- `__scalars` and TS-enum merge behavior unchanged in presence of a `Data()` const.

### Property-Based Tests

(fast-check + `node:test`, ≥100 iterations, each tagged
`// Feature: inline-data-enum-member-value, Property <n>: <text>`)

- **Property 1 (fix)**: for randomly generated `Data({...})` templates with primitive leaf
  members referenced as `T.M` / `Ns.T.M` (imported and local), the member resolves to its
  literal, the key is present, and no `Unknown data property` warning is emitted.
- **Property 2 (preservation)**: for randomly generated TS enums, const objects, `Fake.*`,
  nested objects, date-helpers, and `{{data.*}}` tokens, fixed output equals original
  output.

### Integration Tests

- Compile the full playground fixture and assert `newTaskDefault.taskType === "Type1"`
  with no warnings (imported three-level/two-level default-import template).
- A local-`const` Data-template value source resolves end-to-end within one test file.
- A Data template used both as a value source and as a `{{data.*}}` token compiles
  correctly in both roles.
