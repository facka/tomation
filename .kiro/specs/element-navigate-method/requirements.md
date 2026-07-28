# Requirements Document

## Introduction

This feature adds a `.navigate(path)` chainable method to the Tomation DSL element builder. It enables users to locate elements that lack unique identifiers by first finding a nearby identifiable element, then traversing the DOM tree relative to it using a comma-separated string of navigation steps. The feature spans the DSL package (method stub), the compiler package (path compilation to JSON), and the extension package (runtime DOM traversal execution).

## Glossary

- **Element_Builder**: The chainable builder object returned by `is.TAG` access in the DSL, supporting `.where()`, `.childOf()`, `.navigate()`, and `.as()` methods
- **Navigate_Path**: A comma-separated string of navigation step tokens that describe a sequential DOM traversal from an initial element
- **Navigation_Step**: A single traversal instruction within a Navigate_Path (e.g., `parent`, `child[3]`, `nextSibling`)
- **Compiler**: The `@tomationjs/compiler` package that transforms TypeScript POM/test files into `.tomation.json` output
- **Extension_Runtime**: The content script in the browser extension that resolves element descriptors and executes test steps against the live DOM
- **Page_Element_Descriptor**: The JSON object representing a page element in the compiled `.tomation.json` output, containing `tag`, `label`, `where`, and optionally `childOf`, `xpath`, or `navigate` fields

## Requirements

### Requirement 1: DSL Navigate Method

**User Story:** As a test author, I want to call `.navigate(path)` on an element builder, so that I can describe how to reach a target element relative to an identifiable anchor element.

#### Acceptance Criteria

1. THE Element_Builder SHALL expose a `.navigate(path)` method that accepts a single string argument
2. WHEN `.navigate(path)` is called, THE Element_Builder SHALL store the Navigate_Path, overwriting any previously stored Navigate_Path, and return the same builder instance for continued chaining
3. THE Element_Builder SHALL support `.navigate()` chained with `.where()`, `.childOf()`, and `.as()` in any order
4. WHEN `.as()` is called on an Element_Builder that has a stored Navigate_Path, THE Element_Builder SHALL include a `navigate` field in the returned descriptor object containing the raw Navigate_Path string
5. WHEN `.as()` is called on an Element_Builder that does not have a stored Navigate_Path, THE Element_Builder SHALL omit the `navigate` field from the returned descriptor object

### Requirement 2: Navigate Path Parsing

**User Story:** As a compiler developer, I want the navigate path string to be parsed into a structured array of navigation steps, so that the runtime can execute them sequentially.

#### Acceptance Criteria

1. WHEN the Compiler encounters an element descriptor containing a Navigate_Path, THE Compiler SHALL split the string on comma characters and parse each segment into an ordered array of Navigation_Step objects preserving the original sequence
2. THE Compiler SHALL recognize the following Navigation_Step tokens using case-sensitive matching: `parent`, `child[n]`, `firstChild`, `lastChild`, `nextSibling`, `prevSibling`, `sibling[n]`
3. WHEN a `child[n]` or `sibling[n]` token is parsed, THE Compiler SHALL extract the index value as a positive integer (minimum 1, maximum 9999)
4. IF a Navigate_Path contains an unrecognized token, THEN THE Compiler SHALL report a validation error that includes the invalid token string and its 1-based position within the path
5. THE Compiler SHALL trim leading and trailing whitespace from each token before parsing
6. THE Compiler SHALL produce a navigate path string round-trip: parsing then serializing a valid Navigate_Path SHALL produce a string identical to the input after trimming whitespace from each token

### Requirement 3: Compiled JSON Output

**User Story:** As a system integrator, I want the compiled `.tomation.json` to include the navigate path for elements that use it, so that the extension runtime can resolve them.

#### Acceptance Criteria

1. WHEN an element descriptor includes a Navigate_Path, THE Compiler SHALL emit a `navigate` field in the corresponding Page_Element_Descriptor in the `.tomation.json` output
2. WHEN the `navigate` field is emitted, THE Compiler SHALL emit it as an ordered array of step objects, where each object contains a `step` string field and optionally an `index` integer field representing the 1-based position from the source Navigate_Path
3. WHEN a Navigation_Step is `parent`, `firstChild`, `lastChild`, `nextSibling`, or `prevSibling`, THE Compiler SHALL emit a step object containing only the `step` field set to the step name (e.g., `{ "step": "parent" }`)
4. WHEN a Navigation_Step is `child[n]`, THE Compiler SHALL emit `{ "step": "child", "index": n }` where n is the 1-based integer extracted from the token
5. WHEN a Navigation_Step is `sibling[n]`, THE Compiler SHALL emit `{ "step": "sibling", "index": n }` where n is the 1-based integer extracted from the token
6. WHEN an element descriptor does not include a Navigate_Path, THE Compiler SHALL omit the `navigate` field entirely from the Page_Element_Descriptor output
7. WHEN a Navigate_Path contains multiple steps, THE Compiler SHALL emit the step objects in the same sequential order as they appear in the source Navigate_Path string

### Requirement 4: Runtime Navigation Execution

**User Story:** As a tester running automation in the browser, I want the extension to traverse the DOM from a resolved anchor element following the navigate path, so that I can interact with elements lacking unique identifiers.

#### Acceptance Criteria

1. WHEN the Extension_Runtime resolves an element descriptor that contains a `navigate` field, THE Extension_Runtime SHALL first locate the anchor element using the standard `tag` and `where` resolution logic with the existing 5-second polling timeout
2. WHEN the anchor element is resolved, THE Extension_Runtime SHALL apply each navigation step as a single synchronous DOM traversal in array order starting from the anchor element, without polling or retrying individual steps
3. WHEN a `parent` step is applied, THE Extension_Runtime SHALL traverse to the element's `.parentElement`
4. WHEN a `child[n]` step is applied, THE Extension_Runtime SHALL traverse to the element's `.children[n-1]` (converting 1-based index to 0-based)
5. WHEN a `firstChild` step is applied, THE Extension_Runtime SHALL traverse to the element's `.firstElementChild`
6. WHEN a `lastChild` step is applied, THE Extension_Runtime SHALL traverse to the element's `.lastElementChild`
7. WHEN a `nextSibling` step is applied, THE Extension_Runtime SHALL traverse to the element's `.nextElementSibling`
8. WHEN a `prevSibling` step is applied, THE Extension_Runtime SHALL traverse to the element's `.previousElementSibling`
9. WHEN a `sibling[n]` step is applied, THE Extension_Runtime SHALL traverse to the current element's `.parentElement`'s `.children[n-1]` (converting 1-based index to 0-based), treating a null `.parentElement` as a navigation failure
10. IF any navigation step results in a null or undefined element, THEN THE Extension_Runtime SHALL report an error that includes the step token that failed and its 1-based position within the navigate path array
11. WHEN all navigation steps complete successfully, THE Extension_Runtime SHALL use the final traversed element as the target for the test action
12. IF the anchor element cannot be found within the 5-second polling timeout, THEN THE Extension_Runtime SHALL report an error indicating that the anchor element was not found, without attempting any navigation steps

### Requirement 5: Navigate Path Validation

**User Story:** As a test author, I want to receive clear error messages when I provide an invalid navigate path, so that I can fix my element definitions quickly.

#### Acceptance Criteria

1. IF the Navigate_Path is an empty string, THEN THE Compiler SHALL report a validation error stating that the navigate path is empty
2. IF a `child[n]` or `sibling[n]` token contains an integer index less than 1, THEN THE Compiler SHALL report a validation error stating that the index must be a positive integer greater than or equal to 1
3. IF a `child[n]` or `sibling[n]` token contains a non-integer value (e.g., a decimal, alphabetic string, or special characters), THEN THE Compiler SHALL report a validation error stating that the index must be an integer
4. IF a Navigate_Path contains only whitespace or empty segments after splitting by comma, THEN THE Compiler SHALL report a validation error stating that the navigate path contains no valid steps
5. IF the Navigate_Path contains a valid token with a missing index bracket (e.g., `child[]` or `sibling[]`), THEN THE Compiler SHALL report a validation error stating that the index is required

### Requirement 6: Navigate with ChildOf Compatibility

**User Story:** As a test author, I want to combine `.navigate()` with `.childOf()` on the same element, so that I can first scope the anchor search within a parent and then navigate from there.

#### Acceptance Criteria

1. WHEN an element descriptor includes both a `childOf` field and a `navigate` field, THE Extension_Runtime SHALL first resolve the parent element, then locate the anchor element within the parent's subtree, then apply the navigation steps from the anchor
2. THE Element_Builder SHALL allow `.childOf()` and `.navigate()` to be called in any order on the same builder without error

### Requirement 7: Documentation Updates

**User Story:** As a user or contributor, I want the README and the playground docs page to document the `.navigate()` method, so that I can learn about it without reading source code.

#### Acceptance Criteria

1. THE project README (`README.md`) SHALL include a section documenting the `.navigate(path)` method under the DSL Reference, including the supported navigation steps and at least two usage examples
2. THE playground docs page (`examples/playground/docs.html`) SHALL include documentation for the `.navigate(path)` method within the Element/Locators Builder API section, including the supported navigation steps table and usage examples
3. THE documentation SHALL list all supported navigation steps (`parent`, `child[n]`, `firstChild`, `lastChild`, `nextSibling`, `prevSibling`, `sibling[n]`) with a brief description of each
4. THE documentation SHALL include at least one example combining `.navigate()` with `.where()` and `.childOf()`
