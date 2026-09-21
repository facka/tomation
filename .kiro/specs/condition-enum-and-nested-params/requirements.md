# Requirements Document

## Introduction

This feature extends the tomation DSL condition handling used inside `if (...)` blocks in Task/Test/Automation bodies and the functional equivalent `When(cond, () => { ... })`. Today, conditions support only flat param truthiness and equality/inequality against string or boolean literals, plus `ctx.key` conditions. This feature adds three capabilities:

1. Right-hand-side (RHS) resolution of TypeScript enum members and `const` object-map members (e.g. `EncounterTypes.OFFICE_NOTE`) to their literal comparison value, resolved by the compiler at compile time.
2. Left-hand-side (LHS) nested member-access property paths on a param at arbitrary depth (e.g. `encounter.type`, `encounter.details.type`), which requires the compiled condition descriptor to carry a full property path and the runtime evaluator to walk that path.
3. Numeric literal comparison values (and numeric enum/const members), in addition to the existing string and boolean support.

Concrete motivating example that MUST compile after this feature:

```ts
const createNewEncounter = Task((params: { encounter: any }) => {
  const { encounter } = params
  if (encounter.type === EncounterTypes.OFFICE_NOTE) {
    Click(newOfficeNoteButton)
  }
}).as('Create New Encounter Task')
```

> **Note on unresolvable constructs:** When a condition uses one of the new constructs (an enum/const member reference on the RHS, or a nested member-access path on the LHS) and that reference cannot be resolved at compile time, the compiler applies the existing warn-and-skip behavior: it emits a warning, drops the affected condition, and continues compiling successfully, emitting the spec. This is consistent with how every other unsupported condition is already handled.

## Glossary

- **Compiler**: The tomation compiler component in `packages/compiler/src/parser.js` that parses DSL source (TypeScript AST) and emits the spec JSON.
- **Runtime_Condition_Evaluator**: The `evaluateCondition(condition, params, contextStore)` function in `packages/extension/src/background.js` that evaluates a Condition_Descriptor at execution time.
- **Condition_Descriptor**: The serialized condition object produced by the Compiler and consumed by the Runtime_Condition_Evaluator. Current shape variants: `{ param, op, value? }` for param-based conditions and `{ source: 'ctx', key, op, value? }` for ctx-based conditions. Operators (`op`) are `truthy`, `falsy`, `equals`, `notEquals`.
- **Param_Path**: An ordered list of one or more property-name segments identifying a nested value on a param object (e.g. `["encounter", "type"]` for `encounter.type`; `["encounter", "details", "type"]` for `encounter.details.type`). A single-segment Param_Path (e.g. `["flag"]`) represents a flat param reference.
- **Enum_Reference**: A member access of the form `EnumName.KEY` or `EnumName["KEY"]` where `EnumName` is a TypeScript `enum` declared in the source.
- **Const_Map_Reference**: A member access of the form `ConstName.KEY` or `ConstName["KEY"]` where `ConstName` is a `const` object map (e.g. `const EncounterTypes = { OFFICE_NOTE: 'office_note' } as const`).
- **Resolved_Literal**: The compile-time literal value (string, boolean, or number) obtained by resolving an Enum_Reference or Const_Map_Reference.
- **Const_Bindings**: The existing map built by the Compiler (via `buildConstBindings`) that records `{ varName: { propName: literalValue } }` for enums and const object maps, used today for element matcher resolution.
- **Warn_And_Skip**: The existing diagnostic behavior in which the Compiler emits a warning, drops the affected condition block or statement, and continues compilation successfully, still emitting the compiled spec.
- **New_Condition_Construct**: A condition that uses either (a) an Enum_Reference or Const_Map_Reference on the RHS, or (b) a nested member-access Param_Path (depth greater than one) on the LHS. This is a descriptive term identifying which constructs are new; it does not imply any special failure behavior.
- **When_Form**: The functional conditional `When(condition, () => { ...steps })`, the equivalent of an `if` block, handled by the Compiler to produce the same conditional step shape.

## Requirements

### Requirement 1: Resolve Enum Members on the Right-Hand Side

**User Story:** As a DSL author, I want to compare a param against a TypeScript enum member (e.g. `EncounterTypes.OFFICE_NOTE`), so that I can express conditions using named enum values instead of raw literals.

#### Acceptance Criteria

1. WHEN a condition compares a param against an Enum_Reference of the form `EnumName.KEY`, THE Compiler SHALL resolve the Enum_Reference to its Resolved_Literal, preserving the enum member's underlying value type (string Resolved_Literal for a string enum member, numeric Resolved_Literal for a numeric enum member), and use that Resolved_Literal as the Condition_Descriptor comparison value.
2. WHEN a condition compares a param against an Enum_Reference of the form `EnumName["KEY"]`, THE Compiler SHALL resolve the Enum_Reference to its Resolved_Literal, preserving the enum member's underlying value type (string Resolved_Literal for a string enum member, numeric Resolved_Literal for a numeric enum member), and use that Resolved_Literal as the Condition_Descriptor comparison value.
3. WHEN an Enum_Reference is used with the `===` or `==` operator, THE Compiler SHALL produce a Condition_Descriptor with the `equals` operator and the Resolved_Literal as the value.
4. WHEN an Enum_Reference is used with the `!==` or `!=` operator, THE Compiler SHALL produce a Condition_Descriptor with the `notEquals` operator and the Resolved_Literal as the value.
5. WHEN an Enum_Reference names an enum that is present in Const_Bindings, THE Compiler SHALL resolve the Enum_Reference regardless of whether the enum is declared in the same file as the condition or imported from another file.
6. IF an Enum_Reference names an enum that is not present in Const_Bindings, THEN THE Compiler SHALL apply Warn_And_Skip (emit a warning identifying the file, line, and the unresolvable Enum_Reference, drop the affected condition, and continue compiling successfully), WITHOUT attempting any fallback resolution (no global-scope lookup and no additional import resolution beyond Const_Bindings), and SHALL NOT produce a Condition_Descriptor for that condition.
7. IF an Enum_Reference names a key that is not present on the referenced enum, THEN THE Compiler SHALL apply Warn_And_Skip (emit a warning identifying the file, line, and the unresolvable Enum_Reference, drop the affected condition, and continue compiling successfully), and SHALL NOT produce a Condition_Descriptor for that condition.
8. IF an Enum_Reference resolves to a computed enum member whose value cannot be resolved to a Resolved_Literal at compile time, THEN THE Compiler SHALL apply Warn_And_Skip (emit a warning identifying the file, line, and the unsupported Enum_Reference, drop the affected condition, and continue compiling successfully), and SHALL NOT produce a Condition_Descriptor for that condition.

### Requirement 2: Resolve Const Object-Map Members on the Right-Hand Side

**User Story:** As a DSL author, I want to compare a param against a `const` object-map member (e.g. `EncounterTypes.OFFICE_NOTE` where `EncounterTypes` is a `const` object), so that I can express conditions using shared constant maps.

#### Acceptance Criteria

1. WHEN a condition compares a param against a Const_Map_Reference of the form `ConstName.KEY`, THE Compiler SHALL resolve the Const_Map_Reference to its Resolved_Literal (a string, number, or boolean member value), preserving the member value's type, and use that Resolved_Literal as the Condition_Descriptor comparison value.
2. WHEN a condition compares a param against a Const_Map_Reference of the form `ConstName["KEY"]`, THE Compiler SHALL resolve the Const_Map_Reference to its Resolved_Literal (a string, number, or boolean member value), preserving the member value's type, and use that Resolved_Literal as the Condition_Descriptor comparison value.
3. WHEN a Const_Map_Reference is used with the `===` or `==` operator, THE Compiler SHALL produce a Condition_Descriptor with the `equals` operator and the Resolved_Literal as the value.
4. WHEN a Const_Map_Reference is used with the `!==` or `!=` operator, THE Compiler SHALL produce a Condition_Descriptor with the `notEquals` operator and the Resolved_Literal as the value.
5. WHEN a Const_Map_Reference names a const object that is present in Const_Bindings, THE Compiler SHALL resolve the Const_Map_Reference whether the const object is declared with `as const` or as a plain `const`, and whether it is declared in the same file as the condition or imported from another file.
6. IF a Const_Map_Reference names a const object that is not present in Const_Bindings, THEN THE Compiler SHALL apply Warn_And_Skip (emit a warning identifying the file, line, and the unresolvable Const_Map_Reference, drop the affected condition, and continue compiling successfully), and SHALL NOT produce a Condition_Descriptor for that condition.
7. IF a Const_Map_Reference names a key that is not present on the referenced const object, THEN THE Compiler SHALL apply Warn_And_Skip (emit a warning identifying the file, line, and the unresolvable Const_Map_Reference, drop the affected condition, and continue compiling successfully), and SHALL NOT produce a Condition_Descriptor for that condition.
8. IF a Const_Map_Reference resolves to a member value that is not a string, number, or boolean literal (for example a nested object, an array, or a computed expression), THEN THE Compiler SHALL apply Warn_And_Skip (emit a warning identifying the file, line, and the unsupported Const_Map_Reference, drop the affected condition, and continue compiling successfully), and SHALL NOT produce a Condition_Descriptor for that condition.

### Requirement 3: Nested Member-Access Param Paths on the Left-Hand Side

**User Story:** As a DSL author, I want to reference a nested property path on a param (e.g. `encounter.type` or `encounter.details.type`), so that I can write conditions against structured param values.

#### Acceptance Criteria

1. WHEN the left-hand side of a condition is a member-access chain rooted at a tracked param (e.g. `encounter.type`), THE Compiler SHALL produce a Condition_Descriptor carrying the full Param_Path for that chain as an ordered list of string segments beginning with the param root identifier.
2. WHEN the member-access chain has a depth of 2 or more property accesses (e.g. `encounter.details.type`, up to a maximum of 16 segments), THE Compiler SHALL produce a Condition_Descriptor whose Param_Path contains every segment in source order from the param root to the final property, with one Param_Path entry per accessed property.
3. WHEN the left-hand side is a member-access chain rooted at the `params` identifier (e.g. `params.encounter.type`), THE Compiler SHALL produce a Condition_Descriptor whose Param_Path contains the segments following `params` in source order, excluding the `params` root segment.
4. WHEN the left-hand side is a bare tracked param identifier or a single-segment `params.X` reference, THE Compiler SHALL produce a Condition_Descriptor whose Param_Path contains exactly one segment (`X`), identical to the current flat-param behavior.
5. WHEN the left-hand side is a member-access chain that mixes dot access and bracket access using string literals (e.g. `encounter['type']` or `encounter.details['type']`), THE Compiler SHALL treat each string-literal bracket segment as equivalent to its dot-access form and produce a Condition_Descriptor with the same Param_Path segments as the equivalent dot-only chain.
6. IF a member-access chain on the left-hand side contains a bracket segment whose key is not a string literal (e.g. a computed expression, numeric index, or variable such as `encounter[key]` or `encounter[0]`), or contains any segment that is not a valid identifier, THEN THE Compiler SHALL apply the existing Warn_And_Skip behavior for that unsupported condition, dropping the affected condition and continuing to compile successfully.
7. IF a member-access chain on the left-hand side is not rooted at a tracked param or the `params` identifier (including chains rooted at a destructured alias that does not resolve to a tracked param), THEN THE Compiler SHALL apply the existing Warn_And_Skip behavior for that unsupported condition, dropping the affected condition and continuing to compile successfully.
8. THE Compiler SHALL continue to support `ctx.key` conditions with their current runtime-deferred semantics.

### Requirement 4: Runtime Evaluation of Nested Param Paths

**User Story:** As a test executor, I want the runtime to evaluate a nested Param_Path against the current params, so that conditions using nested paths produce the correct boolean result at execution time.

#### Acceptance Criteria

1. WHEN the Runtime_Condition_Evaluator receives a Condition_Descriptor carrying a Param_Path of one or more segments, THE Runtime_Condition_Evaluator SHALL resolve the value by reading each segment in left-to-right order, using each segment as a property key against the object returned by the preceding segment, starting from the params object.
2. WHEN the Runtime_Condition_Evaluator receives a Condition_Descriptor that carries a single-segment param key in the existing flat shape rather than a Param_Path, THE Runtime_Condition_Evaluator SHALL resolve the value as a direct property lookup of that key on the params object, producing the same result it produced before Param_Path support existed.
3. IF any segment of a Param_Path other than the final segment resolves to a value that is null or undefined, THEN THE Runtime_Condition_Evaluator SHALL stop walking further segments, treat the resolved value as undefined, evaluate the operator against undefined, and SHALL NOT throw or raise an error.
4. WHEN the resolved value is compared using operator `truthy`, THE Runtime_Condition_Evaluator SHALL return true only when the resolved value is JavaScript-truthy, and WHEN the operator is `falsy`, THE Runtime_Condition_Evaluator SHALL return true only when the resolved value is JavaScript-falsy.
5. WHEN the resolved value is compared using operator `equals`, THE Runtime_Condition_Evaluator SHALL return true only when the resolved value is strictly equal (no type coercion) to the descriptor's comparison value, and WHEN the operator is `notEquals`, THE Runtime_Condition_Evaluator SHALL return true only when the resolved value is not strictly equal to the descriptor's comparison value.
6. THE Compiler and THE Runtime_Condition_Evaluator SHALL use a shared Condition_Descriptor shape such that any Param_Path emitted by the Compiler is resolvable by the Runtime_Condition_Evaluator, and such that a Condition_Descriptor emitted in the prior flat single-key shape remains resolvable without modification.
7. IF the params object is absent, null, or an empty object when a Param_Path is evaluated, THEN THE Runtime_Condition_Evaluator SHALL treat the resolved value as undefined, evaluate the operator against undefined, and SHALL NOT throw or raise an error.
8. WHILE evaluating any Condition_Descriptor, THE Runtime_Condition_Evaluator SHALL NOT throw or raise an error regardless of the params object state (including when params is present and valid, absent, null, or empty).

### Requirement 5: Numeric Comparison Values

**User Story:** As a DSL author, I want conditions to compare against numeric literals and numeric enum/const members, so that I can express numeric equality checks.

#### Acceptance Criteria

1. WHEN a condition compares a param against a numeric literal (integer, negative, or floating-point, in the range -999,999,999,999.999 to 999,999,999,999.999) on the right-hand side, THE Compiler SHALL produce a Condition_Descriptor whose comparison value is the numeric value preserving its numeric type (i.e., number 200, not the string "200").
2. WHEN an Enum_Reference or Const_Map_Reference resolves to a numeric Resolved_Literal, THE Compiler SHALL use that numeric Resolved_Literal, preserving its numeric type, as the Condition_Descriptor comparison value.
3. WHEN a condition compares a param against a string literal or a string Resolved_Literal, THE Compiler SHALL produce a Condition_Descriptor whose comparison value is the string value preserving its string type (i.e., string "200", not the number 200).
4. WHEN a condition compares a param against a boolean literal or a boolean Resolved_Literal, THE Compiler SHALL produce a Condition_Descriptor whose comparison value maps boolean `true` to `truthy` and boolean `false` to `falsy`, consistent with the current boolean handling.
5. WHEN the Runtime_Condition_Evaluator evaluates an `equals` operator against a numeric comparison value, THE Runtime_Condition_Evaluator SHALL compare the resolved param value against the numeric comparison value using strict equality (===) with no type coercion, such that the result is true only when the resolved value is of numeric type and numerically identical (e.g., number 200 equals number 200; string "200" does NOT equal number 200; -5 equals -5; 3.14 equals 3.14).
6. WHEN the Runtime_Condition_Evaluator evaluates a `notEquals` operator against a numeric comparison value, THE Runtime_Condition_Evaluator SHALL return the strict-inequality (!==) result with no type coercion, such that the result is true whenever the resolved value differs in type or numeric value from the numeric comparison value (e.g., string "200" is notEquals number 200 returns true; number 200 is notEquals number 200 returns false).

### Requirement 6: Consistent Warn-and-Skip for Unresolvable Conditions

**User Story:** As a DSL author, I want the compiler to handle unresolvable conditions consistently by warning and skipping them, so that the compile still succeeds and behavior is uniform across all condition constructs.

#### Acceptance Criteria

1. IF a condition uses a New_Condition_Construct (an Enum_Reference or Const_Map_Reference on the right-hand side, or a nested member-access Param_Path on the left-hand side) and it cannot be resolved at compile time, THEN THE Compiler SHALL apply Warn_And_Skip: emit a warning whose message includes the source file path, the 1-based line number, and the offending unresolvable reference or value; drop the affected condition; and continue compiling successfully, emitting the compiled spec.
2. IF a condition uses a nested member-access Param_Path on the left-hand side that is rooted at a tracked param or `params` but the resolved comparison value has a type other than string, boolean, or number, THEN THE Compiler SHALL apply Warn_And_Skip: emit a warning whose message includes the source file path, the 1-based line number, and the offending value; drop the affected condition; and continue compiling successfully, emitting the compiled spec.
3. WHERE a condition does NOT use a New_Condition_Construct, THE Compiler SHALL preserve the existing Warn_And_Skip behavior for unsupported `if`-conditions unchanged, skipping only the affected condition and continuing to emit the compiled spec.
4. WHERE a statement is an unrecognized non-condition DSL construct, THE Compiler SHALL preserve the existing "Unrecognized statement" Warn_And_Skip behavior unchanged, skipping only the affected statement and continuing to emit the compiled spec.
5. THE Compiler SHALL emit the compiled spec for a file whose only condition issues are Warn_And_Skip cases, which now includes all unresolvable-condition cases regardless of whether the condition uses a New_Condition_Construct.

### Requirement 7: Preserve Existing Condition Forms and Operators

**User Story:** As a DSL author, I want all currently supported condition forms to continue working, so that this feature does not regress existing specs.

#### Acceptance Criteria

1. WHEN a condition is a flat param truthiness check (e.g. `if (flag)`), THE Compiler SHALL produce a `truthy` Condition_Descriptor as today.
2. WHEN a condition is a negation (e.g. `if (!flag)`), THE Compiler SHALL produce a `falsy` Condition_Descriptor as today.
3. WHEN a condition compares a param, `params.X`, or `ctx.key` against a string literal using `===`/`==` or `!==`/`!=`, THE Compiler SHALL produce an `equals` or `notEquals` Condition_Descriptor as today.
4. WHEN a condition compares a param, `params.X`, or `ctx.key` against a boolean literal, THE Compiler SHALL map the condition to `truthy` or `falsy` as today.
5. WHEN a condition is a `ctx.key` truthiness or negation check, THE Compiler SHALL produce a ctx-based Condition_Descriptor deferred to runtime as today.
6. THE Runtime_Condition_Evaluator SHALL continue to support the `truthy`, `falsy`, `equals`, and `notEquals` operators with their current semantics.

### Requirement 8: When() Equivalence

**User Story:** As a DSL author, I want the functional `When(cond, () => { ... })` form to support the same new condition capabilities as `if`, so that both forms behave identically.

#### Acceptance Criteria

1. WHEN a When_Form condition uses an Enum_Reference or Const_Map_Reference on the right-hand side, THE Compiler SHALL resolve and produce the same Condition_Descriptor as the equivalent `if` condition.
2. WHEN a When_Form condition uses a nested member-access Param_Path on the left-hand side, THE Compiler SHALL produce the same Param_Path-carrying Condition_Descriptor as the equivalent `if` condition.
3. WHEN a When_Form condition compares against a string, boolean, or numeric value, OR against a resolved Enum_Reference or Const_Map_Reference, THE Compiler SHALL produce the same Condition_Descriptor as the equivalent `if` condition.
4. IF a When_Form condition uses a New_Condition_Construct that cannot be resolved at compile time, THEN THE Compiler SHALL apply Warn_And_Skip consistent with Requirement 6 (emit a warning, drop the affected condition, and continue compiling successfully).
5. WHERE a When_Form condition does NOT use a New_Condition_Construct and is unsupported, THE Compiler SHALL preserve the existing Warn_And_Skip behavior for `When()` conditions unchanged.
