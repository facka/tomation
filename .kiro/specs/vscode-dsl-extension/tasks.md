# Implementation Plan: VS Code Tomation DSL Extension

## Overview

This plan implements a VS Code extension that provides live diagnostics and DSL-aware authoring assistance (completions, hover, go-to-definition) for Tomation DSL files, reusing `@tomationjs/compiler` as the engine. Work is organized bottom-up: scaffold the package and LSP client/server skeleton, then the engine adapter, then diagnostics (file-scoped, then project-scoped), then the Project Symbol Index, then the authoring providers, and finally settings, commands, packaging, and docs.

All parsing/validation runs in the LSP server process. The mapper, position classifier, and providers are kept pure/unit-testable; VS Code integration tests are optional and marked accordingly.

## Tasks

- [x] 1. Scaffold the extension package and monorepo integration
  - [x] 1.1 Create `packages/vscode-extension` with manifest and build tooling
    - Add `package.json` with `engines.vscode`, `main` pointing to the bundled client, `contributes`, and narrow `activationEvents` (`workspaceContains:**/*.pom.ts`, `**/*.test.ts`, `**/*.automation.ts`, `**/*.data.ts`, `**/tomation.config.ts`, `**/tomation.config.js`)
    - Add `@tomationjs/compiler` as a workspace dependency and `vscode-languageclient`/`vscode-languageserver`/`vscode-languageserver-textdocument` as dependencies
    - Add `tsconfig.json`, `esbuild.js` (bundles `dist/client.js` and `dist/server.js` including compiler code), and `.vscodeignore` excluding `src/`, `test/`, source maps, and dev config
    - Register the package in the root `workspaces` array
    - _Requirements: 1.1, 1.2, 1.6, 5.2, 14.1, 14.2, 14.4_

  - [x] 1.2 Implement the client activation shim `src/client/extension.ts`
    - In `activate()`, construct `LanguageClient` with a filename-pattern `documentSelector` for the four DSL file patterns (language `typescript` + `pattern`), start the server, and register the client for disposal
    - Create the `Tomation` output channel and wire `window/logMessage` and a custom log notification to it
    - Push workspace configuration to the server on init and forward `workspace/didChangeConfiguration`
    - Register a `FileSystemWatcher` for DSL files and `tomation.config.{ts,js}` and relay events to the server
    - In `deactivate()`, stop the client (terminates the server, disposes diagnostics, watchers)
    - _Requirements: 1.3, 1.4, 1.5, 2.1, 2.4, 9.5, 11.5, 15.5_

  - [x] 1.3 Implement the server bootstrap `src/server/server.ts`
    - Create the LSP connection and a `TextDocuments<TextDocument>` manager
    - `onInitialize`: advertise `textDocumentSync` (incremental), `completionProvider` (trigger chars `.`, `(`, `'`), `hoverProvider`, `definitionProvider`; capture `initializationOptions` (settings, workspace folders)
    - Wire document events (`onDidOpen`, `onDidChangeContent`, `onDidClose`, `onDidSave`) and `onDidChangeWatchedFiles` to the scheduler; register `onCompletion`, `onHover`, `onDefinition` delegating to providers
    - _Requirements: 1.4, 2.1, 2.3, 3.1, 3.2, 3.4, 3.5, 6.6, 7.6_

- [x] 2. Utilities: DSL file detection, settings, and scheduler
  - [~] 2.1 Implement `src/server/util/dslFile.ts`
    - `isDslFile(uri)` matches `*.pom.ts`, `*.test.ts`, `*.automation.ts`, `*.data.ts`; `fileKind(uri)` returns the kind
    - _Requirements: 2.1, 2.2, 2.3_

  - [~] 2.2 Implement `src/server/util/settings.ts`
    - Typed settings snapshot under the `tomation` key with defaults: `validation.enabled=true`, `validation.projectScope=true`, `validation.debounceInterval=300`, `validation.runOn="type"`, `completion.enabled=true`, `hover.enabled=true`
    - Provide a change-detection helper that reports whether a value actually changed
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

  - [~] 2.3 Implement `src/server/util/debounce.ts` scheduler
    - `scheduleFile(uri, run)` and `scheduleProject(folder, run)` with per-key debounce (default 300 ms) and `CancellationTokenSource`; a newer schedule for the same key cancels the prior one
    - Coalesce project validation per workspace folder; avoid redundant re-runs
    - _Requirements: 3.3, 11.2, 11.3, 11.4, 11.5_

- [x] 3. Engine adapter over `@tomationjs/compiler`
  - [x] 3.1 Implement `src/server/engine/engine.ts`
    - Lazily `require` the compiler submodules (`parser.parseSource`, `ts-stripper.stripTypes`, `resolver.resolve`/`resolveSpecifier`, `pom.extractPom`/`deriveNamespace`, `deduplicator.deduplicateKeys`, `flattener.flattenSpec`, `validator.validateSpec`) inside try/catch; set `ready=false`/`loadError` on failure without throwing
    - Expose `parseSource`, `stripTypes`, `resolveProject`, and `runProjectPipeline` (mirroring the CLI `runPipeline` sequence: resolve → stripTypes → parseSource → extractPom → deduplicateKeys → flattenSpec → validateSpec)
    - For `.ts` files, strip types before parsing, passing raw TS source as `rawSource`
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 13.4_

  - [ ]* 3.2 Unit tests for the engine adapter
    - Assert `.ts` content is type-stripped before `parseSource`; assert a simulated load failure sets `ready=false` and does not throw
    - _Requirements: 5.5, 13.4_

- [x] 4. Diagnostic mapping and file-scoped diagnostics
  - [x] 4.1 Implement `src/server/diagnostics/diagnosticMapper.ts`
    - Pure `toDiagnostics({ parseError, warnings, validationError, documentText })` → `Diagnostic[]`
    - Severity: parse warnings → Warning; parse/strip/validation errors and fatal warnings → Error
    - Range: 1-based engine `line` → whole-line 0-based range; `line` 0/missing → line 0; prefer precise column range when present
    - Set `source="tomation"`; attach a stable `code` when the message matches a known pattern; dedup identical `(severity, range, message)`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 15.4_

  - [x] 4.2 Implement `src/server/diagnostics/fileDiagnostics.ts`
    - Read the live buffer; for `.ts` run `stripTypes` (a strip error yields exactly one Error diagnostic and stops); then `parseSource`
    - Map `parsed.error` and `parsed.warnings` via the mapper; wrap the pass in try/catch so a thrown error becomes a single Error diagnostic and the provider keeps working
    - Publish via `sendDiagnostics` so a re-run replaces (not appends) the file's prior diagnostics
    - _Requirements: 3.6, 4.7, 5.4, 6.1, 6.5, 11.1, 15.1, 15.2, 15.3_

  - [ ]* 4.3 Unit tests for mapper and file diagnostics
    - Mapper: severity mapping, line/range computation, `line=0` fallback, dedup, `source` label
    - File diagnostics: representative snippets (unrecognized statement, unresolved import, `else` block, unknown action) via a stubbed engine; strip error yields one Error
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.7, 14.3, 15.3, 15.4_

- [x] 5. Project-scoped diagnostics
  - [x] 5.1 Implement `src/server/diagnostics/projectDiagnostics.ts`
    - Locate `tomation.config.{ts,js}` per workspace folder; if absent, skip project validation (file-scoped still applies)
    - If the config is present but malformed/unreadable, skip project validation entirely for that folder and log; do not emit misleading errors
    - Otherwise run `engine.runProjectPipeline`; on success clear prior project diagnostics; on failure attribute per-file warnings to their `filePath:line` and attribute a single `validateSpec` error to the config file (line 1)
    - Merge project-scoped diagnostics with file-scoped diagnostics per URI; isolate a per-file failure and continue other files/folders; re-run on save of any DSL file or the config; scope per folder in multi-root
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 15.2_

  - [ ]* 5.2 Unit tests for project diagnostics attribution
    - Malformed config → skipped with no diagnostics; validateSpec error → config line 1; per-file warning → correct file/line
    - _Requirements: 6.2, 6.3, 14.3_

- [x] 6. Project Symbol Index
  - [~] 6.1 Implement `src/server/index/projectIndex.ts`
    - Build per-folder `ElementSymbol`/`TaskSymbol` maps by parsing DSL files (reuse the engine adapter): capture `variableName`, resolved `namespacedKey` (via `deriveNamespace` + `__`), `tag`, `label`, `whereSummary`, `filePath`, `line`, plus `paramNames` for tasks
    - Resolve cross-file references using `resolveSpecifier` over each file's `imports[]` so keys match compiled output
    - Maintain a `byFile` map for incremental add/update/remove on change/save/delete, driven through the debounce scheduler
    - Fallback when no `tomation.config`: index open files and files reachable via their resolvable imports; one index per workspace folder
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 6.2 Unit tests for the Project Symbol Index
    - POM fixture → expected element/task symbols with correct namespaced keys, tags, labels, lines; cross-file `~/` import resolves to the right namespace; deleting a file removes its symbols
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 14.3_

- [x] 7. Authoring providers
  - [x] 7.1 Implement position classifier `src/server/providers/positionContext.ts`
    - Classify the cursor into `isTag`, `builderChain`, `whereArg`, `elementRef`, `taskRef`, `topLevelAction`, `symbolAt`, or `none`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.1, 10.1_

  - [x] 7.2 Implement the docs map `src/server/providers/docs.ts`
    - Static table mapping DSL symbols (actions, matcher factories, builder methods, `is`, `Test`/`Task`/`Automation`/`When`) to short Markdown descriptions and argument hints
    - _Requirements: 8.7, 9.1_

  - [x] 7.3 Implement the completion provider `src/server/providers/completionProvider.ts`
    - `isTag` → HTML tags + `ELEMENT`; `builderChain` → `where`/`childOf`/`navigate`/`as`; `whereArg` → matcher factories with argument snippets; `elementRef` → element names from the index (local + namespaced); `taskRef` → task names from the index; `topLevelAction` → DSL actions/constructs
    - Attach docs where available; only add items (never suppress TS); return no items when disabled, index unavailable, or position `none`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 12.5_

  - [x] 7.4 Implement the hover provider `src/server/providers/hoverProvider.ts`
    - DSL symbol → docs-map description; `elementRef` → element tag/label/whereSummary/location; `taskRef` → task name/location; otherwise return null (defer to TS)
    - Gated by `hover.enabled`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 12.6_

  - [x] 7.5 Implement the definition provider `src/server/providers/definitionProvider.ts`
    - `elementRef`/`taskRef` → `Location` from the index (open the other DSL file when cross-file); otherwise return null (defer to TS); unresolved → no result
    - Gated by `hover.enabled`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 12.6_

  - [ ]* 7.6 Unit tests for classifier and providers
    - `positionContext`: representative positions map to the expected kind; completion: each kind yields the expected item set from a stubbed index, `none`/unavailable yields no items; hover/definition: element reference resolves to summary/location, non-Tomation symbol yields null
    - _Requirements: 8.1, 8.4, 8.8, 8.9, 9.2, 9.4, 10.1, 10.4, 14.3_

- [x] 8. Settings behavior, commands, and feedback
  - [~] 8.1 Wire settings into runtime behavior
    - Apply `validation.enabled` (clear + stop when off), `validation.projectScope`, `debounceInterval`, `runOn` (skip on-type when `"save"`), `completion.enabled`, `hover.enabled`
    - On config change, act only when a value actually changed; no reload prompt when nothing changed; attempt reload prompt only for settings that cannot hot-apply
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

  - [~] 8.2 Implement commands and engine-load feedback
    - Contribute and register `tomation.validateActiveFile`, `tomation.validateWorkspace`, `tomation.clearDiagnostics` (client forwards to server)
    - When the compiler engine fails to load, surface one clear actionable error, never silently fail, and keep non-engine functionality available; log lifecycle/errors to the output channel
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ] 9. Packaging, docs, and end-to-end verification
  - [~] 9.1 Finalize build, packaging, and README
    - Package-level `build` (esbuild), `watch`, `test`, and `package` (`vsce package` → `.vsix`) scripts; ensure bundling produces a standalone artifact
    - README documenting supported file types, settings, commands, and the minimum VS Code version
    - _Requirements: 1.6, 14.1, 14.2, 14.4, 14.5, 14.6_

  - [ ]* 9.2 Integration tests (`@vscode/test-electron`)
    - Diagnostic appears at the expected line/severity/source for a fixture; editing to fix clears it; a non-DSL `.ts` file gets no Tomation diagnostics and TS diagnostics are intact
    - Completion after `is.` and `Click(` shows Tomation items alongside TS items; go-to-definition on a cross-file element reference opens the POM at the declaration; hover shows element summary
    - _Requirements: 2.2, 4.7, 8.1, 8.4, 8.8, 9.2, 10.3, 11.5, 14.3, 15.5_
