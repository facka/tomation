# Bugfix Requirements Document

## Introduction

When authoring a Data template, a user can set a property's value to a member of
another `Data({...})` template that acts like an enum (its leaf members are
primitive literals). For example:

```ts
import TaskTypes from '~/data/task-types.data' // export default Data({ Type1: 'Type1', Type2: 'Type2' })

const newTaskDefault = Data({
  taskType: TaskTypes.Type1, // member of an imported Data() template used as an enum
  provider: 'Provider1',
  dueDate: nextWeek('MM/DD/YYYY'),
})
```

Instead of resolving `taskType` to the literal value `"Type1"`, the compiler
silently drops the `taskType` key and later emits a validation warning:
`Unknown data property "taskType" on template "newTaskDefault"`. The compile
still exits 0, so the output is wrong but passes unnoticed — the field is simply
missing from the compiled spec.

This affects both imported `Data({...})` templates and locally-declared
`const T = Data({...})` templates in the same file, because the underlying
const-binding resolver ignores `Data()` declarations regardless of where they
live. The impact is that users cannot use a `Data()` template as an enum-like
value source for another template, even though TypeScript enums and plain const
object literals work in the same position.

## Bug Analysis

### Current Behavior (Defect)

When a Data-template property value is a member expression referencing a
`Data({...})` template:

1.1 WHEN a Data template property value is a two-level member expression `T.M` where `T` is an imported `Data({...})` template with primitive-literal leaf members THEN the system drops the property key from the compiled template and emits an `Unknown data property "<key>"` warning
1.2 WHEN a Data template property value is a two-level member expression `T.M` where `T` is a locally-declared `const T = Data({...})` template in the same file with primitive-literal leaf members THEN the system drops the property key from the compiled template and emits an `Unknown data property "<key>"` warning
1.3 WHEN a Data template property value is a three-level member expression `Ns.T.M` where `T` resolves to a `Data({...})` template with primitive-literal leaf members THEN the system drops the property key from the compiled template and emits an `Unknown data property "<key>"` warning
1.4 WHEN the referenced member cannot be resolved because the `Data({...})` template was never registered as a const binding THEN the system silently returns null for the value with no diagnostic explaining the member expression failed to resolve

### Expected Behavior (Correct)

The member expression should resolve to the primitive value of the referenced
member, mirroring the existing enum behavior:

2.1 WHEN a Data template property value is a two-level member expression `T.M` where `T` is an imported `Data({...})` template with primitive-literal leaf members THEN the system SHALL resolve the property to the literal value of member `M`, preserving its primitive type consistent with existing two-level (Case 6) resolution
2.2 WHEN a Data template property value is a two-level member expression `T.M` where `T` is a locally-declared `const T = Data({...})` template in the same file with primitive-literal leaf members THEN the system SHALL resolve the property to the literal value of member `M`, preserving its primitive type consistent with existing two-level (Case 6) resolution
2.3 WHEN a Data template property value is a three-level member expression `Ns.T.M` where `T` resolves to a `Data({...})` template with primitive-literal leaf members THEN the system SHALL resolve the property to the value of member `M` consistent with the existing three-level (Case 5) resolution behavior
2.4 WHEN a `Data({...})` template is referenced as a value source for another template's member THEN the system SHALL register it as a resolvable const binding so the member lookup succeeds and no `Unknown data property` warning is emitted for that key

### Unchanged Behavior (Regression Prevention)

Existing resolution paths must continue to work exactly as they do today:

3.1 WHEN a Data template property value references a TypeScript enum member THEN the system SHALL CONTINUE TO resolve it to the enum member's value
3.2 WHEN a Data template property value references a member of a plain const object literal (`const X = { ... }`) THEN the system SHALL CONTINUE TO resolve it to that member's value
3.3 WHEN a Data template property value is a `Fake.*` expression THEN the system SHALL CONTINUE TO resolve it as it does today
3.4 WHEN a Data template property value is a nested object THEN the system SHALL CONTINUE TO resolve it as it does today
3.5 WHEN a Data template property value is a date-helper expression (e.g. `nextWeek('MM/DD/YYYY')`) THEN the system SHALL CONTINUE TO resolve it as it does today
3.6 WHEN a `Data({...})` template is referenced as a data token in test steps (e.g. `{{data.foo.bar}}`) THEN the system SHALL CONTINUE TO resolve it via the existing `dataVars` mechanism, unaffected by the const-binding change

## Bug Condition and Properties

### Key Definitions

- **F**: The original (unfixed) compiler parser/const-binding resolution.
- **F'**: The fixed parser/const-binding resolution.
- **C(X)**: Bug Condition — identifies inputs that trigger the bug.
- **P(result)**: Property — the desired behavior for buggy inputs.

### Bug Condition C(X)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type DataTemplateProperty
  OUTPUT: boolean

  // X.value is a member expression of the form T.M (two-level) or Ns.T.M (three-level)
  // where the base identifier T resolves to a Data({...}) template whose referenced
  // leaf member M is a primitive literal (string | number | boolean).
  // T may be imported (import T from '~/data/..') or locally declared (const T = Data({...})).
  RETURN isMemberExpression(X.value)
     AND baseIdentifier(X.value) resolves to a Data({...}) template
     AND referencedLeaf(X.value) is a primitive literal
END FUNCTION
```

### Property — Fix Checking

```pascal
// Property: Fix Checking — Data-template member resolves to its literal value
FOR ALL X WHERE isBugCondition(X) DO
  result ← F'(X)
  ASSERT result = literalValueOf(referencedLeaf(X.value))
     AND propertyKeyPresent(result)        // key is NOT dropped
     AND NO "Unknown data property" warning emitted for X.key
END FOR
```

Expected, mirroring existing enum behavior:
- Two-level `T.M` preserves the primitive type (Case 6 behavior).
- Three-level `Ns.T.M` follows the existing Case 5 behavior.

### Property — Preservation Checking

```pascal
// Property: Preservation Checking — non-buggy inputs behave identically before and after the fix
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

This guarantees TS enum members, plain const-object members, `Fake.*`, nested
objects, date-helper values, and `{{data.*}}` step tokens are unchanged.

## Reproduction

Fixtures in `examples/playground-tests`:

`data/task-types.data.ts`:
```ts
import { Data } from '@tomationjs/dsl'
const TaskTypes = Data({
  Type1: 'Type1',
  Type2: 'Type2',
})
export default TaskTypes
```

`tests/new-task.test.ts` (relevant part):
```ts
import TaskTypes from '~/data/task-types.data'

const newTaskDefault = Data({
  taskType: TaskTypes.Type1, // member of an imported Data() template
  provider: 'Provider1',
  dueDate: nextWeek('MM/DD/YYYY'),
})
```

Run (single-shot):
```
npm run compile:playground
```

Observed output:
```
[tomation] compiler v2.3.0
Unknown data property "taskType" on template "newTaskDefault" in test "Create a task using the default-import (three-level enum) template"
```
The compiled spec drops the `taskType` key. Exit code 0 but the output is wrong
(missing field + warning). Expected: `taskType` resolves to the literal value
`"Type1"`.

## Root Cause

Investigation of `packages/compiler/src/parser.js`:

- Two-level member expression value resolution (`Const.MEMBER`) is "Case 6" in
  `parseDataTemplate` (~line 699). It calls
  `resolveConstMemberExpression(value, constBindings, ...)`; if that returns
  null the property is silently dropped.
- `resolveConstMemberExpression` (~line 484) looks up `constBindings[objName]`.
  Here `objName = 'TaskTypes'`, which is NOT in `constBindings`, so it returns
  null (no warning) and the key is dropped.
- `constBindings` is built by `buildConstBindings` (~line 205). It registers
  ONLY (1) plain const object literals `const X = { ...literal props... }`
  (requires `initNode.type === 'ObjectExpression'`), and (2) transpiled TS enum
  IIFE patterns via `buildEnumBindings`.
- `buildConstBindings` does NOT register `const X = Data({ ... })` because its
  init is a `CallExpression` (callee `Data`), not an `ObjectExpression`; the
  guard `if (initNode.type !== 'ObjectExpression') continue;` skips it.
- Cross-file import resolution (~line 4216) reads the imported
  `task-types.data.ts`, calls `buildConstBindings` on it, and looks for
  `imp.localName` ('TaskTypes') in the result. Since `buildConstBindings`
  ignored the `Data()` declaration, 'TaskTypes' is absent, so
  `constBindings['TaskTypes']` is never populated.
- The validator (`validator.js` ~line 497) later emits the "Unknown data
  property" warning because the compiled template is missing the `taskType` key.

Net: a `Data({...})` template used as an enum-like value source (its primitive
leaf members referenced as `TemplateName.Member`) is not resolvable as a
Data-template VALUE, whether the template is imported OR declared locally in the
same file. The failure path is identical for a local
`const TaskTypes = Data({...})` because `buildConstBindings` ignores `Data()`
declarations regardless of file. The `{{data.*}}` step-token path uses a
separate `dataVars` mechanism and is unaffected.

## Verification Notes

- Agent-run verification is a SINGLE-SHOT `npm run compile:playground` only.
- Per workspace rules: no `npm test`, no `node --test`, no `node -c`, no
  watch/dev processes.
- Property/unit tests are authored but run manually by the user.
