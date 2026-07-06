# Requirements Document

## Introduction

This feature extends the Tomation DSL with runtime utility functions and template string support. Currently, action values (e.g., `Type('value').in(element)`) only accept string literals and parameter references (`{{paramName}}`). This feature introduces two new value expression types:

1. **Date helper functions** — built-in functions like `today()`, `tomorrow()`, `nextWeek()` that resolve to formatted date strings at test execution time rather than compile time.
2. **Runtime template strings** — template literal expressions (backtick strings) containing computed expressions that are evaluated at runtime, enabling dynamic value construction beyond simple parameter substitution.

Together these provide the flexibility needed for tests that depend on relative dates or dynamically computed values without hardcoding.

## Glossary

- **Compiler**: The Tomation compiler that parses `.pom.ts` and `.test.ts` files and emits JSON test plans.
- **Runtime**: The Tomation extension that executes JSON test plans in the browser.
- **Date_Helper**: A built-in DSL function that returns a formatted date string relative to the current date at execution time. Includes day-offset helpers (e.g., `today()`, `tomorrow()`) and month-boundary helpers (e.g., `firstDateOfMonth(0)`, `lastDateOfMonth(-1)`).
- **Runtime_Template**: A backtick-delimited template string containing expressions marked with `${}` that are evaluated at runtime rather than compile time.
- **Test_Plan**: The compiled JSON output that the Runtime consumes to execute a test.
- **DSL_Value**: Any value expression used as an argument to a DSL action (e.g., the string passed to `Type(...).in(element)`).
- **Date_Format**: The string format used when rendering a Date_Helper result (defaults to ISO date `YYYY-MM-DD`).

## Requirements

### Requirement 1: Date Helper Function Declarations

**User Story:** As a test author, I want to use built-in date functions in my DSL actions, so that my tests can reference relative dates without hardcoding specific date values.

#### Acceptance Criteria

1. THE DSL SHALL provide the following day-offset Date_Helper functions: `today()`, `tomorrow()`, `yesterday()`, `nextWeek()`, `lastWeek()`, `nextMonth()`, `lastMonth()`
2. THE DSL SHALL provide the following month-boundary Date_Helper functions: `firstDateOfMonth(offset)`, `lastDateOfMonth(offset)` where `offset` is a required integer (0 = current month, positive = future months, negative = past months)
3. WHEN a Date_Helper function is used as a DSL_Value argument, THE Compiler SHALL recognize the function call and emit a date helper descriptor in the Test_Plan with `type` set to `"dateHelper"`
4. FOR day-offset helpers, THE Compiler SHALL emit a descriptor with a `kind` field set to `"dayOffset"` and an integer `offset` field: `today()` → offset 0, `tomorrow()` → offset 1, `yesterday()` → offset -1, `nextWeek()` → offset 7, `lastWeek()` → offset -7, `nextMonth()` → offset 30, `lastMonth()` → offset -30
5. FOR month-boundary helpers, THE Compiler SHALL emit a descriptor with a `kind` field set to `"monthBoundary"`, a `boundary` field (`"first"` or `"last"`), and a `monthOffset` integer field matching the provided argument
6. IF an identifier call expression matching a Date_Helper name is encountered but is NOT in a DSL_Value position, THE Compiler SHALL treat it as a regular expression and not emit a date helper descriptor

### Requirement 2: Date Helper Runtime Resolution

**User Story:** As a test author, I want date helpers to resolve to actual date strings when my test runs, so that tests stay valid regardless of when they are executed.

#### Acceptance Criteria

1. WHEN the Runtime encounters a day-offset date helper descriptor (`kind: "dayOffset"`), THE Runtime SHALL add the descriptor's `offset` value (in calendar days) to the date captured at the start of the test step execution and use the resulting date for formatting
2. WHEN the Runtime encounters a month-boundary date helper descriptor (`kind: "monthBoundary"`) with `boundary: "first"`, THE Runtime SHALL compute the first calendar day of the month that is `monthOffset` months from the current month (e.g., offset 0 = 1st of current month, offset -1 = 1st of previous month, offset 1 = 1st of next month)
3. WHEN the Runtime encounters a month-boundary date helper descriptor (`kind: "monthBoundary"`) with `boundary: "last"`, THE Runtime SHALL compute the last calendar day of the month that is `monthOffset` months from the current month (e.g., offset 0 = last day of current month, offset -1 = last day of previous month)
4. THE Runtime SHALL format resolved dates using the ISO date format `YYYY-MM-DD` by default
5. WHEN a date helper descriptor includes a `format` field, THE Runtime SHALL format the resolved date according to the specified Date_Format string using the tokens defined in Requirement 3
6. THE Runtime SHALL substitute the resolved date string into the action value before executing the action
7. IF a date helper descriptor contains a `format` field with an unrecognized token (a token not in the set `YYYY`, `MM`, `DD`, `M`, `D`), THEN THE Runtime SHALL leave the unrecognized token as literal text in the output and log a warning identifying the unrecognized token

### Requirement 3: Date Helper Format Options

**User Story:** As a test author, I want to specify a date format when using date helpers, so that I can match the format expected by the application under test.

#### Acceptance Criteria

1. WHEN a day-offset Date_Helper function is called with a single string argument (e.g., `today('MM/DD/YYYY')`), THE Compiler SHALL include the format string in the emitted descriptor's `format` field
2. WHEN a month-boundary Date_Helper function is called with an integer first argument and an optional string second argument (e.g., `firstDateOfMonth(0, 'MM/DD/YYYY')`), THE Compiler SHALL include the format string in the emitted descriptor's `format` field
3. WHEN a Date_Helper function is called without a format argument, THE Compiler SHALL emit the descriptor without a `format` field, and the Runtime SHALL default to `YYYY-MM-DD`
4. THE Compiler SHALL support the following format tokens: `YYYY` (4-digit year), `MM` (2-digit month, zero-padded), `DD` (2-digit day, zero-padded), `M` (1-or-2-digit month), `D` (1-or-2-digit day). Separator characters (e.g., `/`, `-`, `.`) between tokens SHALL be preserved as literal text
5. IF a day-offset Date_Helper function is called with a non-string argument, THEN THE Compiler SHALL emit a warning with the file path and line number and SHALL NOT include a `format` field in the descriptor
6. IF a month-boundary Date_Helper function is called without the required integer argument, THEN THE Compiler SHALL emit a warning indicating the offset parameter is required
7. IF a month-boundary Date_Helper function is called with a non-integer first argument, THEN THE Compiler SHALL emit a warning with the file path and line number

### Requirement 4: Compiler Parsing of Date Helpers

**User Story:** As a developer, I want the compiler to correctly parse date helper calls in all value positions, so that date helpers work wherever string literals work today.

#### Acceptance Criteria

1. WHEN a Date_Helper function call appears as the argument to `Type()`, `TypePassword()`, `Select()`, `AssertHasText()`, `Navigate()`, or `Manual()`, THE Compiler SHALL parse the call and emit the corresponding date helper descriptor as defined in Requirement 1
2. WHEN a Date_Helper function call appears inside a template literal expression (e.g., `` `Appointment on ${tomorrow()}` ``), THE Compiler SHALL parse it as a runtime template containing a date helper expression descriptor
3. IF an unrecognized function name is used as the value argument to `Type()`, `TypePassword()`, `Select()`, `AssertHasText()`, `Navigate()`, `Manual()`, or inside a template literal expression, THEN THE Compiler SHALL emit a warning indicating the function is not a known Date_Helper or runtime utility and SHALL continue compilation, still producing the Test_Plan output
4. THE Compiler SHALL include the source file path and line number in every warning emitted during Date_Helper parsing
5. IF a Date_Helper function call is passed more than one argument, THEN THE Compiler SHALL emit a warning indicating that Date_Helper functions accept at most one optional format string argument and SHALL ignore the extra arguments

### Requirement 5: Runtime Template String Support

**User Story:** As a test author, I want to use template strings with embedded expressions in my DSL actions, so that I can construct dynamic values combining static text with computed data.

#### Acceptance Criteria

1. WHEN a backtick template literal containing one or more `${}` expressions is used as a DSL_Value argument, THE Compiler SHALL emit a runtime template descriptor with a `parts` array that interleaves the static string segments with expression descriptors in source order
2. WHEN a backtick template literal contains zero expressions, THE Compiler SHALL emit it as a plain static string value (not a runtime template descriptor)
3. WHEN an identifier reference appears inside a template expression (e.g., `` `Hello ${username}` ``), THE Compiler SHALL emit it as a parameter placeholder descriptor with type `"param"` and the identifier name
4. WHEN a Date_Helper call appears inside a template expression (e.g., `` `Due by ${tomorrow()}` ``), THE Compiler SHALL emit it as a nested date helper descriptor following the same structure as standalone Date_Helper descriptors
5. WHEN an arithmetic expression using the operators `+`, `-`, `*`, or `/` with identifier and numeric literal operands appears inside a template expression (e.g., `` `Item ${count + 1}` ``), THE Compiler SHALL emit it as a runtime-evaluated expression descriptor with type `"expression"`
6. IF a template expression contains an unsupported expression type (not an identifier, Date_Helper call, or arithmetic expression), THEN THE Compiler SHALL emit a warning with the source file path and line number and treat the expression as a parameter placeholder for the raw source text
7. WHEN the Runtime encounters a runtime template descriptor, THE Runtime SHALL evaluate each expression descriptor in array order, coerce each result to a string, and concatenate the results with the interleaved static string parts to produce the final value

### Requirement 6: Runtime Template Expression Evaluation

**User Story:** As a test author, I want template expressions to be evaluated at runtime, so that computed values reflect the actual state of parameters and date calculations during execution.

#### Acceptance Criteria

1. WHEN a runtime template contains a parameter reference, THE Runtime SHALL substitute the current value of that parameter at execution time and coerce the value to a string before concatenation
2. WHEN a runtime template contains a Date_Helper call, THE Runtime SHALL resolve the date using the same offset and format logic defined in Requirement 2 (Date Helper Runtime Resolution) and substitute the resulting formatted date string
3. WHEN a runtime template contains an arithmetic expression referencing parameters, THE Runtime SHALL coerce the referenced parameter values to numbers and evaluate the expression supporting the operators `+`, `-`, `*`, `/` and parenthesized grouping
4. IF a runtime template references an undefined parameter, THEN THE Runtime SHALL substitute an empty string for that parameter reference and log a warning identifying the undefined parameter name
5. IF an arithmetic expression within a runtime template produces a non-finite result (NaN, Infinity, or division by zero), THEN THE Runtime SHALL substitute an empty string for that expression and log a warning identifying the expression that failed evaluation

### Requirement 7: DSL Type Definitions for Date Helpers

**User Story:** As a test author, I want TypeScript autocompletion and type checking for date helper functions, so that I get editor support when writing tests.

#### Acceptance Criteria

1. THE DSL type definitions SHALL declare each day-offset Date_Helper function (`today`, `tomorrow`, `yesterday`, `nextWeek`, `lastWeek`, `nextMonth`, `lastMonth`) as a global function accepting an optional string parameter for date format
2. THE DSL type definitions SHALL declare each month-boundary Date_Helper function (`firstDateOfMonth`, `lastDateOfMonth`) as a global function accepting a required integer parameter for month offset and an optional string parameter for date format
3. THE DSL type declarations SHALL specify that each Date_Helper function returns a type compatible with DSL_Value arguments (accepted by `Type()`, `AssertHasText()`, etc.)
4. WHEN a Date_Helper is used in a position that expects a string, THE type system SHALL accept the Date_Helper return type without type errors

### Requirement 8: Test Plan JSON Schema for Runtime Values

**User Story:** As a developer, I want the compiled JSON test plan to clearly distinguish runtime values from static values, so that the runtime can identify which values need evaluation.

#### Acceptance Criteria

1. THE Compiler SHALL emit static string values as plain JSON string properties in the Test_Plan, where the property value is a string type rather than an object (preserving current behavior)
2. WHEN a value is a day-offset Date_Helper, THE Compiler SHALL emit a JSON object with `type: "dateHelper"`, `kind: "dayOffset"`, an `offset` integer field, and an optional `format` field
3. WHEN a value is a month-boundary Date_Helper, THE Compiler SHALL emit a JSON object with `type: "dateHelper"`, `kind: "monthBoundary"`, a `boundary` field (`"first"` or `"last"`), a `monthOffset` integer field, and an optional `format` field
4. WHEN a value is a Runtime_Template, THE Compiler SHALL emit a JSON object with a `type` field set to `"runtimeTemplate"` and a `parts` array containing elements in template order, where static text segments are represented as plain strings and dynamic segments are represented as expression descriptor objects
5. THE Compiler SHALL emit expression descriptors as objects with a `type` field set to one of `"param"`, `"dateHelper"`, or `"expression"`, where: a `"param"` descriptor includes a `name` field containing the parameter name; a `"dateHelper"` descriptor includes the same fields as standalone Date_Helper descriptors; an `"expression"` descriptor includes a `source` field containing the original expression text for runtime evaluation
6. WHEN the Runtime receives a Test_Plan value that is a JSON object with a `type` field, THE Runtime SHALL treat it as a runtime-evaluated value; WHEN the value is a plain string, THE Runtime SHALL treat it as a static literal
