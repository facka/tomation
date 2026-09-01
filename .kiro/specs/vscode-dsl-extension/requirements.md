# Requirements Document

## Introduction

This feature adds a Visual Studio Code extension that helps developers author Tomation DSL code (`.pom.ts`, `.test.ts`, `.automation.ts`, and `.data.ts` files). The extension validates code live as the developer types, surfaces errors and warnings inline via VS Code's Problems panel and editor squiggles, and provides a focused linting experience powered by the existing `@tomationjs/compiler` parser and validator.

The extension lives in a new monorepo package at `packages/vscode-extension` and reuses the compiler's parsing/validation logic as the diagnostic engine rather than reimplementing it. Beyond diagnostics, the extension provides DSL-aware authoring assistance: context-sensitive completions (element builder chains, matcher factories, DSL actions, and element/task names drawn from the developer's own POM files), hover documentation, and go-to-definition for element and task references. These authoring features are layered on top of — and never replace — VS Code's built-in TypeScript language features for these files.

## Glossary

- **VSCode_Extension**: The new `packages/vscode-extension` package — a VS Code extension that activates on Tomation DSL files and reports diagnostics.
- **Compiler_Engine**: The existing `@tomationjs/compiler` package, specifically its `parseSource` (parser), `validateSpec` (validator), and supporting pipeline functions, reused by the VSCode_Extension to produce diagnostics without spawning the CLI.
- **DSL_File**: A source file the extension treats as Tomation DSL — one matching `*.pom.ts`, `*.test.ts`, `*.automation.ts`, or `*.data.ts`.
- **Diagnostic**: A single VS Code problem entry (error or warning) with a severity, message, source label, and a range (start/end position) within a DSL_File.
- **Parse_Warning**: A per-file, per-line diagnostic emitted by the Compiler_Engine's parser (e.g., "Unrecognized statement", "Unsupported if-condition", unresolved import) — inherently scoped to a single file and line.
- **Validation_Error**: A project-level error produced by the Compiler_Engine's validator or pipeline (e.g., unknown element reference, empty `where`, task cycle) after cross-file resolution.
- **Diagnostic_Provider**: The VSCode_Extension component that runs the Compiler_Engine against a DSL_File's current (possibly unsaved) content and translates results into VS Code Diagnostics.
- **Language_Server**: An optional out-of-process program implementing the Language Server Protocol (LSP) that hosts the Diagnostic_Provider; the extension is the LSP client.
- **Workspace**: The set of folders open in the VS Code window; a Tomation project is a Workspace folder containing a `tomation.config.ts`/`tomation.config.js`.
- **Debounce_Interval**: The idle delay after the last keystroke before the Diagnostic_Provider re-validates a changed DSL_File.
- **Diagnostic_Collection**: The VS Code API object the extension owns to publish and clear Diagnostics for DSL_Files.
- **Completion_Provider**: The VSCode_Extension component that supplies context-sensitive completion items (IntelliSense suggestions) while the developer types in a DSL_File.
- **Hover_Provider**: The VSCode_Extension component that supplies hover tooltips (documentation and resolved details) when the developer hovers over a DSL symbol.
- **Definition_Provider**: The VSCode_Extension component that resolves go-to-definition requests for element and task references to their declaration location.
- **Project_Index**: An in-memory model, built by parsing the Workspace's DSL_Files via the Compiler_Engine, that maps declared element names, task names, and their source locations so authoring features can suggest and navigate to project-defined symbols.
- **Element_Reference**: A usage of a declared element within a DSL action (e.g., the argument to `Click(...)`, `Type(...).in(...)`, `AssertExists(...)`), or a `childOf(...)` argument.
- **Task_Reference**: A usage of a declared task within a test/automation body, either as a bare call (`login()`) or a namespaced call (`Login.submit()`).

## Requirements

### Requirement 1: Extension Package and Activation

**User Story:** As a Tomation developer, I want a VS Code extension that turns on automatically when I open Tomation DSL files, so that I get live feedback without manual setup.

#### Acceptance Criteria

1. THE VSCode_Extension SHALL exist as a package at `packages/vscode-extension` within the monorepo and be included in the root workspaces configuration.
2. THE VSCode_Extension SHALL declare a `package.json` with the VS Code extension manifest fields (`engines.vscode`, `main`, `contributes`, `activationEvents` or equivalent) valid for publishing to the VS Code Marketplace.
3. THE VSCode_Extension SHALL activate when the Workspace contains at least one DSL_File OR a `tomation.config.ts`/`tomation.config.js`, using narrow activation events so it does not load for unrelated projects.
4. WHEN the VSCode_Extension activates, THE VSCode_Extension SHALL register a Diagnostic_Collection and begin validating currently open DSL_Files.
5. WHEN the VSCode_Extension is deactivated, THE VSCode_Extension SHALL dispose of the Diagnostic_Collection, file watchers, and any Language_Server process it started.
6. THE VSCode_Extension SHALL target a minimum VS Code engine version and SHALL document it in the package manifest and README.

### Requirement 2: DSL File Recognition

**User Story:** As a Tomation developer, I want the extension to know which of my files are Tomation DSL files, so that validation runs on the right files and not on unrelated TypeScript.

#### Acceptance Criteria

1. THE VSCode_Extension SHALL classify a file as a DSL_File when its name matches `*.pom.ts`, `*.test.ts`, `*.automation.ts`, or `*.data.ts`.
2. THE VSCode_Extension SHALL NOT report Tomation Diagnostics for TypeScript files that are not DSL_Files.
3. WHEN a file is renamed such that it starts or stops matching a DSL_File pattern, THE VSCode_Extension SHALL start or stop validating it accordingly.
4. THE VSCode_Extension SHALL treat DSL_Files as a specialization of TypeScript and SHALL NOT override or replace the built-in TypeScript language features for those files.

### Requirement 3: Live Validation on Edit

**User Story:** As a Tomation developer, I want my DSL code validated as I type, so that I catch mistakes immediately instead of at compile time.

#### Acceptance Criteria

1. WHEN a DSL_File is opened in the editor, THE VSCode_Extension SHALL validate its content and publish any resulting Diagnostics.
2. WHEN the content of an open DSL_File changes, THE VSCode_Extension SHALL re-validate the file's in-memory (unsaved) content after the Debounce_Interval elapses.
3. THE VSCode_Extension SHALL debounce validation so that rapid consecutive edits trigger at most one validation pass per Debounce_Interval.
4. WHEN a DSL_File is saved, THE VSCode_Extension SHALL validate the saved content.
5. WHEN a DSL_File is fully closed with no remaining editor instances (tabs or split views), THE VSCode_Extension SHALL clear its Diagnostics from the Diagnostic_Collection; WHILE the same file remains open in any other editor instance, THE VSCode_Extension SHALL retain its Diagnostics.
6. THE VSCode_Extension SHALL validate the editor's current buffer content (including unsaved changes) rather than only the on-disk file.

### Requirement 4: Error and Warning Highlighting

**User Story:** As a Tomation developer, I want errors and warnings shown inline in my code and in the Problems panel, so that I can see exactly where and what the issue is.

#### Acceptance Criteria

1. THE Diagnostic_Provider SHALL map each Parse_Warning to a VS Code Diagnostic with Warning severity.
2. THE Diagnostic_Provider SHALL map each fatal parse failure and each Validation_Error to a VS Code Diagnostic with Error severity.
3. WHEN a diagnostic includes a line number, THE Diagnostic_Provider SHALL produce a range on that line; WHEN a precise column/token range is available, THE Diagnostic_Provider SHALL use it, otherwise it SHALL highlight the full line.
4. WHEN a diagnostic has no usable line (line 0 or missing), THE Diagnostic_Provider SHALL attach it to the first line of the file so the problem remains visible and actionable.
5. THE Diagnostic_Provider SHALL set a `source` label of "tomation" on every Diagnostic so users can distinguish Tomation problems from TypeScript problems.
6. THE Diagnostic_Provider SHALL include the original diagnostic message text, and WHERE the engine provides a stable code/identifier, it SHALL attach a Diagnostic code.
7. WHEN a re-validation produces fewer problems than before, THE Diagnostic_Provider SHALL replace (not append to) the file's prior Diagnostics so stale problems disappear.

### Requirement 5: Reuse of the Compiler Engine

**User Story:** As a framework maintainer, I want the extension to reuse the existing compiler parser and validator, so that editor diagnostics stay consistent with `tomation compile`/`tomation check` and I don't maintain two rule sets.

#### Acceptance Criteria

1. THE Diagnostic_Provider SHALL obtain Parse_Warnings by invoking the Compiler_Engine's parser on the file content in-process, not by shelling out to the `tomation` CLI per keystroke.
2. THE VSCode_Extension SHALL depend on `@tomationjs/compiler` as a workspace dependency so its diagnostic rules match the shipped compiler version.
3. WHEN the Compiler_Engine's parser or validator changes its rules, THE VSCode_Extension SHALL surface those updated rules without code changes beyond a dependency version bump.
4. IF the Compiler_Engine throws or crashes on malformed input, THEN the Diagnostic_Provider SHALL catch the failure, report it as a single Error Diagnostic, and continue operating for subsequent edits.
5. THE Diagnostic_Provider SHALL type-strip TypeScript DSL_File content before parsing when the engine requires plain JS, matching the compiler pipeline's handling of `.ts` files.

### Requirement 6: File-Scoped vs Project-Scoped Diagnostics

**User Story:** As a Tomation developer, I want per-file mistakes flagged instantly while still being told about cross-file problems, so that fast feedback doesn't come at the cost of missing real errors.

#### Acceptance Criteria

1. THE Diagnostic_Provider SHALL produce file-scoped Diagnostics (Parse_Warnings and single-file parse errors) for the edited file using only that file's content, without requiring other files or a resolved project.
2. THE Diagnostic_Provider SHALL run project-scoped validation (cross-file element/task resolution and `validateSpec`) when a `tomation.config.ts`/`tomation.config.js` is present in the Workspace folder.
3. IF the `tomation.config` file is present but malformed or unreadable, THEN THE Diagnostic_Provider SHALL skip project-scoped validation entirely for that Workspace folder while continuing to provide file-scoped Diagnostics.
4. WHEN project-scoped validation runs, THE Diagnostic_Provider SHALL attribute each Validation_Error to the correct DSL_File and line WHERE the engine provides file/line attribution, and otherwise SHALL report it against the Workspace's config file or a designated project-level location.
5. WHEN no `tomation.config` is present, THE Diagnostic_Provider SHALL still provide file-scoped Diagnostics for open DSL_Files.
6. THE Diagnostic_Provider SHALL re-run project-scoped validation when any DSL_File or the `tomation.config` in that Workspace folder is saved.
7. THE VSCode_Extension SHALL support multi-root Workspaces, scoping project validation to each folder's own `tomation.config`.

### Requirement 7: Project Symbol Index

**User Story:** As a Tomation developer, I want the extension to know about the elements and tasks I've defined across my POM files, so that it can suggest and navigate to my own project symbols while I type.

#### Acceptance Criteria

1. THE VSCode_Extension SHALL build a Project_Index by parsing the Workspace's DSL_Files with the Compiler_Engine, capturing each declared element name, task name, and its declaration file and line.
2. THE Project_Index SHALL record, for each element, its resolved tag, label, and where-matcher summary WHERE the Compiler_Engine provides them.
3. WHEN a DSL_File is created, changed, saved, or deleted, THE VSCode_Extension SHALL update the Project_Index for the affected symbols after the Debounce_Interval.
4. THE Project_Index SHALL resolve cross-file symbols using the same `~/` alias and namespace rules as the Compiler_Engine so suggested and navigable names match compiled output.
5. WHERE no `tomation.config` is present, THE Project_Index SHALL still index symbols discoverable from open DSL_Files and their resolvable imports.
6. THE VSCode_Extension SHALL scope each Project_Index to its Workspace folder in multi-root Workspaces.

### Requirement 8: Authoring Completions

**User Story:** As a Tomation developer, I want context-aware suggestions as I write DSL code, so that I can author locators, actions, and references quickly and correctly without memorizing the API.

#### Acceptance Criteria

1. WHEN the developer types after `is.` in a DSL_File, THE Completion_Provider SHALL suggest supported HTML tag names (e.g., `BUTTON`, `INPUT`, `DIV`) and the `ELEMENT` XPath entry.
2. WHEN the developer is within an element builder chain (after `is.TAG` or a prior chain method), THE Completion_Provider SHALL suggest the chain methods `where`, `childOf`, `navigate`, and `as` appropriate to that position.
3. WHEN the developer is within a `.where(...)` argument, THE Completion_Provider SHALL suggest matcher factory functions supported by the Compiler_Engine (e.g., `idIs`, `innerTextIs`, `classIncludes`, `placeholderIs`, `nameIs`, `typeIs`, `closestLabelIs`, `nthChild`, `isDisabled`), including their expected argument shape.
4. WHEN the developer is entering an Element_Reference position (e.g., the argument to `Click`, the `.in(...)` target, an assertion target, or a `childOf(...)` argument), THE Completion_Provider SHALL suggest element names from the Project_Index, including cross-file names with their namespace/alias form.
5. WHEN the developer is entering a Task_Reference position within a test or automation body, THE Completion_Provider SHALL suggest task names from the Project_Index, including namespaced task names.
6. WHEN the developer is typing a top-level DSL action or declaration, THE Completion_Provider SHALL suggest DSL action functions and constructs (e.g., `Click`, `Type`, `Select`, `Navigate`, `AssertExists`, `AssertHasText`, `Test`, `Task`, `Automation`, `When`) recognized by the Compiler_Engine.
7. WHERE the Compiler_Engine or DSL type definitions provide documentation for a suggested symbol, THE Completion_Provider SHALL attach that documentation to the completion item.
8. THE Completion_Provider SHALL provide completions that supplement, and do not suppress, the built-in TypeScript completions for the same position.
9. IF the Project_Index is unavailable or a position cannot be classified, THEN THE Completion_Provider SHALL return no Tomation completions rather than incorrect ones, leaving TypeScript completions intact.

### Requirement 9: Hover Documentation

**User Story:** As a Tomation developer, I want to hover over DSL symbols to see what they do and what they resolve to, so that I can understand code without leaving the editor.

#### Acceptance Criteria

1. WHEN the developer hovers over a DSL action, matcher factory, or builder method, THE Hover_Provider SHALL show a concise description of that symbol.
2. WHEN the developer hovers over an Element_Reference, THE Hover_Provider SHALL show the element's declaration summary from the Project_Index, including its tag, label, and where-matcher summary WHERE available.
3. WHEN the developer hovers over a Task_Reference, THE Hover_Provider SHALL show the task's name and declaration location from the Project_Index.
4. WHEN hover information is not available for the symbol under the cursor, THE Hover_Provider SHALL return nothing and SHALL NOT interfere with the built-in TypeScript hover.

### Requirement 10: Go-to-Definition

**User Story:** As a Tomation developer, I want to jump from an element or task usage to where it's declared, so that I can navigate my POM files quickly.

#### Acceptance Criteria

1. WHEN the developer invokes go-to-definition on an Element_Reference, THE Definition_Provider SHALL navigate to the element's declaration location recorded in the Project_Index.
2. WHEN the developer invokes go-to-definition on a Task_Reference, THE Definition_Provider SHALL navigate to the task's declaration location recorded in the Project_Index.
3. WHEN the referenced symbol is declared in a different DSL_File, THE Definition_Provider SHALL open that file at the declaration location.
4. WHEN the symbol under the cursor is not a Tomation Element_Reference or Task_Reference, THE Definition_Provider SHALL defer to the built-in TypeScript go-to-definition rather than overriding it.
5. IF a referenced symbol cannot be resolved in the Project_Index, THEN THE Definition_Provider SHALL return no result rather than navigating to an incorrect location.

### Requirement 11: Performance and Responsiveness

**User Story:** As a Tomation developer, I want validation to feel instant and never freeze my editor, so that live linting is a help rather than a hindrance.

#### Acceptance Criteria

1. THE Diagnostic_Provider SHALL perform validation off the extension host's critical path such that a single validation pass does not block the UI; WHERE a Language_Server is used, validation SHALL run in the server process.
2. THE VSCode_Extension SHALL use a configurable Debounce_Interval with a sensible default (e.g., 300 ms) to coalesce edits.
3. WHEN multiple DSL_Files change in quick succession, THE Diagnostic_Provider SHALL avoid redundant re-validation of unchanged files.
4. THE VSCode_Extension SHALL cancel or supersede an in-flight validation for a file when newer content for that same file arrives.
5. THE VSCode_Extension SHALL not spawn a new process per validation; any Language_Server SHALL be a single long-lived process for the window.

### Requirement 12: Configuration Settings

**User Story:** As a Tomation developer, I want to tune how the extension behaves, so that I can adapt it to my workflow and project.

#### Acceptance Criteria

1. THE VSCode_Extension SHALL contribute a setting to enable or disable Tomation validation entirely, defaulting to enabled.
2. THE VSCode_Extension SHALL contribute a setting to enable or disable project-scoped (cross-file) validation independently of file-scoped validation.
3. THE VSCode_Extension SHALL contribute a setting for the Debounce_Interval.
4. THE VSCode_Extension SHALL contribute a setting to choose when validation runs (on type vs on save).
5. THE VSCode_Extension SHALL contribute a setting to enable or disable authoring completions, defaulting to enabled.
6. THE VSCode_Extension SHALL contribute a setting to enable or disable hover documentation and go-to-definition, defaulting to enabled.
7. WHEN a setting's value actually changes, THE VSCode_Extension SHALL apply the new behavior without requiring a window reload WHERE technically feasible, and otherwise SHALL prompt the user to reload; WHEN a settings-change event fires but no setting value actually changed, THE VSCode_Extension SHALL NOT prompt for reload.
8. THE VSCode_Extension SHALL namespace all settings under a `tomation` configuration key.

### Requirement 13: User Commands and Feedback

**User Story:** As a Tomation developer, I want commands and clear status so I can trigger validation manually and understand the extension's state, so that I stay in control.

#### Acceptance Criteria

1. THE VSCode_Extension SHALL contribute a command to re-validate the active DSL_File on demand.
2. THE VSCode_Extension SHALL contribute a command to re-validate all DSL_Files in the Workspace.
3. THE VSCode_Extension SHALL contribute a command to clear all Tomation Diagnostics.
4. WHEN the VSCode_Extension cannot load the Compiler_Engine (e.g., dependency missing), THE VSCode_Extension SHALL surface a clear, actionable error to the user, SHALL NOT silently fail, and SHALL continue providing any functionality that does not depend on the Compiler_Engine.
5. THE VSCode_Extension SHALL write diagnostic-provider errors and lifecycle events to a dedicated output channel for troubleshooting.

### Requirement 14: Packaging, Build, and Testing

**User Story:** As a framework maintainer, I want the extension built, tested, and packaged consistently with the rest of the monorepo, so that it is releasable and maintainable.

#### Acceptance Criteria

1. THE VSCode_Extension SHALL be buildable via a package-level build script and integrate with the monorepo's workspace tooling.
2. THE VSCode_Extension SHALL bundle its runtime dependencies (including the Compiler_Engine code it uses) so the published `.vsix` runs without a separate install step.
3. THE VSCode_Extension SHALL include an automated test suite covering the Diagnostic_Provider's translation of engine output into VS Code Diagnostics (mapping severities, ranges, clearing stale problems) AND covering the Completion_Provider, Hover_Provider, and Definition_Provider behavior (position classification and Project_Index-driven suggestions/navigation).
4. THE VSCode_Extension SHALL provide a `.vscodeignore` (or equivalent) so the packaged artifact excludes source maps, tests, and dev-only files.
5. THE VSCode_Extension SHALL include a README documenting supported file types, settings, commands, and the minimum VS Code version.
6. THE VSCode_Extension SHALL define a packaging script that produces a `.vsix` artifact.

### Requirement 15: Robustness and Non-Interference

**User Story:** As a Tomation developer, I want the extension to be resilient and unobtrusive, so that it never corrupts my work or degrades the editing experience.

#### Acceptance Criteria

1. THE VSCode_Extension SHALL be read-only with respect to user files and SHALL NOT modify, format, or write DSL_File content.
2. IF validation fails internally for one file, THEN THE VSCode_Extension SHALL isolate the failure to that file and SHALL continue validating other DSL_Files.
3. WHEN a DSL_File contains a syntax error that prevents parsing, THE Diagnostic_Provider SHALL report a single Error Diagnostic describing the syntax problem rather than a cascade of misleading warnings.
4. THE VSCode_Extension SHALL not emit duplicate Diagnostics for the same problem at the same location.
5. THE VSCode_Extension SHALL coexist with the built-in TypeScript language service and other extensions without suppressing their Diagnostics.
