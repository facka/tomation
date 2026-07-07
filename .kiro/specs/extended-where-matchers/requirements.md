# Requirements Document

## Introduction

This feature extends Tomation's DSL with 8 new `where` matchers for element selection. The new matchers improve developer experience when locating elements on the page by targeting common HTML attributes and DOM properties that the current matcher set does not cover. Each matcher requires implementation across three layers: DSL package (runtime stub + TypeScript type), compiler (AST detection), and runtime (DOM matching logic in `matchesWhere()`).

## Glossary

- **DSL_Package**: The `packages/dsl/` module that exports matcher factory functions and TypeScript type definitions consumed by test authors.
- **Compiler**: The `packages/compiler/src/parser.js` module that parses DSL source files via AST walking and emits element descriptors including `where` objects.
- **Runtime**: The `packages/extension/src/runtime.js` content script that executes element lookups against the DOM using the `matchesWhere()` function.
- **Matcher_Factory**: A DSL function that accepts arguments and returns a where-descriptor object (e.g., `innerTextIs('Login')` returns `{ textIs: 'Login' }`).
- **WhereDescriptor**: The TypeScript interface in `index.d.ts` that defines the shape of where objects passed to the runtime.
- **WhereMatcher**: The TypeScript union type representing all possible matcher factory return types.

## Requirements

### Requirement 1: valueIs Matcher

**User Story:** As a test author, I want to match elements by their `value` property, so that I can target pre-filled inputs and dropdowns with a selected option.

#### Acceptance Criteria

1. WHEN `valueIs(val)` is called in the DSL, THE DSL_Package SHALL return an object `{ value: val }` where `val` is the string argument.
2. WHEN the Compiler encounters a `valueIs(val)` call inside a `.where()` chain, THE Compiler SHALL emit `{ value: val }` into the element descriptor's `where` object.
3. WHEN the Runtime evaluates a where object containing a `value` key, THE Runtime SHALL match elements whose DOM `.value` property is case-sensitively equal to the specified string (matching the current property value, not the HTML attribute).
4. THE DSL_Package SHALL export a TypeScript declaration `valueIs(val: string): { value: string }` and include `value?: string` in the `WhereDescriptor` interface and `{ value: string }` as a member of the `WhereMatcher` union type.
5. IF an element under evaluation does not have a `value` property (i.e., the property is `undefined`), THEN THE Runtime SHALL treat the element as non-matching for the `value` where condition.

### Requirement 2: dataAttr Matcher

**User Story:** As a test author, I want to match elements by their `data-*` attributes, so that I can use `data-testid`, `data-cy`, `data-qa`, and other custom data attributes as selectors.

#### Acceptance Criteria

1. WHEN `dataAttr(name, val)` is called in the DSL, THE DSL_Package SHALL return an object `{ dataAttr: { name: name, value: val } }` where `name` is the data attribute suffix (without the `data-` prefix) and `val` is the expected attribute value.
2. WHEN the Compiler encounters a `dataAttr(name, val)` call inside a `.where()` chain, THE Compiler SHALL extract both string literal arguments and emit `{ dataAttr: { name: name, value: val } }` into the element descriptor's `where` object.
3. WHEN the Runtime evaluates a where object containing a `dataAttr` key, THE Runtime SHALL match only elements whose `data-{name}` attribute value is exactly equal to `val` (using `el.getAttribute('data-' + name) === val`), and SHALL not match elements where the attribute is absent or has a different value.
4. THE DSL_Package SHALL export a TypeScript declaration `dataAttr(name: string, val: string): { dataAttr: { name: string; value: string } }`.
5. IF the Compiler encounters a `dataAttr` call with fewer than 2 arguments, or with any argument that is not a string literal, THEN THE Compiler SHALL emit a warning indicating that both `name` and `val` must be provided as string literals.
6. IF `dataAttr` is called with a `name` argument that starts with the prefix `data-`, THEN THE Compiler SHALL emit a warning indicating that the `name` argument should be the suffix only (e.g., `testid` not `data-testid`).

### Requirement 3: ariaLabel Matcher

**User Story:** As a test author, I want to match elements by their `aria-label` attribute, so that I can target icon buttons and other elements identified by accessibility labels.

#### Acceptance Criteria

1. WHEN `ariaLabel(val)` is called in the DSL, THE DSL_Package SHALL return an object `{ ariaLabel: val }` where `val` is the string argument.
2. WHEN the Compiler encounters an `ariaLabel(val)` call inside a `.where()` chain, THE Compiler SHALL emit `{ ariaLabel: val }` into the element descriptor's `where` object.
3. WHEN the Runtime evaluates a where object containing an `ariaLabel` key, THE Runtime SHALL match only elements whose `aria-label` attribute value is exactly equal (case-sensitive) to the specified string.
4. THE DSL_Package SHALL export a TypeScript declaration `ariaLabel(val: string): { ariaLabel: string }`.
5. IF an element does not have an `aria-label` attribute, THEN THE Runtime SHALL not match that element against an `ariaLabel` where condition.

### Requirement 4: roleIs Matcher

**User Story:** As a test author, I want to match elements by their `role` attribute, so that I can target semantic UI elements like dialogs, alerts, and tabs.

#### Acceptance Criteria

1. WHEN `roleIs(val)` is called in the DSL, THE DSL_Package SHALL return an object `{ role: val }` where `val` is the string argument.
2. WHEN the Compiler encounters a `roleIs(val)` call inside a `.where()` chain, THE Compiler SHALL emit `{ role: val }` into the element descriptor's `where` object.
3. WHEN the Runtime evaluates a where object containing a `role` key, THE Runtime SHALL match elements whose explicit `role` attribute (via `el.getAttribute('role')`) is case-sensitively equal to the specified string. Implicit ARIA roles derived from the element's tag are not considered.
4. THE DSL_Package SHALL export a TypeScript declaration `roleIs(val: string): { role: string }`.

### Requirement 5: titleIs Matcher

**User Story:** As a test author, I want to match elements by their `title` attribute, so that I can target elements with tooltip text or links identified by title.

#### Acceptance Criteria

1. WHEN `titleIs(val)` is called in the DSL, THE DSL_Package SHALL return an object `{ title: val }` where `val` is the string argument.
2. WHEN the Compiler encounters a `titleIs(val)` call inside a `.where()` chain, THE Compiler SHALL emit `{ title: val }` into the element descriptor's `where` object.
3. WHEN the Runtime evaluates a where object containing a `title` key, THE Runtime SHALL match elements whose `title` attribute, obtained via `el.getAttribute('title')`, is exactly equal (case-sensitive) to the specified string.
4. THE DSL_Package SHALL export a TypeScript declaration `titleIs(val: string): { title: string }`.
5. WHEN the Compiler encounters a `titleIs` call where the argument is not a string literal, THE Compiler SHALL produce an empty where object for that matcher (consistent with other single-argument matcher factories).

### Requirement 6: hrefContains Matcher

**User Story:** As a test author, I want to match elements by a substring of their `href` attribute, so that I can target links without stable IDs by matching a URL fragment.

#### Acceptance Criteria

1. WHEN `hrefContains(val)` is called in the DSL, THE DSL_Package SHALL return an object `{ hrefContains: val }` where `val` is the string argument.
2. WHEN the Compiler encounters an `hrefContains(val)` call inside a `.where()` chain, THE Compiler SHALL emit `{ hrefContains: val }` into the element descriptor's `where` object.
3. WHEN the Runtime evaluates a where object containing an `hrefContains` key, THE Runtime SHALL match elements whose `href` attribute value contains the specified substring using case-sensitive comparison, and SHALL not match elements that do not have an `href` attribute.
4. THE DSL_Package SHALL export a TypeScript declaration `hrefContains(val: string): { hrefContains: string }`.
5. IF the Runtime evaluates a where object containing an `hrefContains` key with an empty string value, THEN THE Runtime SHALL match any element that has an `href` attribute present regardless of its value.

### Requirement 7: isDisabled Matcher

**User Story:** As a test author, I want to match elements by their disabled state, so that I can target a specific disabled button among sibling elements.

#### Acceptance Criteria

1. WHEN `isDisabled()` is called in the DSL, THE DSL_Package SHALL return an object `{ isDisabled: true }`.
2. WHEN the Compiler encounters an `isDisabled()` call (zero arguments) inside a `.where()` chain, THE Compiler SHALL emit `{ isDisabled: true }` into the element descriptor's `where` object.
3. WHEN the Runtime evaluates a where object containing an `isDisabled` key with value `true`, THE Runtime SHALL match elements whose `disabled` DOM property strictly equals `true`.
4. THE DSL_Package SHALL export a TypeScript declaration `isDisabled(): { isDisabled: true }`.
5. WHEN the Compiler encounters an `isDisabled` call with one or more arguments inside a `.where()` chain, THE Compiler SHALL emit a warning indicating that `isDisabled` accepts zero arguments.

### Requirement 8: nthChild Matcher

**User Story:** As a test author, I want to match elements by their `:nth-child` position, so that I can target items in lists or tables where elements are identical except for order.

#### Acceptance Criteria

1. WHEN `nthChild(n)` is called in the DSL, THE DSL_Package SHALL return an object `{ nthChild: n }` where `n` is a positive integer (≥ 1).
2. WHEN the Compiler encounters an `nthChild(n)` call inside a `.where()` chain, THE Compiler SHALL extract the numeric literal argument and emit `{ nthChild: n }` into the element descriptor's `where` object.
3. WHEN the Runtime evaluates a where object containing an `nthChild` key, THE Runtime SHALL match elements that are the n-th child of their parent (1-based index, counting all sibling elements regardless of tag type, consistent with the CSS `:nth-child()` pseudo-class).
4. THE DSL_Package SHALL export a TypeScript declaration `nthChild(n: number): { nthChild: number }`.
5. WHEN the Compiler encounters an `nthChild` call whose argument is not a numeric literal, or whose value is not a positive integer, THE Compiler SHALL emit a warning indicating that a positive integer argument is required.

### Requirement 9: WhereDescriptor and WhereMatcher Type Updates

**User Story:** As a test author, I want the TypeScript types to reflect all new matchers, so that I get accurate autocompletion and type checking in my IDE.

#### Acceptance Criteria

1. THE DSL_Package SHALL include `value`, `ariaLabel`, `role`, `title`, `hrefContains` as optional string fields in the WhereDescriptor interface.
2. THE DSL_Package SHALL include `dataAttr` as an optional field of type `{ name: string; value: string }` in the WhereDescriptor interface.
3. THE DSL_Package SHALL include `isDisabled` as an optional boolean field in the WhereDescriptor interface.
4. THE DSL_Package SHALL include `nthChild` as an optional number field in the WhereDescriptor interface.
5. THE DSL_Package SHALL include `closestLabel` as an optional field of type `{ tag: string; text: string }` in the WhereDescriptor interface.
6. THE DSL_Package SHALL include all 9 new matcher return types in the WhereMatcher union type: `{ value: string }`, `{ dataAttr: { name: string; value: string } }`, `{ ariaLabel: string }`, `{ role: string }`, `{ title: string }`, `{ hrefContains: string }`, `{ isDisabled: true }`, `{ nthChild: number }`, `{ closestLabel: { tag: string; text: string } }`.
7. THE existing WhereMatcher members (`{ textIs: string }`, `{ textContains: string }`, `{ classIncludes: string }`, `{ placeholder: string }`, `{ name: string }`, `{ type: string }`, `{ id: string }`) SHALL remain unchanged.

### Requirement 10: closestLabelIs Matcher

**User Story:** As a test author, I want to match form inputs by the text content of their closest associated label element, so that I can target inputs naturally by their visible label without knowing the exact DOM structure.

#### Acceptance Criteria

1. WHEN `closestLabelIs(tag, text)` is called in the DSL, THE DSL_Package SHALL return an object `{ closestLabel: { tag: tag, text: text } }` where `tag` is the HTML tag name string (e.g., `'LABEL'`, `'SPAN'`, `'DIV'`) and `text` is the expected label text.
2. WHEN the Compiler encounters a `closestLabelIs(tag, text)` call inside a `.where()` chain, THE Compiler SHALL extract both string literal arguments and emit `{ closestLabel: { tag: tag, text: text } }` into the element descriptor's `where` object.
3. WHEN the Runtime evaluates a where object containing a `closestLabel` key and the element descriptor also has a `childOf` parent, THE Runtime SHALL restrict the label search to within the parent element's subtree only. The search SHALL look for a matching-tag element whose trimmed `textContent` equals the specified text anywhere within that subtree.
4. WHEN the Runtime evaluates a where object containing a `closestLabel` key and the element descriptor does NOT have a `childOf` parent, THE Runtime SHALL search using the following strategies with a maximum ancestor depth of 3 levels:
   - Strategy 1 (explicit `for`): Find a matching-tag element anywhere in the document with a `for` attribute equal to the target element's `id`, whose trimmed `textContent` equals the specified text.
   - Strategy 2 (sibling/nearby): Walk up from the target element at most 3 ancestor levels and within each ancestor, search for a matching-tag descendant whose trimmed `textContent` equals the specified text.
   - Strategy 3 (`aria-labelledby`): If the target element has an `aria-labelledby` attribute, resolve the referenced element and check if it matches the specified tag and its trimmed `textContent` equals the specified text.
5. THE DSL_Package SHALL export a TypeScript declaration `closestLabelIs(tag: string, text: string): { closestLabel: { tag: string; text: string } }`.
6. IF the Compiler encounters a `closestLabelIs` call with fewer than 2 arguments, or with any argument that is not a string literal, THEN THE Compiler SHALL emit a warning indicating that both `tag` and `text` must be provided as string literals.
7. IF none of the search strategies produce a match, THEN THE Runtime SHALL treat the element as non-matching for the `closestLabel` where condition.
8. THE DSL_Package SHALL include `closestLabel` as an optional field of type `{ tag: string; text: string }` in the WhereDescriptor interface and `{ closestLabel: { tag: string; text: string } }` as a member of the WhereMatcher union type.
9. THE tag comparison in the Runtime SHALL be case-insensitive (e.g., `'LABEL'` matches `<label>`, `'Span'` matches `<span>`).

### Requirement 11: Compiler Support for Multi-Argument and Special-Shape Matchers

**User Story:** As a developer maintaining the compiler, I want the `extractMatcherCall` function to handle matchers with non-standard signatures, so that `dataAttr` (2 args), `closestLabelIs` (2 args), `isDisabled` (0 args), and `nthChild` (numeric arg) are correctly parsed.

#### Acceptance Criteria

1. WHEN the Compiler encounters a `dataAttr` matcher factory call with 2 string arguments inside a `.where()` chain, THE Compiler SHALL extract both arguments and produce the descriptor `{ dataAttr: { name: <first_arg>, value: <second_arg> } }`.
2. WHEN the Compiler encounters a `dataAttr` call with fewer than 2 string arguments inside a `.where()` chain, THE Compiler SHALL emit a warning indicating that both `name` and `val` string arguments are required, and SHALL produce an empty object as the descriptor.
3. WHEN the Compiler encounters an `isDisabled()` matcher factory call with 0 arguments inside a `.where()` chain, THE Compiler SHALL produce the descriptor `{ isDisabled: true }`.
4. WHEN the Compiler encounters an `nthChild` matcher factory call with a numeric literal argument inside a `.where()` chain, THE Compiler SHALL extract the numeric value and produce the descriptor `{ nthChild: <numeric_value> }`.
5. WHEN the Compiler encounters an `nthChild` call whose argument is not a numeric literal inside a `.where()` chain, THE Compiler SHALL emit a warning indicating that a numeric argument is required, and SHALL produce an empty object as the descriptor.
6. WHEN the Compiler encounters a `closestLabelIs` matcher factory call with 2 string arguments inside a `.where()` chain, THE Compiler SHALL extract both arguments and produce the descriptor `{ closestLabel: { tag: <first_arg>, text: <second_arg> } }`.
7. WHEN the Compiler encounters an unrecognized matcher factory name inside a `.where()` chain, THE Compiler SHALL produce an empty object as the descriptor.
