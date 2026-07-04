# Requirements Document

## Introduction

This feature enables tasks defined in a POM file to invoke other tasks defined in the same file directly, using a simple function-call syntax without cross-file namespace prefixes. The parser recognizes these local task invocations and emits them as standard task steps in the generated JSON output, with the file's namespace prefix applied automatically during the POM extraction phase. This improves developer experience by allowing task composition within a single file using natural function-call syntax with parameter passing.

## Glossary

- **Parser**: The component (`packages/compiler/src/parser.js`) that reads DSL source files and produces an AST-based representation of elements, tasks, and tests.
- **POM_Extractor**: The component (`packages/compiler/src/pom.js`) that transforms parsed file output into namespaced element and task maps.
- **Local_Task_Invocation**: A function-call expression inside a task body that references another task declared in the same file, without a namespace prefix.
- **Namespace_Prefix**: A PascalCase string derived from the file name (e.g., `Login` from `login.pom.ts`) used to qualify task and element names in the generated output.
- **Declared_Task_Names**: The set of variable names bound to `Task(...)` declarations within a single source file.
- **Task_Step**: A JSON object with `action: 'task'` representing a call to another task, optionally including a `params` object.
- **Params_Object**: A JavaScript object expression passed as the single argument to a local task invocation, containing key-value pairs for task parameters.

## Requirements

### Requirement 1: Parse local task invocations with no arguments

**User Story:** As a DSL author, I want to call a locally defined task with no arguments using `taskName()` syntax, so that I can compose tasks without repeating steps.

#### Acceptance Criteria

1. WHEN a task body contains a call expression where the callee is an Identifier matching a name in the Declared_Task_Names set and no arguments are provided, THE Parser SHALL emit a Task_Step with `action: 'task'` and `name` set to the callee identifier.
2. WHEN a task body contains a call expression where the callee is an Identifier that does NOT match any name in the Declared_Task_Names set, THE Parser SHALL skip the statement and emit an "Unrecognized statement" warning.

### Requirement 2: Parse local task invocations with an ObjectExpression shorthand argument

**User Story:** As a DSL author, I want to call a locally defined task with a destructured object like `login({username, password})`, so that I can pass shorthand parameters from the calling task to the called task using ObjectExpression syntax.

#### Acceptance Criteria

1. WHEN a task body contains a call expression where the callee matches a Declared_Task_Names entry and the single argument is an ObjectExpression with shorthand properties referencing defined variables, THE Parser SHALL emit a Task_Step with `action: 'task'`, `name` set to the callee identifier, and `params` containing the variable names as keys with template-reference values `{{variableName}}`.
2. WHEN a task body contains a call expression where the callee matches a Declared_Task_Names entry and the single argument is an Identifier (not an ObjectExpression), THE Parser SHALL skip the statement and emit an "Unrecognized statement" warning.

### Requirement 3: Parse local task invocations with literal object arguments

**User Story:** As a DSL author, I want to call a locally defined task with inline literal values like `login({username: 'admin', password: 'admin'})`, so that I can invoke tasks with hardcoded parameters directly.

#### Acceptance Criteria

1. WHEN a task body contains a call expression where the callee matches a Declared_Task_Names entry and the single argument is an ObjectExpression with properties having Literal string values, THE Parser SHALL emit a Task_Step with `action: 'task'`, `name` set to the callee identifier, and `params` containing the property names as keys with the literal string values.
2. WHEN a task body contains a call expression where the callee matches a Declared_Task_Names entry and the single argument is an ObjectExpression with properties having Literal numeric values, THE Parser SHALL emit a Task_Step with `action: 'task'`, `name` set to the callee identifier, and `params` containing the property names as keys with the numeric values.

### Requirement 4: Namespace resolution for local task invocations

**User Story:** As a DSL author, I want my local task invocations to automatically receive the correct namespace prefix in the generated output, so that the runtime can locate and execute the referenced task.

#### Acceptance Criteria

1. WHEN the POM_Extractor processes a Task_Step whose `name` field does not contain the `__` separator and the name matches a task declared in the same file, THE POM_Extractor SHALL prefix the name with the file's Namespace_Prefix followed by `__`.
2. WHEN the POM_Extractor processes a Task_Step whose `name` field already contains `__`, THE POM_Extractor SHALL leave the name unchanged.

### Requirement 5: Local task invocations in test bodies

**User Story:** As a DSL author, I want to invoke locally defined tasks from within `Test(...)` bodies using the same bare function-call syntax, so that tests can reuse task definitions from the same file.

#### Acceptance Criteria

1. WHEN a test body contains a call expression where the callee is an Identifier matching a name in the Declared_Task_Names set, THE Parser SHALL emit a Task_Step with `action: 'task'` and `name` set to the callee identifier.
2. WHEN a test body contains a call expression where the callee matches a Declared_Task_Names entry and the single argument is an ObjectExpression (shorthand properties or literal key-value pairs), THE Parser SHALL emit a Task_Step with `action: 'task'`, `name` set to the callee identifier, and `params` extracted from the ObjectExpression. Bare Identifier arguments (e.g., `login(params)`) are not supported and SHALL produce an "Unrecognized statement" warning.

### Requirement 6: Declared task names collection

**User Story:** As a compiler maintainer, I want the parser to collect all Task declaration variable names before processing task/test bodies, so that local invocation detection is accurate regardless of declaration order.

#### Acceptance Criteria

1. THE Parser SHALL perform a first pass over all top-level variable declarations in the source file to collect Declared_Task_Names before processing any task or test body statements.
2. WHEN a task is declared after the task that invokes it (forward reference), THE Parser SHALL still recognize the invocation as a valid Local_Task_Invocation.

### Requirement 7: Round-trip property for local task invocation parsing

**User Story:** As a compiler maintainer, I want parsed local task invocations to produce deterministic JSON output, so that the same DSL source always generates the same task steps.

#### Acceptance Criteria

1. FOR ALL valid POM source files containing local task invocations, THE Parser SHALL produce identical Task_Step output when parsing the same source string multiple times (deterministic parsing).
2. FOR ALL Task_Step objects produced from local task invocations, THE POM_Extractor SHALL produce identical namespaced output when processing the same parsed result multiple times (deterministic extraction).
