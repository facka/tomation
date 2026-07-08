# Requirements Document

## Introduction

This feature introduces a new DSL concept called "Automation" to the Tomation framework. An Automation is similar to a Test but declares typed parameters that the user fills in via a form in the side panel before execution. While Tests run immediately with hardcoded values, Automations prompt the user to provide input values through a dynamically generated form based on the declared parameter types. This enables reusable, user-driven test procedures where values are determined at run-time rather than at authoring time.

Automations are authored in dedicated `*.automation.ts` files, stored in a configured `automations` directory. They can import and invoke Tasks from POM files, and are namespaced by their file path (consistent with how Tests are namespaced).

## Glossary

- **Automation**: A parameterized test-like declaration in the Tomation DSL that requires user-provided parameter values before execution. Declared using the `Automation` function in `*.automation.ts` files.
- **Automation_Param**: A single typed parameter declared in the Automation's function signature. Each param has a name and a type (string, number, or date).
- **Param_Form**: The dynamically generated HTML form displayed in the side panel when an Automation is selected, containing input controls for each declared Automation_Param.
- **Compiler**: The Tomation compiler that parses `.pom.ts` and `.test.ts` files and emits JSON test plans.
- **Runtime**: The Tomation extension background script that executes JSON test plans in the browser.
- **Side_Panel**: The browser extension side panel that displays the test list, test plan view, and run view.
- **Test_Plan_View**: The view displayed in the Side_Panel when a test or Automation is selected, showing the steps and configuration.
- **Spec**: The compiled `.tomation.json` output file consumed by the extension.

## Requirements

### Requirement 1: DSL Automation Function Declaration

**User Story:** As a test author, I want to declare Automations with typed parameters in the DSL, so that I can create reusable test procedures whose values are provided at run-time.

#### Acceptance Criteria

1. THE DSL SHALL provide an `Automation` function that accepts a single function argument with a typed params object parameter and returns a builder with an `.as(label)` method
2. WHEN `Automation(fn).as(label)` is called, THE DSL SHALL return an Automation descriptor containing the function reference and the label string
3. THE DSL SHALL allow the Automation function argument to declare parameters of type `string`, `number`, and `Date` in the TypeScript params object type annotation
4. WHEN the Automation function body references `params.paramName`, THE Compiler SHALL treat the reference as a template placeholder `{{paramName}}` in the emitted steps, identical to Task parameter resolution
5. THE DSL type definitions SHALL declare the `Automation` function as a global function accepting a typed params function argument and returning a builder with `.as(label: string)` that produces an Automation descriptor

### Requirement 2: Compiler Parsing of Automation Declarations

**User Story:** As a developer, I want the compiler to parse Automation declarations and extract parameter metadata, so that the compiled output includes enough information to generate the parameter form.

#### Acceptance Criteria

1. WHEN the Compiler encounters `Automation(fn).as(label)` in a source file, THE Compiler SHALL parse the declaration and emit an automation entry in the Spec output
2. THE Compiler SHALL use `ts.createSourceFile()` from the TypeScript compiler API to parse the raw TypeScript source and extract parameter names and their type annotations from the Automation function argument's params type definition
3. WHEN a parameter type annotation is `string`, THE Compiler SHALL emit `"string"` as the param type in the Spec output
4. WHEN a parameter type annotation is `number`, THE Compiler SHALL emit `"number"` as the param type in the Spec output
5. WHEN a parameter type annotation is `Date`, THE Compiler SHALL emit `"date"` as the param type in the Spec output
6. IF the Compiler encounters a parameter type annotation that is not `string`, `number`, `Date`, or a string union literal, THEN THE Compiler SHALL emit a warning with the source file path and line number and default the param type to `"string"`
7. THE Compiler SHALL extract the steps from the Automation function body using the same step extraction logic used for Task and Test function bodies
8. WHEN a step in the Automation function body references a param (e.g., `params.email`), THE Compiler SHALL emit the reference as a `{{email}}` template placeholder in the step value
9. WHEN a parameter is annotated with `?` (optional marker, e.g., `environment?: string`), THE Compiler SHALL include `optional: true` in the param metadata
10. WHEN a parameter type annotation is a string union literal (e.g., `'admin' | 'user' | 'viewer'`), THE Compiler SHALL emit `"enum"` as the param type and include an `options` array containing each literal string value

### Requirement 3: Spec JSON Schema for Automations

**User Story:** As a developer, I want the compiled JSON spec to include Automation definitions with parameter metadata, so that the extension can render the parameter form and execute the Automation.

#### Acceptance Criteria

1. THE Compiler SHALL emit an `automations` array at the top level of the Spec JSON output, alongside the existing `tests`, `tasks`, and `pageElements` fields
2. WHEN an Automation is compiled, THE Compiler SHALL emit an object in the `automations` array containing a `name` field set to the label string provided to `.as()`
3. THE Compiler SHALL include a `params` array in each automation object, where each entry contains a `name` field (the parameter name) and a `type` field (one of `"string"`, `"number"`, `"date"`)
4. THE Compiler SHALL include a `steps` array in each automation object, using the same step format as the existing `tests[].steps` array
5. THE Compiler SHALL preserve the declaration order of parameters in the emitted `params` array

### Requirement 4: Side Panel Automation Listing

**User Story:** As a user, I want to see Automations listed in the side panel alongside Tests, so that I can select and run them from the same interface.

#### Acceptance Criteria

1. WHEN a Spec contains an `automations` array with entries, THE Side_Panel SHALL display each Automation in the test list on the home view
2. THE Side_Panel SHALL visually distinguish Automation entries from Test entries in the list using a label or icon indicating the entry is an Automation
3. WHEN the user clicks an Automation entry in the list, THE Side_Panel SHALL navigate to the Test_Plan_View for that Automation
4. THE Side_Panel search filter SHALL include Automation names in its search results using the same case-insensitive substring matching used for Tests

### Requirement 5: Parameter Form Rendering

**User Story:** As a user, I want to see a form with labeled input fields for each declared parameter when I select an Automation, so that I can provide values before running the Automation.

#### Acceptance Criteria

1. WHEN an Automation is selected in the Test_Plan_View, THE Side_Panel SHALL render a Param_Form above the step checklist containing one input field for each declared Automation_Param
2. WHEN a param has type `"string"`, THE Param_Form SHALL render a text input (`<input type="text">`) for that param
3. WHEN a param has type `"number"`, THE Param_Form SHALL render a number input (`<input type="number">`) for that param
4. WHEN a param has type `"date"`, THE Param_Form SHALL render a date input (`<input type="date">`) for that param
5. THE Param_Form SHALL display the parameter name as the label for each input field
6. THE Param_Form SHALL display the input fields in the same order as the params are declared in the `params` array of the Spec
7. WHEN a param has `optional: true`, THE Param_Form SHALL visually distinguish the field (e.g., label suffix "(optional)") and SHALL NOT mark it as required
8. WHEN a param has type `"enum"` with an `options` array, THE Param_Form SHALL render a `<select>` dropdown with one `<option>` element for each value in the `options` array
9. WHEN previously used parameter values exist in storage for the selected Automation, THE Param_Form SHALL pre-fill input fields with those stored values

### Requirement 6: Automation Execution with Parameters

**User Story:** As a user, I want to run an Automation after filling in the parameter form, so that the provided values are used during step execution.

#### Acceptance Criteria

1. WHEN the user clicks the Run button for an Automation, THE Side_Panel SHALL collect the current values from all Param_Form input fields and send them to the Runtime as part of the run message
2. WHEN the Runtime receives an Automation run request with parameter values, THE Runtime SHALL resolve all `{{paramName}}` template placeholders in step values using the provided parameter values, following the same resolution logic used for Task parameters
3. IF a required param field is empty when the user clicks Run, THEN THE Side_Panel SHALL prevent execution and display a validation message indicating the empty field
4. WHEN a param has type `"number"`, THE Side_Panel SHALL coerce the input field value to a number before sending the value to the Runtime
5. WHEN a param has type `"date"`, THE Side_Panel SHALL send the date value as an ISO date string (`YYYY-MM-DD`) to the Runtime

### Requirement 7: Automation Validation

**User Story:** As a test author, I want the compiler to validate Automation declarations, so that I receive clear error messages for invalid configurations.

#### Acceptance Criteria

1. IF an Automation declaration is missing the `.as()` call, THEN THE Compiler SHALL emit a warning indicating the Automation requires a label
2. IF an Automation function argument has no parameters (empty params object), THEN THE Compiler SHALL emit a warning indicating that an Automation with no params should be a Test instead
3. IF two Automations in the same Spec share the same label, THEN THE Compiler SHALL emit a warning indicating duplicate Automation names
4. IF an Automation function body contains no recognizable steps, THEN THE Compiler SHALL emit a warning indicating the Automation has no steps

### Requirement 8: Optional Parameters with Defaults

**User Story:** As a test author, I want to declare optional parameters with `?` in the TypeScript type annotation, so that users can skip non-essential fields when running an Automation.

#### Acceptance Criteria

1. WHEN the Automation params type contains a property with `?` (e.g., `environment?: string`), THE Compiler SHALL include `optional: true` in the emitted param metadata for that parameter
2. WHEN the Param_Form renders an optional param, THE Side_Panel SHALL display a placeholder or "(optional)" label indicating the field is not required
3. WHEN the user clicks Run and an optional param field is empty, THE Side_Panel SHALL NOT treat it as a validation error and SHALL proceed with execution
4. WHEN an optional param field is empty at execution time, THE Runtime SHALL resolve the `{{paramName}}` placeholder to an empty string

### Requirement 9: Enum/Select Parameters

**User Story:** As a test author, I want to declare parameters as string union literals, so that users can choose from a predefined set of values in a dropdown instead of typing free text.

#### Acceptance Criteria

1. WHEN the Automation params type contains a property annotated with a string union literal (e.g., `role: 'admin' | 'user' | 'viewer'`), THE Compiler SHALL detect the union literal type using the TypeScript compiler API
2. WHEN a string union literal is detected, THE Compiler SHALL emit `"enum"` as the param type and include an `options` array containing each literal string value in declaration order
3. WHEN the Param_Form renders an enum param, THE Side_Panel SHALL render a `<select>` dropdown with one `<option>` element for each value in the `options` array
4. THE Side_Panel SHALL constrain the enum param value to one of the declared options — no free-text input is allowed for enum params

### Requirement 10: Persist Last-Used Parameter Values

**User Story:** As a user, I want the side panel to remember the last values I used for an Automation, so that I don't have to re-type them every time I run the same Automation.

#### Acceptance Criteria

1. WHEN an Automation run completes successfully, THE Side_Panel SHALL persist the param values used for that run in extension storage, keyed by the Automation name
2. WHEN an Automation is selected in the Test_Plan_View, THE Side_Panel SHALL retrieve previously stored param values from extension storage and pre-fill the Param_Form inputs
3. IF no previously stored values exist for the selected Automation, THEN THE Param_Form SHALL render with empty fields (or placeholder/default values for optional params)
4. THE Side_Panel SHALL store param values using `chrome.storage.local` (or equivalent browser extension storage API) scoped per Automation name

### Requirement 11: Automation File Type and Directory Convention

**User Story:** As a test author, I want to write Automations in dedicated `*.automation.ts` files in a configured directory, so that they are clearly separated from POM and test files and can be managed independently.

#### Acceptance Criteria

1. THE Compiler's `detectFileType` function SHALL recognize files ending in `.automation.ts` as file type `"automation"`
2. THE `tomation.config.ts` SHALL accept an optional `automations` path (e.g., `automations: './automations'`) alongside the existing `pom` and `tests` paths
3. THE Compiler's resolver SHALL scan `*.automation.ts` files from the configured automations directory when resolving the project
4. Automations SHALL NOT require `export default` — the Compiler SHALL extract Automation declarations by AST pattern matching (consistent with how Tests are extracted from `.test.ts` files)
5. THE Compiler SHALL namespace Automation names using the file path, consistent with how Tests are namespaced (e.g., `automations/user-creation.automation.ts` → namespace prefix `UserCreation`, producing names like `UserCreation__Create Users`)
6. Automation files SHALL be able to import and invoke Tasks from POM files using the `~/` path alias (e.g., `import Login from '~/pom/login.pom'`), and the step extraction SHALL resolve cross-file Task references using the existing namespace resolution mechanism
