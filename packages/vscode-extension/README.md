# Tomation DSL

Live diagnostics and DSL-aware authoring assistance for [Tomation](https://github.com/facka/tomation) DSL files. The extension reuses the `@tomationjs/compiler` engine to validate your files as you type and to power completions, hover documentation, and go-to-definition — without replacing the built-in TypeScript language features.

## Requirements

- **Minimum VS Code version:** `^1.85.0`

The extension activates automatically when your workspace contains at least one Tomation DSL file or a `tomation.config.ts` / `tomation.config.js`. It uses narrow activation events, so it stays dormant for unrelated projects.

## Supported file types

The extension recognizes the following files as Tomation DSL files and validates them:

| Pattern | Purpose |
| --- | --- |
| `*.pom.ts` | Page Object Model definitions |
| `*.test.ts` | Test specifications |
| `*.automation.ts` | Reusable automations |
| `*.data.ts` | Test data definitions |
| `tomation.config.ts` / `tomation.config.js` | Project configuration (drives project-scoped validation) |

DSL files are treated as a specialization of TypeScript. The built-in TypeScript language service continues to work normally, and no Tomation diagnostics are reported for ordinary TypeScript files that are not DSL files.

## Features

- **Live validation** — file-scoped diagnostics as you type (or on save), plus project-scoped (cross-file) validation when a `tomation.config` is present.
- **Completions** — context-aware suggestions for HTML tags, builder chains, matcher factories, element/task references, and top-level DSL actions.
- **Hover** — documentation for DSL symbols and summaries for element/task references.
- **Go-to-definition** — navigate to element and task declarations, including across files.

## Settings

All settings live under the `tomation` key.

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `tomation.validation.enabled` | boolean | `true` | Enable or disable Tomation validation entirely. |
| `tomation.validation.projectScope` | boolean | `true` | Enable project-scoped (cross-file) validation independently of file-scoped validation. |
| `tomation.validation.debounceInterval` | number | `300` | Idle delay in milliseconds after the last keystroke before re-validating a changed DSL file. |
| `tomation.validation.runOn` | string (`"type"` \| `"save"`) | `"type"` | Choose when validation runs: on type or on save. |
| `tomation.completion.enabled` | boolean | `true` | Enable or disable Tomation authoring completions. |
| `tomation.hover.enabled` | boolean | `true` | Enable or disable Tomation hover documentation and go-to-definition. |

## Commands

Available from the Command Palette:

| Command | Title | Description |
| --- | --- | --- |
| `tomation.validateActiveFile` | Tomation: Validate Active File | Re-validate the currently active DSL file. |
| `tomation.validateWorkspace` | Tomation: Validate Workspace | Run project-scoped validation across the workspace. |
| `tomation.clearDiagnostics` | Tomation: Clear Diagnostics | Clear all Tomation diagnostics. |

## Development

The extension is part of the Tomation monorepo and shares its workspace tooling.

```bash
# Build standalone client/server bundles into dist/
npm run build

# Rebuild on change
npm run watch

# Run the test suite
npm run test

# Produce a .vsix artifact
npm run package
```

`npm run build` uses esbuild to produce standalone `dist/client.js` and `dist/server.js` bundles that include the compiler engine, so the packaged `.vsix` runs without a separate install step. The `.vscodeignore` excludes `src/`, tests, source maps, and dev-only config from the published artifact.

## License

MIT
