# Requirements Document

## Introduction

This feature adds reusable test data generation capabilities to the Tomation DSL. A `Data()` function allows test authors to define structured data templates (patients, users, orders) that produce fresh, realistic values for each test run. A `Fake` object provides typed generator methods for common data types (names, dates, phones, emails). The compiler detects and resolves Data/Fake declarations, and the extension runtime generates values at test start. A "Test Data" panel in the extension UI displays resolved values.

## Glossary

- **DSL_Package**: The `@tomationjs/dsl` npm package that exports TypeScript type definitions and runtime stubs for authoring Tomation test files.
- **Compiler**: The `@tomationjs/compiler` package that parses `.test.ts`, `.pom.ts`, `.data.ts`, and `.automation.ts` source files and emits `.tomation.json` output consumed by the browser extension.
- **Extension_Runtime**: The browser extension module responsible for executing test steps, generating fake values, and resolving Data templates at test start.
- **Extension_UI**: The Vue-based side panel in the browser extension that displays test lists, execution logs, and resolved test data.
- **Data_Template**: A reusable blueprint object created by the `Data()` function, containing static values and Fake generator placeholders.
- **Fake_Generator**: A method on the `Fake` object that produces a placeholder marker at compile time, resolved to a realistic random value by the Extension_Runtime at test execution time.
- **Data_File**: A source file with the `.data.ts` extension that contains Data_Template definitions and is imported by test files using `~/` path aliases.
- **Test_Data_Panel**: A section in the Extension_UI that displays the resolved values of all Data_Templates referenced by the currently loaded test.
- **Resolved_Values**: The concrete runtime-generated values produced when the Extension_Runtime evaluates Fake_Generator placeholders at the start of a test run.

## Requirements

### Requirement 1: Data Function Declaration

**User Story:** As a test author, I want to define reusable data templates using a `Data()` function, so that I can declare structured test data sets once and reference them across multiple tests.

#### Acceptance Criteria

1. THE DSL_Package SHALL export a `Data` function that accepts a plain object argument and returns a typed Data_Template.
2. WHEN a Data_Template property contains a static value, THE Compiler SHALL inline that value at compile time.
3. WHEN a Data_Template property contains a Fake_Generator call, THE Compiler SHALL emit a generator placeholder in the compiled JSON output.
4. THE DSL_Package SHALL provide TypeScript type inference so that properties of a Data_Template are accessible with autocompletion in test files.
5. WHEN multiple tests reference the same Data_Template, THE Extension_Runtime SHALL resolve independent Resolved_Values for each test run.

### Requirement 2: Fake Name Generators

**User Story:** As a test author, I want to generate realistic first names, last names, and full names, so that my tests use varied human-readable data without hardcoding values.

#### Acceptance Criteria

1. THE DSL_Package SHALL export a `Fake` object with a `firstName` method that accepts an optional gender parameter with values `'male'` or `'female'`.
2. WHEN the gender parameter is omitted, THE Extension_Runtime SHALL generate a random first name of any gender.
3. WHEN the gender parameter is `'male'` or `'female'`, THE Extension_Runtime SHALL generate a first name consistent with the specified gender.
4. THE DSL_Package SHALL export a `Fake.lastName` method that accepts no parameters and produces a random last name.
5. THE DSL_Package SHALL export a `Fake.fullName` method that accepts an optional gender parameter and produces a combined first and last name.
6. THE Extension_Runtime SHALL generate all names using English locale data.

### Requirement 3: Fake Date of Birth Generator

**User Story:** As a test author, I want to generate realistic dates of birth with age constraints, so that my tests can target specific age groups (e.g., teenagers, adults, seniors).

#### Acceptance Criteria

1. THE DSL_Package SHALL export a `Fake.dateOfBirth` method that accepts an optional options object with `minAge`, `maxAge`, and `format` properties.
2. WHEN `minAge` is specified, THE Extension_Runtime SHALL generate a date of birth corresponding to an age greater than or equal to `minAge` years (inclusive, allowing age 0 for infants when explicitly requested).
3. WHEN `maxAge` is specified, THE Extension_Runtime SHALL generate a date of birth corresponding to an age less than or equal to `maxAge` years.
4. WHEN `format` is specified, THE Extension_Runtime SHALL format the generated date using the provided format string (supporting tokens: `YYYY`, `MM`, `DD`, `M`, `D`).
5. WHEN `format` is omitted, THE Extension_Runtime SHALL format the date using `YYYY-MM-DD` as the default format.
6. WHEN both `minAge` and `maxAge` are omitted, THE Extension_Runtime SHALL generate a date of birth corresponding to an age inclusively between 18 and 65 years.

### Requirement 4: Fake Phone Generator

**User Story:** As a test author, I want to generate phone numbers in country-specific formats, so that my tests produce realistic phone values for form inputs.

#### Acceptance Criteria

1. THE DSL_Package SHALL export a `Fake.phone` method that accepts an optional options object with a `country` property.
2. WHEN the `country` option is `'US'`, THE Extension_Runtime SHALL generate a phone number in US format.
3. WHEN the `country` option is `'UK'`, THE Extension_Runtime SHALL generate a phone number in UK format.
4. WHEN the `country` option is `'ES'`, THE Extension_Runtime SHALL generate a phone number in Spanish format.
5. WHEN the `country` option is omitted, THE Extension_Runtime SHALL generate a phone number in US format as the default.
6. THE `Fake.phone` method SHALL always return a valid phone number string; IF internal generation fails, THEN it SHALL throw an explicit error rather than returning an invalid value.

### Requirement 5: Fake Address Generator

**User Story:** As a test author, I want to generate address components or full addresses, so that my tests can fill address fields with realistic location data.

#### Acceptance Criteria

1. THE DSL_Package SHALL export a `Fake.address` method that accepts an optional part parameter with values `'full'`, `'street'`, `'city'`, `'country'`, or `'zip'`.
2. WHEN the part parameter is `'street'`, THE Extension_Runtime SHALL generate a street address string.
3. WHEN the part parameter is `'city'`, THE Extension_Runtime SHALL generate a city name string.
4. WHEN the part parameter is `'country'`, THE Extension_Runtime SHALL generate a country name string.
5. WHEN the part parameter is `'zip'`, THE Extension_Runtime SHALL generate a postal code string.
6. WHEN the part parameter is `'full'` or omitted, THE Extension_Runtime SHALL generate a complete address containing street, city, and postal code components.

### Requirement 6: Fake Email Generator

**User Story:** As a test author, I want to generate random email addresses, so that my tests can fill email fields without collisions or hardcoded values.

#### Acceptance Criteria

1. THE DSL_Package SHALL export a `Fake.email` method that accepts no parameters.
2. WHEN invoked, THE Extension_Runtime SHALL generate a syntactically valid email address with a random local part and domain.

### Requirement 7: Fake OneOf Generator

**User Story:** As a test author, I want to pick a random value from a custom set of options, so that I can generate test data for dropdown fields and enum-like inputs.

#### Acceptance Criteria

1. THE DSL_Package SHALL export a `Fake.oneOf` method that accepts a string array parameter.
2. WHEN invoked with a non-empty array (including single-element arrays), THE Extension_Runtime SHALL select one value at random from the provided array.
3. IF the provided array is empty, THEN THE Compiler SHALL report a validation error indicating that `Fake.oneOf` requires at least one option, and SHALL fail safely without attempting selection.

### Requirement 8: Fake Number Generator

**User Story:** As a test author, I want to generate random numbers within specified bounds and precision, so that my tests can produce realistic numeric data for quantity, age, and price fields.

#### Acceptance Criteria

1. THE DSL_Package SHALL export a `Fake.number` method that accepts an optional options object with `min`, `max`, and `decimals` properties.
2. WHEN `min` and `max` are specified, THE Extension_Runtime SHALL generate a number within the inclusive range `[min, max]`.
3. WHEN `min` is omitted, THE Extension_Runtime SHALL use `0` as the default minimum.
4. WHEN `max` is omitted, THE Extension_Runtime SHALL use `1000` as the default maximum.
5. WHEN `decimals` is specified, THE Extension_Runtime SHALL round the generated number to the specified number of decimal places.
6. WHEN `decimals` is omitted, THE Extension_Runtime SHALL generate an integer value with zero decimal places.

### Requirement 9: Data File Convention and Imports

**User Story:** As a test author, I want to define data templates in separate `.data.ts` files and import them using `~/` path aliases, so that data definitions are organized and shareable across test files.

#### Acceptance Criteria

1. THE Compiler SHALL recognize files with the `.data.ts` extension as Data_File source files.
2. THE Compiler SHALL resolve `~/` import paths in test files to locate referenced Data_File modules.
3. WHEN a Data_File contains exported Data_Template definitions, THE Compiler SHALL parse and include those definitions in the compiled output for each test that imports them. IF parsing succeeds but inclusion fails due to compilation errors or circular dependencies, THE Compiler SHALL fail the entire compilation.
4. THE Compiler SHALL support an optional `data` property in `tomation.config.ts` that specifies the directory path for Data_File discovery.
5. WHEN the `data` config property is omitted, THE Compiler SHALL discover Data_Files by following import paths from test files.
6. WHEN a Data_File exists but exports no Data_Template definitions, THE Compiler SHALL emit a warning about the empty data file.

### Requirement 10: Compiler Data Resolution

**User Story:** As a framework developer, I want the compiler to detect Data and Fake declarations and emit structured data fields in the test JSON output, so that the extension runtime can resolve values at execution time.

#### Acceptance Criteria

1. WHEN a test file references a Data_Template property, THE Compiler SHALL emit a `data` field in the test JSON output containing the template structure.
2. THE Compiler SHALL represent static Data_Template values as literal values in the emitted JSON.
3. THE Compiler SHALL represent Fake_Generator calls as typed placeholder objects in the emitted JSON, preserving the generator method name and options.
4. IF a test references a Data_Template property that does not exist in the definition, THEN THE Compiler SHALL report a validation error with the file path and line number.
5. THE Compiler SHALL support Data_Template definitions that are declared inline within test files as well as imported from Data_Files.

### Requirement 11: Extension Runtime Data Resolution

**User Story:** As a test executor, I want the extension runtime to generate fresh random values for each test run, so that tests are independent and exercise varied data paths.

#### Acceptance Criteria

1. WHEN a test run begins, THE Extension_Runtime SHALL resolve all Fake_Generator placeholders in the test data to concrete Resolved_Values.
2. THE Extension_Runtime SHALL generate different Resolved_Values for each test run to ensure test independence.
3. WHEN a Data_Template property is referenced in a test step (e.g., as a Type action value), THE Extension_Runtime SHALL substitute the Resolved_Value into the step at execution time.
4. WHILE a test is executing, THE Extension_Runtime SHALL use the same Resolved_Values for all references to the same Data_Template property within that test run.
5. THE Extension_Runtime SHALL default to English locale data for all generated values. THE system SHALL support locale configuration in a future release for international testing scenarios.

### Requirement 12: Test Data Panel

**User Story:** As a test author, I want to see the resolved test data values in the extension UI panel, so that I can verify what values were used during a test run and debug data-related failures.

#### Acceptance Criteria

1. WHEN a test with Data_Template references is loaded, THE Extension_UI SHALL display a "Test Data" section at the top of the step list in the side panel.
2. THE Test_Data_Panel SHALL display each Data_Template field name alongside its Resolved_Value.
3. WHEN a new test run begins, THE Test_Data_Panel SHALL update to show the newly generated Resolved_Values.
4. WHEN the loaded test does not reference any Data_Templates, THE Extension_UI SHALL hide the Test Data section.

### Requirement 13: Const Object Resolution for Enum-Style Values

**User Story:** As a test author, I want to define const objects as enum-style value maps and reference their properties in `Fake.oneOf()` and test steps, so that I get autocomplete on option keys, avoid typos, and can reuse the same set of values across multiple Data templates and tests.

#### Acceptance Criteria

1. THE Compiler SHALL track top-level `const` object declarations (e.g., `const BloodType = { APositive: 'A+', BPositive: 'B+' }`) and maintain a binding map of their property values.
2. WHEN a `Fake.oneOf()` argument contains member expressions referencing a tracked const object (e.g., `Fake.oneOf([BloodType.APositive, BloodType.BPositive])`), THE Compiler SHALL resolve each member expression to its corresponding literal string value before emitting the placeholder.
3. WHEN a test step uses a const object member expression as a value (e.g., `Type(BloodType.APositive).in(input)` or `Select(Gender.Male).in(select)`), THE Compiler SHALL resolve it to the literal string value at compile time.
4. IF a member expression references a const object property that does not exist, THEN THE Compiler SHALL report a validation error with the file path and line number.
5. THE Compiler SHALL support const objects imported from other files via `~/` path aliases.
