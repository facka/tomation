# Requirements Document

## Introduction

DSL v2 replaces the existing Tomation DSL with a TypeScript-first authoring experience. It introduces a tag-based element builder pattern (`is.TAG.where(...).as('Label')`), XPath element constructors, named Task/Test declarations, conditional `if` steps, param destructuring, `~/` path aliases, and TypeScript type stripping. The compiler pipeline is extended to handle `.ts` files while producing the same `spec.json` output format consumed by the browser extension. The v1 `Page()` syntax is removed entirely with no backward compatibility.

## Glossary

- **Compiler**: The `@tomation/compiler` package that transforms source POM and test files into a `spec.json` output
- **DSL_Package**: The `@tomation/dsl` package providing runtime stubs, TypeScript types, and the `is` global for authoring
- **Parser**: The acorn-based AST extraction module within the Compiler that recognizes v2 patterns
- **TypeScript_Stripper**: The module that strips TypeScript type annotations from source files producing plain JavaScript
- **Resolver**: The module that discovers source files, resolves imports and path aliases, and produces a topologically sorted file list
- **POM_Extractor**: The module that transforms parsed elements and tasks into the namespaced spec format
- **Flattener**: The background extension module that expands task steps including conditional `if` step evaluation at runtime
- **Runtime**: The browser extension content script that executes steps against the page DOM
- **Namespace**: A PascalCase identifier derived from a kebab-case file name, used to prefix element and task keys
- **ElementDef**: The internal representation of a declared UI element extracted by the Parser
- **Spec_JSON**: The compiled output file consumed by the extension runtime
- **Element_Builder**: The `is.TAG.where(...).as(...)` chain used to declare UI elements

## Requirements

### Requirement 1: TypeScript File Support

**User Story:** As a test author, I want to write POM and test files in TypeScript, so that I get editor autocomplete, type safety, and a modern development experience.

#### Acceptance Criteria

1. WHEN a `.ts` or `.tsx` source file is provided, THE TypeScript_Stripper SHALL strip all type annotations and produce syntactically valid JavaScript with preserved line numbers
2. WHEN the Resolver discovers source files, THE Resolver SHALL include files with `.ts`, `.tsx`, `.pom.ts`, and `.test.ts` extensions in addition to `.js`
3. WHEN a TypeScript source file contains syntax errors preventing transpilation, THE Compiler SHALL report an error with the file path and line number from TypeScript diagnostics
4. THE TypeScript_Stripper SHALL use `ts.transpileModule` with `isolatedModules` mode for fast per-file stripping without type-checking
5. WHEN stripping types from a source file, THE TypeScript_Stripper SHALL preserve the same line count in the output as in the input

### Requirement 2: Element Builder Pattern

**User Story:** As a test author, I want to declare UI elements using `is.TAG.where(...).as('Label')`, so that element definitions are concise, readable, and type-safe.

#### Acceptance Criteria

1. WHEN the Parser encounters a `const X = is.TAG.where(matcher).as('Label')` expression, THE Parser SHALL extract an ElementDef with the tag name in lowercase, the label string, and the where matcher
2. WHEN a `.where()` call is provided, THE Parser SHALL accept exactly one matcher factory argument (innerTextIs, classIncludes, placeholderIs, nameIs, typeIs, idIs, innerTextContains)
3. WHEN an element builder chain contains more than one `.where()` call, THE Parser SHALL emit an error with the file path and line number and skip that element
4. WHEN `.as()` is called without an argument or with a non-string value, THE Parser SHALL emit an error: "Element at <file>:<line> missing label in .as()"
5. THE DSL_Package SHALL export the `is` proxy object that provides an ElementBuilder for every uppercase HTML tag name

### Requirement 3: XPath Element Constructors

**User Story:** As a test author, I want to locate elements by XPath expression, so that I can target elements that are difficult to identify by tag and attribute matchers alone.

#### Acceptance Criteria

1. WHEN the Parser encounters `const X = Element(xpath).as('Label')`, THE Parser SHALL extract an ElementDef with tag `'*'`, the label string, an empty where object, and the xpath string
2. WHEN the Parser encounters `const X = is.ELEMENT(xpath).as('Label')`, THE Parser SHALL extract an ElementDef identical to the `Element()` form for the same xpath and label
3. WHEN `Element()` or `is.ELEMENT()` is called without an argument or with a non-string argument, THE Parser SHALL emit an error: "XPath element at <file>:<line> requires a string argument"
4. WHEN an XPath element is used without a subsequent `.as('label')` call, THE Parser SHALL emit an error: "XPath element at <file>:<line> missing label — call .as('Label') to name it"
5. WHEN an element has an `xpath` field in the spec.json, THE Runtime SHALL use `document.evaluate()` with `XPathResult.FIRST_ORDERED_NODE_TYPE` to locate the element, bypassing the normal tag+where polling logic
6. WHILE polling for an XPath element, THE Runtime SHALL continue polling with `requestAnimationFrame` until the node is found or the 5-second timeout expires

### Requirement 4: Scoped Element Search with childOf

**User Story:** As a test author, I want to scope element searches to a parent element using `.childOf(parent)`, so that I can disambiguate elements that appear in multiple DOM subtrees.

#### Acceptance Criteria

1. WHEN the Parser encounters `.childOf(parentRef)` in an element builder chain, THE Parser SHALL record the parent element's variable name in the ElementDef
2. WHEN the POM_Extractor processes an element with a `childOf` reference, THE POM_Extractor SHALL resolve the variable name to a valid namespaced key in the same spec's pageElements
3. THE Spec_JSON SHALL include the `childOf` field as a namespaced key string referencing the parent element

### Requirement 5: Task Declarations

**User Story:** As a test author, I want to declare reusable tasks using `Task('name', fn)`, so that I can compose multi-step workflows with named parameters.

#### Acceptance Criteria

1. WHEN the Parser encounters a `Task('name', fn)` call, THE Parser SHALL extract the task name and the function's parameter list
2. WHEN a task function uses parameter destructuring (`const { x, y } = params`), THE Parser SHALL track the destructured param names for use in conditional step resolution
3. WHEN the Parser extracts steps from a task body, THE Parser SHALL produce one step per recognized action call in source order
4. THE Compiler SHALL map task invocations via `PageName.taskName(params)` to `{ action: "task", name: "Namespace__taskName", params: {...} }` in the Spec_JSON

### Requirement 6: Test Declarations

**User Story:** As a test author, I want to declare tests using `Test('name', fn)`, so that I can organize test scenarios as named functions with clear step sequences.

#### Acceptance Criteria

1. WHEN the Parser encounters a `Test('name', fn)` call, THE Parser SHALL extract the test name and the steps from the function body
2. THE Compiler SHALL emit each extracted test as an entry in the `tests` array of Spec_JSON with the name and ordered steps

### Requirement 7: Conditional If Steps

**User Story:** As a test author, I want to use `if (param) { ...steps }` in task bodies, so that I can conditionally execute steps based on parameter values at runtime.

#### Acceptance Criteria

1. WHEN the Parser encounters `if (paramName) { ... }` inside a task body where `paramName` is a tracked destructured param, THE Parser SHALL emit a step with `{ action: "if", condition: { param: "paramName", op: "truthy" }, then: [...] }`
2. WHEN the Parser encounters `if (!paramName) { ... }`, THE Parser SHALL emit a condition with `op: "falsy"`
3. WHEN the Parser encounters `if (paramName === 'value') { ... }`, THE Parser SHALL emit a condition with `op: "equals"` and the string value
4. WHEN the Parser encounters `if (paramName !== 'value') { ... }`, THE Parser SHALL emit a condition with `op: "notEquals"` and the string value
5. WHEN an `if` statement has an `else` block, THE Parser SHALL emit a warning that else blocks are not supported
6. WHEN an `if` statement's condition does not match a supported pattern, THE Parser SHALL emit a warning and skip the if-step without halting compilation
7. WHEN the Flattener evaluates a truthy condition at runtime and the param value is truthy, THE Flattener SHALL splice the `then` steps into the flat step list
8. WHEN the Flattener evaluates a condition at runtime and the param value is falsy, THE Flattener SHALL skip the `then` steps entirely
9. WHEN `then` steps contain nested `if` steps, THE Flattener SHALL evaluate them recursively

### Requirement 8: Namespace Derivation

**User Story:** As a test author, I want namespaces to be derived automatically from file names, so that I don't need to manually specify `Page('Name')` wrappers.

#### Acceptance Criteria

1. THE Compiler SHALL derive a PascalCase namespace from the kebab-case file name by converting each hyphen-separated segment to title case
2. WHEN a file name contains underscores, THE Compiler SHALL halt compilation with an error message suggesting the kebab-case equivalent
3. THE Compiler SHALL strip `.pom.ts`, `.page.ts`, `.pom.js`, `.page.js` suffixes before converting to PascalCase
4. WHEN two POM files produce the same namespace, THE Compiler SHALL halt compilation with an error identifying both files

### Requirement 9: Path Alias Resolution

**User Story:** As a test author, I want to use `~/` import paths, so that I can reference POM files without fragile relative paths.

#### Acceptance Criteria

1. WHEN an import specifier starts with `~/`, THE Resolver SHALL resolve the path relative to the configured `baseUrl` or the config file directory
2. WHEN a `~/` import cannot be resolved to an existing file, THE Resolver SHALL emit an error with the import path and source file location
3. THE Resolver SHALL attempt resolution with extensions `.ts`, `.tsx`, `.js`, `.pom.ts`, `.test.ts`, `index.ts`, and `index.js` in order

### Requirement 10: Config Format

**User Story:** As a test author, I want to configure my project with `tomation.config.ts` including multiple URLs, so that my tests can span multiple application domains.

#### Acceptance Criteria

1. THE Resolver SHALL support both `tomation.config.ts` and `tomation.config.js` config files
2. WHEN the config file is `.ts`, THE Resolver SHALL strip types using `ts.transpileModule` before evaluating it
3. THE config SHALL accept a `meta.urls` field as an array of URL strings
4. WHEN the Runtime checks the current page hostname, THE Runtime SHALL match against all URLs in the `meta.urls` array — no warning is shown if any URL matches

### Requirement 11: Unrecognized Statement Handling

**User Story:** As a test author, I want the compiler to warn me about unrecognized statements in task/test bodies, so that I can catch typos and unsupported patterns without compilation failure.

#### Acceptance Criteria

1. WHEN a statement inside a Task or Test body is not a recognized action call, a supported if-condition, or a `const { x } = params` destructuring, THE Parser SHALL emit a warning with the file path, line number, and source snippet
2. WHEN an unrecognized statement is encountered, THE Parser SHALL skip the statement without producing a step and continue parsing
3. WHEN unrecognized statements are encountered, THE Compiler SHALL still complete successfully with exit code 0
4. WHEN a top-level statement outside Task/Test bodies is not a recognized pattern, THE Parser SHALL silently ignore it without emitting a warning

### Requirement 12: Extension Runtime XPath Support

**User Story:** As a test executor, I want the runtime to locate elements by XPath, so that XPath-based element declarations work during test execution.

#### Acceptance Criteria

1. WHEN a page element descriptor contains an `xpath` field, THE Runtime SHALL use `document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue` to locate the element
2. WHEN an XPath element descriptor is used, THE Runtime SHALL bypass the normal tag+where polling logic entirely
3. WHILE polling for an XPath element, THE Runtime SHALL poll with `requestAnimationFrame` until the node is found or the 5-second timeout expires
4. IF the 5-second timeout expires without finding an XPath node, THEN THE Runtime SHALL fail the step with the standard "element not found" error

### Requirement 13: Background Flattener Conditional Step Evaluation

**User Story:** As a test executor, I want conditional steps to be evaluated at runtime based on resolved parameter values, so that tasks dynamically include or exclude steps.

#### Acceptance Criteria

1. WHEN the Flattener encounters an `"if"` step during step expansion, THE Flattener SHALL evaluate the condition against the resolved params object
2. WHEN the condition `op` is `"truthy"`, THE Flattener SHALL evaluate `!!params[condition.param]`
3. WHEN the condition `op` is `"falsy"`, THE Flattener SHALL evaluate `!params[condition.param]`
4. WHEN the condition `op` is `"equals"`, THE Flattener SHALL evaluate `params[condition.param] === condition.value`
5. WHEN the condition `op` is `"notEquals"`, THE Flattener SHALL evaluate `params[condition.param] !== condition.value`
6. WHEN an `if` condition evaluates to true, THE Flattener SHALL splice the `then` steps into the flat step list with normal template resolution applied
7. WHEN an `if` condition evaluates to false, THE Flattener SHALL exclude the `then` steps from the execution sequence entirely

### Requirement 14: V1 Syntax Removal

**User Story:** As a project maintainer, I want the v1 `Page()` syntax removed entirely, so that the codebase has a single consistent authoring approach.

#### Acceptance Criteria

1. THE Compiler SHALL not recognize or process `Page('Name')` wrapper syntax
2. WHEN the Parser encounters a `Page()` call, THE Parser SHALL treat it as an unrecognized statement and emit a warning

### Requirement 15: Action Mapping

**User Story:** As a test author, I want v2 action calls (Click, Type, Select, etc.) to compile into the correct spec.json step format, so that the runtime can execute them.

#### Acceptance Criteria

1. WHEN the Parser encounters `Click(element)`, THE Parser SHALL emit `{ action: "click", target: "<namespaced_key>" }`
2. WHEN the Parser encounters `Type(value).in(element)`, THE Parser SHALL emit `{ action: "type", target: "<namespaced_key>", value: "..." }`
3. WHEN the Parser encounters `TypePassword(value).in(element)`, THE Parser SHALL emit `{ action: "typePassword", target: "<namespaced_key>", value: "..." }`
4. WHEN the Parser encounters `Select(value).in(element)`, THE Parser SHALL emit `{ action: "select", target: "<namespaced_key>", value: "..." }`
5. WHEN the Parser encounters `AssertExists(element)`, THE Parser SHALL emit `{ action: "assertExists", target: "<namespaced_key>" }`
6. WHEN the Parser encounters `AssertNotExists(element)`, THE Parser SHALL emit `{ action: "assertNotExists", target: "<namespaced_key>" }`
7. WHEN the Parser encounters `AssertHasText(element, text)`, THE Parser SHALL emit `{ action: "assertHasText", target: "<namespaced_key>", value: "..." }`
8. WHEN the Parser encounters `Navigate(url)`, THE Parser SHALL emit `{ action: "navigate", url: "..." }`
9. WHEN the Parser encounters `Wait(ms)`, THE Parser SHALL emit `{ action: "wait", ms: N }`
10. WHEN the Parser encounters `WaitFor(element)`, THE Parser SHALL emit `{ action: "waitFor", target: "<namespaced_key>", gone: false }`
11. WHEN the Parser encounters `WaitForGone(element)`, THE Parser SHALL emit `{ action: "waitFor", target: "<namespaced_key>", gone: true }`
12. WHEN the Parser encounters `Manual(description)`, THE Parser SHALL emit `{ action: "manual", description: "..." }`
