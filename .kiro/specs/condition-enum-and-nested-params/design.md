# Design Document: Condition Enum Resolution & Nested Param Paths

## Overview

This feature extends the tomation DSL condition handling used inside `if (...)` blocks and
the functional equivalent `When(cond, () => { ... })`. It adds three capabilities to the
condition pipeline that spans the **Compiler** (`packages/compiler/src/parser.js`) and the
**Runtime_Condition_Evaluator** (`packages/extension/src/background.js`):

1. **RHS enum/const resolution** — comparing a param against an `EnumName.KEY` /
   `ConstName.KEY` (and `["KEY"]`) reference, resolved to its literal value at compile time
   via the already-built `constBindings` (Req 1, 2).
2. **LHS nested member-access paths** — referencing a nested property path on a param
   (`encounter.type`, `encounter.details.type`, `params.encounter.type`, `encounter['type']`),
   carried through the compiled `Condition_Descriptor` as an ordered `path` array and walked
   at runtime (Req 3, 4).
3. **Numeric comparison values** — numeric literals and numeric enum/const members, preserving
   numeric type through to strict-equality runtime evaluation (Req 5).

The motivating example that MUST compile after this feature:

```ts
const createNewEncounter = Task((params: { encounter: any }) => {
  const { encounter } = params
  if (encounter.type === EncounterTypes.OFFICE_NOTE) {
    Click(newOfficeNoteButton)
  }
}).as('Create New Encounter Task')
```

### Unresolvable constructs use warn-and-skip

There is no stricter failure mode. When a condition uses a **New_Condition_Construct** (an
enum/const RHS reference, or a nested member-access path on the LHS with depth > 1) and that
construct cannot be resolved at compile time, the Compiler applies the existing `Warn_And_Skip`
behavior: it emits a warning, drops the affected condition, and continues compiling
successfully, still emitting the spec (Req 6.1, 6.2). This is exactly how every other
unsupported condition is already handled (Req 6.3–6.5), so all unresolvable conditions —
new-construct or not — behave uniformly.

_Requirements coverage: this section maps to Requirements 1–8 collectively; individual sections
below cite the specific clauses they satisfy._

## Architecture

### Compile-time vs runtime split

The condition lives in two worlds joined by the serialized `Condition_Descriptor`:

- **Compile time (parser.js):** parses the AST condition node, resolves enum/const RHS
  references and nested LHS paths against `constBindings`/`trackedParams`, and emits a
  `Condition_Descriptor` into the spec JSON. All enum/const resolution and path extraction
  happen here — nothing is deferred except `ctx.*` conditions.
- **Flatten time (background.js `expandStep`):** param-based descriptors are evaluated
  eagerly via `evaluateCondition(condition, params)` to decide whether the `then` branch is
  emitted; `ctx` descriptors are deferred as `ctxIf` steps and evaluated during the run loop.
- **Runtime (background.js `evaluateCondition`):** resolves the value (flat key or nested
  `path`) against `params` (or `contextStore` for ctx) and applies the operator.

Because `expandStep`, `emitLog`, and the plan builder copy the whole `condition` object through
opaquely (they only read `.source`, `.op`, `.then`, and forward `.condition` wholesale), a new
`path` field passes through the flattener/emitter/log layers **without changes there** — the
only coordinated code changes are the parser (emit) and `evaluateCondition` (consume).

### Condition pipeline

```mermaid
flowchart TD
  A[AST: if(test) / When(cond, cb)] --> B[extractIfStep / extractWhenStep]
  B --> C[extractCondition testNode, trackedParams, constBindings, filePath]
  C --> D{LHS shape}
  D -->|ctx.key| E[ctx descriptor: source ctx, key, op]
  D -->|param / params.X / nested chain| F[extractParamPath -> path segments]
  F -->|not rooted at param/params, computed/numeric segment| W1[Warn_And_Skip: return null]
  C --> G{RHS shape}
  G -->|boolean literal / resolved boolean| H[op truthy or falsy]
  G -->|string literal / resolved string| I[op equals/notEquals, value string]
  G -->|number literal / resolved number| J[op equals/notEquals, value number]
  G -->|Enum/Const member ref| K[resolveConstMemberExpression]
  K -->|resolved literal string/number/bool| I & J & H
  K -->|unresolved / bad type + new construct| W2[Warn_And_Skip: warning + drop condition]
  F --> L[Condition_Descriptor path, op, value?]
  I --> L
  J --> L
  H --> L
  E --> L
  L --> M[spec JSON step: action if, condition, then]
  M --> N[background.js expandStep]
  N -->|param| O[evaluateCondition condition, params]
  N -->|ctx| P[ctxIf deferred -> evaluateCondition at run loop]
  O --> Q[walk path over params or flat params.param -> apply op]
  P --> Q
```

_Requirements coverage: Req 4.6 (shared shape), Req 7.5/3.8 (ctx deferral preserved), Req 8
(When parity through the same extractCondition)._

## Components and Interfaces

### 1. `extractCondition(testNode, trackedParams, constBindings, filePath)` (parser.js — CHANGED)

**Current:** `extractCondition(testNode, trackedParams)` — returns a descriptor or `null`.

**New signature:** add `constBindings` and `filePath` so RHS enum/const references resolve and
so `filePath` carries file+line+text into the **warning** message emitted on `Warn_And_Skip`.

**Return contract (new):** returns one of:
- a `Condition_Descriptor` object (success),
- `null` for `Warn_And_Skip` — this covers BOTH an unsupported non-new-construct condition and
  an unresolvable New_Condition_Construct. In either case the caller warns (as today) and drops
  the condition.

Because both cases now return `null` → `Warn_And_Skip`, there is no longer any need to
distinguish them for control flow. The only difference is the warning message: for an
unresolvable new construct the message should identify the offending enum/const/path (file,
1-based line, reference text). `filePath` is threaded in so `extractCondition` can build that
more specific warning text.

Behavior changes inside:
- **LHS:** replace the internal `getParamName` with `extractParamPath(node, trackedParams)`
  (below). A resolved path yields `{ path, op, value? }`. `ctx.key` handling is unchanged
  (Req 3.8, 7.5).
- **RHS resolution order** for the equality branch (`===`/`==`/`!==`/`!=`): try, in order,
  `extractBoolean` → `extractString` → `extractNumber` → `resolveRhsReference` (enum/const).
  1. boolean → maps to `truthy`/`falsy` (Req 5.4, 7.4),
  2. string → `equals`/`notEquals` with string value (Req 2.1/7.3, type preserved 5.3),
  3. number → `equals`/`notEquals` with numeric value (Req 5.1),
  4. enum/const member → resolve via `resolveConstMemberExpression`, then map by the resolved
     literal's type: boolean→truthy/falsy, string/number→equals/notEquals preserving type
     (Req 1.1–1.4, 2.1–2.4, 5.2).
- **Unresolvable new construct → warn-and-skip:** if the RHS is a `MemberExpression` that looks
  like an enum/const reference (`Identifier.Identifier` or `Identifier["key"]`) and it does NOT
  resolve to a string/number/boolean literal — unknown object, unknown key, computed/unsupported
  member, or non-primitive resolved value — return `null` (`Warn_And_Skip`) and let the caller
  emit a warning identifying the unresolvable reference (Req 1.6–1.8, 2.6–2.8, 6.1, 6.2). Note
  Req 1.6: resolution is limited to `constBindings` only — no global-scope or extra import
  lookup.

### 2. `extractParamPath(node, trackedParams)` (parser.js — NEW helper)

Replaces `getParamName`. Walks a `MemberExpression` chain (or bare identifier) and returns an
ordered array of string segments, or `null` (→ `Warn_And_Skip`).

```
extractParamPath(node, trackedParams) -> string[] | null
```

Rules:
- Bare tracked-param `Identifier` (e.g. `flag`) → `['flag']` (Req 3.4, 7.1/7.2 preserved).
- Chain rooted at a tracked param: `encounter.type` → `['encounter','type']`;
  `encounter.details.type` → `['encounter','details','type']` (Req 3.1, 3.2).
- Chain rooted at `params`: exclude the `params` root segment —
  `params.encounter.type` → `['encounter','type']`; `params.X` → `['X']` (Req 3.3, 3.4).
- String-literal computed access is equivalent to dot access:
  `encounter['type']` → `['encounter','type']`; `encounter.details['type']` →
  `['encounter','details','type']` (Req 3.5).
- **Reject (→ `null`, `Warn_And_Skip`):**
  - a computed segment whose key is not a string literal (`encounter[key]`, `encounter[0]`),
    or any non-identifier/numeric segment (Req 3.6),
  - a chain not rooted at a tracked param or `params` (including a destructured alias that is
    not a tracked param) (Req 3.7).
- **Depth guard:** reject chains exceeding 16 segments (→ `null`, `Warn_And_Skip`) (Req 3.2).

The walk collects segments from the outermost `MemberExpression` inward, then reverses to source
order; the root identifier is dropped only when it equals `params`.

### 3. RHS reference resolution (parser.js — reuses existing `resolveConstMemberExpression`)

A small wrapper `resolveRhsReference(node, constBindings, filePath)` used only inside
`extractCondition`:
- Accepts `EnumName.KEY` and `EnumName["KEY"]` / `ConstName["KEY"]` forms. For the `["KEY"]`
  computed form with a string-literal key, normalize to the property name before calling
  `resolveConstMemberExpression` (which today handles the `Identifier.Identifier` form).
- Returns `{ ok: true, value }` when it resolves to a string/number/boolean literal;
  `{ ok: false, reason }` otherwise (unknown object, unknown key, non-primitive value,
  computed non-literal). `constBindings` already merges imported enum/const bindings, so
  same-file and imported references both resolve (Req 1.5, 2.5).
- `resolveConstMemberExpression` currently pushes an "Unknown property" **warning** for a
  missing key; in the new-construct path `resolveRhsReference`/`extractCondition` calls it with a
  throwaway warnings array (so the low-level warning is not double-emitted) and, on `ok: false`,
  returns `null` so the caller emits a single condition-specific `Warn_And_Skip` warning. This
  keeps the existing element-matcher callers unchanged.

### 4. New_Condition_Construct detection (parser.js — NEW helper)

```
usesNewConditionConstruct(testNode, trackedParams) -> boolean
```

Returns true when the condition (or the negated/binary operand it wraps) uses either:
- (a) an enum/const member reference on the RHS (`Identifier.Identifier` or `Identifier["str"]`
  where the object is not `ctx` and not a bare param root), or
- (b) a nested LHS member-access path of depth > 1 rooted at a tracked param or `params`.

**Purpose (optional / message-only):** this predicate no longer decides control flow — every
unresolvable condition now returns `null` (`Warn_And_Skip`). It is optional and
may be omitted entirely. If retained, it is used only to craft a more specific warning message
(e.g. "unresolvable enum/const reference" vs a generic "unsupported condition"). Single-segment
param paths and pure string/boolean/number literal RHS are NOT new constructs.

### 5. `extractIfStep` / `extractWhenStep` (parser.js — CHANGED)

Both already receive `constBindings` and `filePath`. Changes:
- Pass `constBindings` and `filePath` into `extractCondition`.
- Inspect the return value (now two-way):
  - descriptor → proceed as today,
  - `null` → push the existing `Unsupported if-condition …` / `Unsupported When() condition …`
    warning and return null (`Warn_And_Skip`). This covers unsupported non-new-construct
    conditions AND unresolvable New_Condition_Constructs alike (Req 6.1–6.3, 8.4, 8.5). No step
    is produced, and the file still compiles and emits its spec.

### 6. Warning surfacing in `parseSource` / `parseFile` (parser.js — unchanged mechanism)

`parseSource` returns `{ filePath, type, tests, elements, tasks, automations, dataTemplates,
imports, error, warnings }` where `error` is a single parse-error object (or null) and
`warnings` is an array; compile **succeeds with warnings**.

Unresolvable-condition warnings flow through the **existing `warnings` array**, exactly like
today's `Unsupported if-condition …` / `Unsupported When() condition …` warnings. There is no
new failure channel:
- No `errors: []` array is added.
- No clearing of `tests` / `tasks` / `automations`.
- No file-level failure and no setting of `result.error` for a dropped condition.

`parseSource` continues to emit the compiled spec for the file. The warning message for an
unresolvable New_Condition_Construct includes the source file path, the 1-based line number
(`lineOf(node)`), and the offending reference text (Req 6.1), but it is a warning like any
other. No build/CLI consumer change is required — an unresolvable condition never fails a file.

### 7. `evaluateCondition(condition, params, contextStore)` (background.js — CHANGED)

Add path-walking while preserving the flat-key and ctx paths:

```js
function evaluateCondition(condition, params, contextStore) {
  var val;
  if (condition.source === 'ctx') {
    val = contextStore && contextStore.hasOwnProperty(condition.key)
      ? contextStore[condition.key] : undefined;
  } else if (condition.path && condition.path.length) {
    // Walk nested path against params; missing intermediate -> undefined, never throw.
    var cur = params;
    for (var i = 0; i < condition.path.length; i++) {
      if (cur == null) { cur = undefined; break; }
      cur = cur[condition.path[i]];
    }
    val = cur;
  } else {
    // Legacy flat descriptor.
    val = params ? params[condition.param] : undefined;
  }
  switch (condition.op) {
    case 'truthy':    return !!val;
    case 'falsy':     return !val;
    case 'equals':    return val === condition.value;
    case 'notEquals': return val !== condition.value;
    default:          return false;
  }
}
```

- `path` present → left-to-right walk from `params`; a null/undefined intermediate stops the
  walk with `val = undefined`, no throw (Req 4.1, 4.3, 4.7, 4.8).
- `path` absent → legacy `params[condition.param]` unchanged (Req 4.2, 4.6).
- Operators unchanged; `equals`/`notEquals` use `===`/`!==` with no coercion, so numeric vs
  string never coerce (Req 4.4, 4.5, 5.5, 5.6, 7.6).
- Guarded `params` access covers absent/null/empty params (Req 4.7, 4.8).

## Data Models

### Condition_Descriptor (evolved shape)

Decision: **param-based descriptors carry `path: string[]`; the legacy `param: string` field is
still accepted by the runtime for backward compatibility.** The compiler emits `path` for ALL
param-based conditions going forward (a flat param emits `path: ['name']`), and STOPS emitting
`param` for newly compiled specs. The runtime reads `path` when present and falls back to
`param` otherwise, so previously compiled specs (flat `param`) and JSON authored before this
change keep working.

Rationale for `path` over keeping `param` for single + `path` for nested: a single code path in
`evaluateCondition` (walk `path`) covers depth 1..16 uniformly, and `['name']` is exactly
equivalent to the old flat lookup, minimizing runtime branching. `param` is retained as a
read-only compatibility alias, never removed, so no migration of existing specs is required.

Shape variants:

| Variant | Fields | Example |
|---|---|---|
| Param path (new) | `{ path: string[], op, value? }` | `{ path: ['encounter','type'], op: 'equals', value: 'office_note' }` |
| Flat param (legacy, still read) | `{ param: string, op, value? }` | `{ param: 'flag', op: 'truthy' }` |
| Ctx (unchanged) | `{ source: 'ctx', key, op, value? }` | `{ source: 'ctx', key: 'loggedIn', op: 'truthy' }` |

`op` ∈ `truthy | falsy | equals | notEquals`. `value` is present only for `equals`/`notEquals`
and preserves its JS type: `string` (Req 5.3), `number` (Req 5.1, 5.2), never emitted for
boolean (boolean maps to `truthy`/`falsy`, Req 5.4).

### Before / after — motivating example

`if (encounter.type === EncounterTypes.OFFICE_NOTE)` where
`const EncounterTypes = { OFFICE_NOTE: 'office_note' } as const` (or a string enum):

- **Before this feature:** `extractCondition` returns `null` (LHS is a nested member access
  `getParamName` cannot handle, RHS is a member expression), producing an
  `Unsupported if-condition …` warning and dropping the block.
- **After this feature:**
  ```json
  { "path": ["encounter", "type"], "op": "equals", "value": "office_note" }
  ```

Other examples:
- `if (params.encounter.details.type !== Codes.URGENT)` with `Codes.URGENT = 3` →
  `{ "path": ["encounter","details","type"], "op": "notEquals", "value": 3 }` (Req 3.3, 5.2).
- `if (encounter.active === false)` → `{ "path": ["encounter","active"], "op": "falsy" }`
  (Req 5.4).
- `if (status === 200)` (flat param `status`) → `{ "path": ["status"], "op": "equals",
  "value": 200 }` (Req 5.1, 3.4).

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of
a system — essentially, a formal statement about what the system should do. Properties serve as
the bridge between human-readable specifications and machine-verifiable correctness guarantees._

PBT applies here because the core logic is pure: `extractParamPath`, the RHS resolution, and
`evaluateCondition` are pure functions over AST/JS values with universal properties over a large
input space. The following properties are consolidated (redundant criteria merged during
prework) so each provides unique validation value.

### Property 1: Path extraction round-trip (depth 1..16)

_For any_ list of 1 to 16 valid identifier segments rooted at a tracked param, building the
equivalent dot-access `MemberExpression` (or bare identifier for length 1) and running
`extractParamPath` returns exactly that segment list in source order.

**Validates: Requirements 3.1, 3.2, 3.4**

### Property 2: `params` root is excluded from the path

_For any_ list of 1 or more identifier segments, a chain rooted at `params`
(`params.<segments>`) extracts to a path equal to the segments with no leading `params` entry.

**Validates: Requirements 3.3, 3.4**

### Property 3: String-literal bracket access equals dot access

_For any_ segment list and _any_ per-segment choice of dot vs string-literal bracket access
(`x.a` vs `x['a']`), `extractParamPath` returns the same path as the all-dot equivalent chain.

**Validates: Requirements 3.5**

### Property 4: Invalid path shapes warn-and-skip

_For any_ chain that either contains a computed non-string-literal segment (`x[expr]`, `x[0]`,
`x[key]`) or is rooted at an identifier that is neither a tracked param nor `params`,
`extractParamPath` returns `null` and `extractCondition` returns `null` (`Warn_And_Skip`).

**Validates: Requirements 3.6, 3.7**

### Property 5: Literal RHS typing is preserved

_For any_ number literal `n` (including negative and floating-point in range), string literal
`s`, or boolean `b` on the RHS of an equality comparison against a tracked param:
`param === n` yields `{ op: 'equals', value: n }` with `typeof value === 'number'`;
`param === s` yields `{ op: 'equals', value: s }` with `typeof value === 'string'`;
`param === b` yields `{ op: b ? 'truthy' : 'falsy' }` with no `value`.

**Validates: Requirements 5.1, 5.3, 5.4, 7.3, 7.4**

### Property 6: Enum/const RHS resolution preserves type and maps operator

_For any_ `constBindings` entry `Obj` and _any_ key present on it whose value is a string or
number literal, and _any_ equality operator, `param <op> Obj.KEY` (and `Obj["KEY"]`) yields a
descriptor whose `value` strictly equals `constBindings[Obj][KEY]` with the same `typeof`, and
whose `op` is `equals` for `===`/`==` and `notEquals` for `!==`/`!=`. When the resolved value is
boolean, `op` maps to `truthy`/`falsy` with no `value`.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 5.2, 5.4**

### Property 7: Unresolvable or bad new-construct RHS warns and skips

_For any_ enum/const-style RHS reference `Obj.KEY` used against a tracked param where `Obj` is
absent from `constBindings`, OR `KEY` is absent from `constBindings[Obj]`, OR
`constBindings[Obj][KEY]` is a non-primitive (object/array), `extractCondition` returns `null`
(`Warn_And_Skip`) and a warning is recorded; it never throws and never emits a descriptor.

**Validates: Requirements 1.6, 1.7, 1.8, 2.6, 2.7, 2.8, 6.1, 6.2**

### Property 8: Runtime path-walk equals manual property access

_For any_ nested object value and _any_ path into it, the value resolved by `evaluateCondition`'s
path walk equals the value obtained by manually reducing the path over the object with safe
`null`/`undefined` stops (i.e. the `truthy`-op result equals `!!(manual walk)`).

**Validates: Requirements 4.1**

### Property 9: Flat descriptor backward-compat equivalence

_For any_ params object and _any_ key, evaluating `{ param: key, op }` produces the same operator
result as evaluating `{ path: [key], op }`, matching the pre-feature direct-lookup behavior.

**Validates: Requirements 4.2, 4.6, 7.1, 7.2, 7.6**

### Property 10: Operator semantics match native operators (strict, no coercion)

_For any_ resolved value `v` and _any_ comparison value `c` (drawn from mixed number/string/
boolean/undefined generators): `truthy` returns `!!v`; `falsy` returns `!v`; `equals` returns
`v === c`; `notEquals` returns `v !== c`. In particular string `"200"` does not equal number
`200`.

**Validates: Requirements 4.4, 4.5, 5.5, 5.6, 7.6**

### Property 11: No-throw and safe-undefined across arbitrary params

_For any_ params state (a valid object, a partial object, `{}`, `null`, or `undefined`) and _any_
Condition_Descriptor (arbitrary `path`, `op`, `value`), `evaluateCondition` never throws, and any
missing intermediate segment resolves as `undefined` rather than raising.

**Validates: Requirements 4.3, 4.7, 4.8**

### Property 12: Compiler → runtime shared-shape round-trip

_For any_ nested path and string/number literal comparison value, the descriptor emitted by
`extractCondition` for `<path> === <value>`, when evaluated by `evaluateCondition` against a
params object that carries that value at that path, returns `true`; against a params object that
carries a different value, returns `false`.

**Validates: Requirements 4.6, 3.1, 5.1**

### Property 13: Unresolvable new construct warns and still emits the spec

_For any_ source file whose only condition issue is a New_Condition_Construct that cannot be
resolved, `parseSource` still emits its compiled artifacts (`tests`/`tasks`/`automations` are
NOT cleared) and records a warning for the dropped condition. There is no `errors` array and no
file-level failure.

**Validates: Requirements 6.1, 6.2, 6.5, 8.4**

### Property 14: Non-new-construct unsupported condition still emits the spec

_For any_ source file whose only condition issue is an unsupported condition that is NOT a
New_Condition_Construct, `parseSource` emits the compiled artifacts and records a warning for the
skipped condition. Consistent with Property 13, ALL unresolvable conditions now emit the spec.

**Validates: Requirements 6.3, 6.4, 6.5, 8.5**

### Property 15: `When()` and `if` produce identical descriptors

_For any_ condition node, the result (a descriptor or `null`) produced by `extractCondition` is
identical whether the condition originates from an `if` statement or a `When(cond, cb)` call.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4**

## Error Handling

### Condition handling decision table

| Condition situation | Uses New_Condition_Construct? | Outcome | Spec emitted? | Requirements |
|---|---|---|---|---|
| Enum/const RHS resolves to string/number/boolean | yes | Descriptor emitted | yes | 1.1–1.4, 2.1–2.4, 5.2 |
| Enum/const RHS: object not in constBindings | yes | Warn_And_Skip | yes | 1.6, 2.6, 6.1 |
| Enum/const RHS: key not on object | yes | Warn_And_Skip | yes | 1.7, 2.7, 6.1 |
| Enum/const RHS: resolves to non-primitive / computed | yes | Warn_And_Skip | yes | 1.8, 2.8, 6.2 |
| Nested LHS path (depth>1) rooted at param/params, resolvable RHS | yes | Descriptor emitted | yes | 3.1–3.3 |
| LHS bracket segment not a string literal (`x[key]`,`x[0]`) | no | Warn_And_Skip | yes | 3.6, 6.5 |
| LHS chain not rooted at param/params (unknown alias) | no | Warn_And_Skip | yes | 3.7, 6.5 |
| LHS path exceeds 16 segments | no | Warn_And_Skip | yes | 3.2, 6.5 |
| Flat param / `params.X` / string / boolean / number literal RHS unsupported variant | no | Warn_And_Skip | yes | 6.3, 7.x |
| `ctx.key` (any supported form) | no | Ctx descriptor (deferred) | yes | 3.8, 7.5 |
| Unrecognized non-condition statement | n/a | Warn_And_Skip (unchanged) | yes | 6.4 |
| Same situations inside `When()` | same as `if` | same as `if` | same | 8.1–8.5 |

Note: ALL unsupported or unresolvable conditions — whether or not they use a
New_Condition_Construct — apply `Warn_And_Skip`, and the compiled spec is always emitted. There
is no outcome that fails a file.

### Warn-and-skip (all unresolvable conditions)

`extractCondition` returns `null` for any unsupported or unresolvable condition.
`extractIfStep`/`extractWhenStep` then push the standard `Unsupported if-condition …` /
`Unsupported When() condition …` warning onto the existing `warnings` array and produce no step.
For an unresolvable New_Condition_Construct the warning message additionally includes the source
file path, the 1-based line number (`lineOf(node)`), and the offending reference text (Req 6.1),
but it remains an ordinary warning: no `errors` array, no cleared artifacts, and no file-level
failure. `parseSource` always emits the compiled spec.

### Runtime no-throw (Req 4.8)

`evaluateCondition` guards every dereference: `contextStore`/`params` presence is checked, the
path walk stops on the first `null`/`undefined` intermediate with `val = undefined`, and the
operator switch has a `default: return false`. No params state can cause a throw.

## Testing Strategy

### Frameworks

- Test runner: `node:test` (existing pattern in `parser.test.js` and the extension tests).
- Property-based testing: `fast-check` (already used in `background.preservation.test.js`,
  `background.bugfix.test.js`, `storage.property.test.js`).
- Property tests run a minimum of **100 iterations** each (fast-check default; set explicitly
  where a property needs more). Each property test carries a tag comment:
  `// Feature: condition-enum-and-nested-params, Property {n}: {property text}`.

### Compiler tests (parser.js — unit + PBT)

- **Unit / example tests** (extend `parser.test.js`):
  - The motivating example compiles to
    `{ path: ['encounter','type'], op: 'equals', value: 'office_note' }` (round-trip example,
    covers Req 3.1 + 1.1 + 4.6 end-to-end at the compiler side).
  - Existing preserved forms still compile: flat truthy `if (flag)`, negation `if (!flag)`,
    string/boolean equality, `ctx.key` truthy/negation (Req 7.1–7.5, 3.8).
  - One import example: enum/const declared in an imported file resolves via merged
    `constBindings` (Req 1.5, 2.5) — integration-style, single example.
  - One warn-and-skip message example for an unresolvable new construct, asserting the warning
    message contains the file path, 1-based line, and offending reference text (Req 6.1).
  - One `When()` warn-and-skip example for a non-new-construct unsupported condition (Req 8.5).
- **Property tests** on the pure helpers: Properties 1–7, 13, 14, 15. Generators build acorn AST
  nodes (or small source strings parsed with acorn `locations: true`) for member-access chains,
  literals, and enum/const references; `constBindings` maps are generated with string/number/
  boolean and (for Property 7) non-primitive members.

### Runtime tests (background.js `evaluateCondition` — PBT)

Mirror `background.property.test.js` style (`evaluateCondition` is exported). Properties 8, 9,
10, 11, 12. Generators: arbitrary nested objects, arbitrary paths (including paths that miss),
arbitrary params states (`null`/`undefined`/`{}`/partial), and mixed number/string/boolean
comparison values to exercise strict-equality numeric semantics (Req 5.5, 5.6).

### Cross-component round-trip

Property 12 spans compiler emit → runtime consume: compile a generated `<path> === <value>`
condition, take the emitted descriptor, and evaluate it with `evaluateCondition` against matching
and non-matching params. This is the primary guard for the shared-shape decision (Req 4.6).

## Backward-compatibility risk & sync note

- **Key risk to verify during implementation:** the descriptor-shape decision (emit `path` for
  all param conditions, retain `param` as a read-only runtime fallback). During implementation,
  confirm that (a) previously compiled specs carrying flat `param` still evaluate identically
  (Property 9), and (b) `path: ['x']` is exactly equivalent to the old flat lookup (Property 1
  + Property 9). This is the highest-risk area for regressions.
- **Emit and consume must change together:** `parser.js` (emit `path`) and `background.js`
  `evaluateCondition` (consume `path`) must be modified in the same change and kept in sync,
  guarded by the Property 12 round-trip.
- **Other consumers checked:** `flattener.js` and `emitter.js` recurse into `step.then` and pass
  the `condition` object through opaquely (they read `step.action`, `step.source`, and forward
  `step.condition`); `background.js` `expandStep`/`emitLog`/plan-builder likewise copy the whole
  `condition` object. The new `path` field therefore passes through these layers unchanged — no
  edits required there, but this pass-through should be re-verified when implementing.
- **Uniform warn-and-skip:** all unsupported or unresolvable conditions — new-construct or not —
  apply `Warn_And_Skip` and the compiled spec is always emitted. There is no file-level failure
  mode. Confirm this uniform behavior with Properties 13 and 14 during review.
