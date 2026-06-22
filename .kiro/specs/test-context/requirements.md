# Requirements Document

## Introduction

The Test Context feature adds a per-test-run key-value store to Tomation. Steps within a test can save dynamic values extracted from the DOM (text content, attributes, input values) into the context store, and subsequent steps can reference those saved values via `{{ctx.keyName}}` template syntax. This enables multi-step flows where later steps depend on dynamic output from earlier steps (e.g., generated IDs, confirmation codes, timestamps).

## Glossary

- **Context_Store**: A string-keyed, string-valued map that persists for the duration of a single test run and resets between tests
- **Context_Key**: A named entry in the Context_Store, referenced via `{{ctx.keyName}}` syntax
- **Template_Resolution**: The process of replacing `{{ctx.keyName}}` tokens in step values with the corresponding Context_Store entry
- **Save_Action**: A DSL action (SaveText, SaveAttribute, SaveValue) that extracts a value from the DOM and stores it in the Context_Store
- **DSL_Package**: The `packages/dsl/` module that provides action stubs and type definitions
- **Compiler**: The `packages/compiler/` module that parses DSL source files into step objects
- **Background_Flattener**: The step-expansion logic in `packages/extension/src/background.js` that resolves templates and expands task steps
- **Runtime**: The `packages/extension/src/runtime.js` module that executes individual steps against the DOM

## Requirements

### Requirement 1: Save Element Text to Context

**User Story:** As a test author, I want to save the text content of a DOM element into the context store, so that I can reference dynamic text values in later steps.

#### Acceptance Criteria

1. WHEN a SaveText action is executed with a target element and a context key name, THE Runtime SHALL extract the `textContent` of the target element and store the trimmed string value in the Context_Store under the specified key
2. WHEN a SaveText action targets an element that does not exist on the page, THE Runtime SHALL fail the step with an error message identifying the missing element
3. THE DSL_Package SHALL export a `SaveText` function that accepts an ElementDescriptor and returns a builder with an `.as(keyName)` method that produces a save-text step object

### Requirement 2: Save Element Attribute to Context

**User Story:** As a test author, I want to save a specific attribute value of a DOM element into the context store, so that I can use dynamic attribute values (e.g., href, data-id) in later steps.

#### Acceptance Criteria

1. WHEN a SaveAttribute action is executed with a target element, an attribute name, and a context key name, THE Runtime SHALL read the specified attribute from the target element and store the string value in the Context_Store under the specified key
2. WHEN a SaveAttribute action targets an element that does not exist on the page, THE Runtime SHALL fail the step with an error message identifying the missing element
3. WHEN a SaveAttribute action specifies an attribute that does not exist on the target element, THE Runtime SHALL fail the step with an error message identifying the missing attribute
4. THE DSL_Package SHALL export a `SaveAttribute` function that accepts an ElementDescriptor and an attribute name string, and returns a builder with an `.as(keyName)` method that produces a save-attribute step object

### Requirement 3: Save Input Value to Context

**User Story:** As a test author, I want to save the current value of an input element into the context store, so that I can reference entered or pre-filled form values in later steps.

#### Acceptance Criteria

1. WHEN a SaveValue action is executed with a target input element and a context key name, THE Runtime SHALL read the `value` property of the target element and store the string in the Context_Store under the specified key
2. WHEN a SaveValue action targets an element that does not exist on the page, THE Runtime SHALL fail the step with an error message identifying the missing element
3. THE DSL_Package SHALL export a `SaveValue` function that accepts an ElementDescriptor and returns a builder with an `.as(keyName)` method that produces a save-value step object

### Requirement 4: Context Template Resolution

**User Story:** As a test author, I want to use `{{ctx.keyName}}` syntax in step parameters and assertion values, so that I can reference previously saved dynamic values without hardcoding them.

#### Acceptance Criteria

1. WHEN a step value or parameter contains a `{{ctx.keyName}}` token, THE Background_Flattener SHALL replace the token with the corresponding value from the Context_Store
2. WHEN a step value contains a `{{ctx.keyName}}` token and the specified key does not exist in the Context_Store, THE Background_Flattener SHALL fail the step with an error message stating that the context key has not been saved yet
3. WHEN a step value contains multiple `{{ctx.*}}` tokens, THE Background_Flattener SHALL resolve all tokens independently within the same string
4. WHEN a step value contains both `{{ctx.keyName}}` tokens and regular `{{paramName}}` tokens, THE Background_Flattener SHALL resolve context tokens from the Context_Store and parameter tokens from the task parameter map

### Requirement 5: Context Lifecycle Management

**User Story:** As a test author, I want the context store to be scoped to a single test run, so that tests remain independent and dynamic values do not leak between test executions.

#### Acceptance Criteria

1. WHEN a test run begins, THE Background_Flattener SHALL initialize an empty Context_Store for that test run
2. WHILE a test run is executing, THE Context_Store SHALL retain all saved values across task boundaries within the same test
3. WHEN a test run completes (success or failure), THE Background_Flattener SHALL discard the Context_Store associated with that test run
4. THE Context_Store SHALL store all values as strings

### Requirement 6: Compiler Support for Save Actions

**User Story:** As a test author, I want the compiler to recognize SaveText, SaveAttribute, and SaveValue DSL patterns, so that my test files compile correctly into executable step objects.

#### Acceptance Criteria

1. WHEN the Compiler encounters a `SaveText(element).as(key)` expression, THE Compiler SHALL emit a step object with action `saveText`, the resolved element target, and the context key
2. WHEN the Compiler encounters a `SaveAttribute(element, attrName).as(key)` expression, THE Compiler SHALL emit a step object with action `saveAttribute`, the resolved element target, the attribute name, and the context key
3. WHEN the Compiler encounters a `SaveValue(element).as(key)` expression, THE Compiler SHALL emit a step object with action `saveValue`, the resolved element target, and the context key
4. WHEN a Save action is missing the `.as(key)` chain, THE Compiler SHALL report a parse error indicating that a context key name is required

### Requirement 7: Context Key Overwrite Behavior

**User Story:** As a test author, I want to overwrite a context key with a new value during a test run, so that I can capture updated dynamic values as a flow progresses.

#### Acceptance Criteria

1. WHEN a Save_Action stores a value under a key that already exists in the Context_Store, THE Context_Store SHALL overwrite the previous value with the new value without producing an error
