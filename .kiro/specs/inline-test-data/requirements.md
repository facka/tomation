# Requirements Document

## Introduction

Tomation lets authors define Test Data with the DSL function `Data(template)`, which wraps an object of static values and `Fake.*` generator descriptors. Today a `Data()` template can only be declared in a dedicated `.data.ts` file and imported into a test or automation file. This feature adds the ability to declare `Data()` **inline**, at the top level of a test or automation file, so that an author can keep deterministic, file-local data next to the tests that use it. The existing shared-file (`.data.ts` + import) flow remains unchanged; inline `Data()` is purely additive.

Inline data is referenced in the DSL by using the declared TypeScript variable directly (e.g. `Type(user.name).in(field)`), which gives the author type safety and autocompletion. The Compiler emits a reference **token** (`{{data.user.name}}`) rather than inlining the literal value, so that behavior stays consistent between static values and runtime-resolved `Fake.*` values, and so the resolved data stays visible in the Data display. The Extension Runtime populates the run's data store from the inline template, resolves tokens at run time, and the Panel displays the resolved data in both the Test Plan view and the Run log — the same display already used for imported `.data.ts` templates.

## Glossary

- **DSL**: The TypeScript-first authoring surface for Tomation tests, automations, tasks, and data.
- **Compiler**: The build-time tool (`packages/compiler`) that parses DSL files with acorn, strips TypeScript types, and emits a portable JSON spec.
- **Runtime**: The browser-extension execution engine (`packages/extension/src/background.js`) that runs the compiled spec, resolves data, and drives the page.
- **Panel**: The Vue 3 side-panel UI that renders the Test Plan view and the Run view/log.
- **Data_Template**: The structure produced by a `Data(template, options?)` call — an object whose property values are static literals or `Fake.*` descriptors.
- **Data_Variable**: The TypeScript `const` binding assigned to a `Data(...)` call (e.g. `user` in `const user = Data({...})`).
- **Data_Name**: The key under which a Data_Template is stored in the compiled spec and the data store. Defaults to the Data_Variable name and may be overridden by `.as(name)`.
- **Data_Token**: A compiled reference string of the form `{{data.<name>.<path>}}` emitted in place of a direct Data_Variable member access.
- **Inline_Data**: A `Data()` declaration made at the top level of a test or automation file (as opposed to in a `.data.ts` file).
- **Shared_Data**: A `Data()` declaration made in a `.data.ts` file and imported into a test or automation file (the existing flow).
- **Data_Store**: The run-scoped flat dot-path map (e.g. `user.name`, `user.task.type`) the Runtime builds by resolving Data_Templates; it is distinct from the context store.
- **Context_Store**: The separate run store populated by `Save`/`SaveText`/`ctx` operations; out of scope for this feature.
- **Fake_Descriptor**: A compile-time placeholder (`Fake.*`) that the Runtime resolves to a concrete value at run time, optionally with a seed.
- **Test_Plan_View**: The Panel view that lists tests and their steps before a run, including the test data display.
- **Run_Log**: The Panel view that shows step-by-step execution results of a run, including the test data display at the top.

## Requirements

### Requirement 1: Declare inline Data in a test or automation file

**User Story:** As a test author, I want to declare `Data()` at the top level of my test or automation file, so that I can keep deterministic test data next to the tests that use it without creating a separate `.data.ts` file.

#### Acceptance Criteria

1. WHEN the Compiler parses a test or automation file containing a top-level declaration `const <var> = Data(<objectExpression>)`, THE Compiler SHALL produce a Data_Template from the object expression.
2. WHEN the Compiler produces a Data_Template from an Inline_Data declaration, THE Compiler SHALL assign the Data_Name to the Data_Variable name.
3. WHERE an Inline_Data declaration includes a second options argument containing a `seed` number (`Data(<object>, { seed: <number> })`), THE Compiler SHALL record that seed value on the Data_Template.
4. THE Compiler SHALL support static literal values and `Fake.*` descriptors as property values within an Inline_Data template.

### Requirement 2: Optional `.as(name)` override of the data name

**User Story:** As a test author, I want `.as(name)` on `Data()` to be optional, so that the data name defaults to my variable name but I can override it when I want a different reference name.

#### Acceptance Criteria

1. WHEN an Inline_Data declaration omits `.as(name)`, THE Compiler SHALL use the Data_Variable name as the Data_Name.
2. WHEN an Inline_Data declaration chains `.as(<stringLiteral>)` on the `Data(...)` call, THE Compiler SHALL use the string literal as the Data_Name instead of the Data_Variable name.
3. WHEN `.as(<stringLiteral>)` sets the Data_Name, THE Compiler SHALL emit Data_Tokens that reference the Data_Name (e.g. `const user = Data({...}).as('customer')` referenced as `user.color` SHALL emit `{{data.customer.color}}`).
4. IF `.as()` is called with no argument, or with an argument that is not a non-empty string literal, THEN THE Compiler SHALL record a warning identifying the file and line AND SHALL fall back to the Data_Variable name as the Data_Name.

### Requirement 3: Compile direct variable references into data tokens

**User Story:** As a test author, I want to reference data by using the data variable directly in my steps, so that I get type safety and autocompletion while the compiled spec stays stable and display-friendly.

#### Acceptance Criteria

1. WHEN the Compiler encounters a member access on a tracked Data_Variable in a value position (e.g. `Type(user.name).in(field)`), THE Compiler SHALL emit the Data_Token `{{data.<name>.<path>}}` in place of the value.
2. WHEN the referenced Data_Template property holds a static literal value, THE Compiler SHALL emit the Data_Token rather than inlining the literal value.
3. WHEN the referenced Data_Template property holds a `Fake.*` descriptor, THE Compiler SHALL emit the Data_Token for later runtime resolution.
4. WHEN the Compiler encounters a nested member access on a tracked Data_Variable (e.g. `user.task.type`), THE Compiler SHALL emit the Data_Token with the full dot path (`{{data.user.task.type}}`).
5. WHERE a Data_Name is set by `.as(name)`, THE Compiler SHALL use the Data_Name as the first path segment of every emitted Data_Token for that variable.

### Requirement 4: File-wide sharing of inline data

**User Story:** As a test author, I want an inline `Data()` declared at the top level of a file to be available to every test and automation in that file, so that multiple tests in one file can share the same deterministic data.

#### Acceptance Criteria

1. THE Compiler SHALL make a top-level Inline_Data declaration available to every test and automation defined in the same file.
2. WHEN two or more tests in the same file reference the same Inline_Data variable, THE Compiler SHALL emit Data_Tokens that resolve to the same Data_Name for each referencing test.
3. WHEN the Compiler emits the spec for a test that references an Inline_Data variable, THE Compiler SHALL attach the corresponding Data_Template to that test's compiled data.

### Requirement 5: Populate the data store (not the context store)

**User Story:** As a test author, I want inline data to be placed in the run's data store, so that it behaves like existing shared data and never collides with context values.

#### Acceptance Criteria

1. WHEN the Runtime starts a run of a test that carries an Inline_Data template, THE Runtime SHALL resolve the template into the Data_Store as flat dot-path entries.
2. THE Runtime SHALL populate inline data into the Data_Store and SHALL NOT populate it into the Context_Store.
3. WHEN the Runtime resolves a `{{data.<name>.<path>}}` token during a run, THE Runtime SHALL substitute the value held at the matching Data_Store dot path.
4. WHERE an Inline_Data template carries a seed, THE Runtime SHALL resolve the template's `Fake.*` descriptors using that seed so that resolved values are reproducible across runs.
5. WHEN the Runtime begins a new run, THE Runtime SHALL reset the Data_Store before resolving the run's data templates.

### Requirement 6: Use inline data in assertions

**User Story:** As a test author, I want to reference inline data in assertions, so that I can verify the page reflects the data values I supplied.

#### Acceptance Criteria

1. WHEN the Compiler encounters a direct Data_Variable reference in an assertion value position (e.g. `AssertHasText(label, user.color)`), THE Compiler SHALL emit the corresponding Data_Token as the assertion's expected value.
2. WHEN the Runtime evaluates an assertion whose expected value is a `{{data.<name>.<path>}}` token, THE Runtime SHALL resolve the token from the Data_Store before comparing against the observed page value.

### Requirement 7: Display inline data in the plan and run log

**User Story:** As a test author, I want inline data to appear in the test plan and at the top of the run log, so that I can see the exact values a run used, including resolved `Fake.*` values.

#### Acceptance Criteria

1. WHEN a run resolves an Inline_Data template, THE Runtime SHALL emit the resolved data and seeds to the Panel using the existing data-resolved message.
2. WHEN the Panel receives resolved inline data, THE Test_Plan_View SHALL display the inline data using the existing test data display.
3. WHEN the Panel receives resolved inline data, THE Run_Log SHALL display the inline data at the top of the log using the existing test data display.
4. THE Panel SHALL display inline data through the same display path used for Shared_Data, without a separate display implementation.

### Requirement 8: Preserve the shared-file data flow

**User Story:** As a test author with existing `.data.ts` files, I want the imported shared-data flow to keep working exactly as before, so that adding inline data does not break my current tests.

#### Acceptance Criteria

1. WHEN a test or automation file imports a Data_Template from a `.data.ts` file, THE Compiler SHALL continue to track the imported variable and emit Data_Tokens for its member accesses as it does today.
2. THE Compiler SHALL continue to attach imported Shared_Data templates to the tests that reference them.
3. WHERE a file uses both Inline_Data and imported Shared_Data, THE Compiler SHALL track both sets of Data_Variables and emit correct Data_Tokens for each.
4. WHEN the Runtime and Panel process a run that uses only Shared_Data, THE Runtime and Panel SHALL behave identically to the behavior before this feature.

### Requirement 9: Data scope is lexical to the test/automation body

**User Story:** As a test author, I want data variables to be referenceable only in test and automation bodies, so that tasks keep receiving concrete values through their params and data scope stays predictable.

#### Acceptance Criteria

1. THE Compiler SHALL resolve direct Data_Variable references to Data_Tokens only within test and automation bodies.
2. WHEN a Task body references a value, THE Compiler SHALL resolve it from the Task's params and SHALL NOT resolve it from Data_Variable scope.
3. WHEN a test or automation invokes a Task, THE Compiler SHALL pass data values to the Task as concrete param values (which may themselves be Data_Tokens resolved from the calling body).

### Requirement 10: Update DSL type definitions

**User Story:** As a test author, I want TypeScript types that reflect the optional `.as()` method and typed property access, so that my editor validates inline data usage and offers autocompletion.

#### Acceptance Criteria

1. THE DSL type definitions SHALL declare an optional `.as(name: string)` method on the value returned by `Data(...)`.
2. THE DSL type definitions SHALL expose typed property access for the template properties on the value returned by `Data(...)` so that nested property access is type-checked.
3. WHERE `.as(name)` is chained, THE DSL type definitions SHALL return a value that continues to expose the same typed property access.

### Requirement 11: Error and warning handling

**User Story:** As a test author, I want clear warnings for ambiguous or invalid inline data usage, so that I can fix mistakes before running.

#### Acceptance Criteria

1. IF two Inline_Data declarations in the same file resolve to the same Data_Name, THEN THE Compiler SHALL record a warning identifying the conflicting Data_Name and the file.
2. IF an Inline_Data declaration and an imported Shared_Data variable in the same file resolve to the same Data_Name, THEN THE Compiler SHALL record a warning identifying the conflicting Data_Name and the file.
3. IF `.as()` is called with an empty string, a non-string literal, or no argument, THEN THE Compiler SHALL record a warning identifying the file and line.
4. IF a step references a Data_Variable property path that is not defined in the Data_Template, THEN THE Compiler SHALL record a warning identifying the unknown path, the Data_Name, and the file and line.
5. WHEN the Compiler records a warning for an inline data issue, THE Compiler SHALL still emit output for the affected test or automation using a best-effort resolution of the issue (for a Data_Name conflict, deterministically selecting one Data_Template definition), rather than skipping output for that item.
6. WHEN the Compiler records a warning for an inline data issue, THE Compiler SHALL continue compiling the remaining tests and automations in the file.
