# @tomationjs/compiler

CLI compiler for the [Tomation](https://github.com/facka/tomation) browser automation framework. Transforms TypeScript POM and test files into `.tomation.json` files consumed by the browser extension.

## Install

```bash
npm install @tomationjs/compiler
```

## Usage

```bash
npx tomation compile
npx tomation check
npx tomation watch
```

### Commands

| Command | Description |
|---------|-------------|
| `compile` | Run full pipeline and emit `.tomation.json` |
| `check` | Validate without writing output (exit 1 on errors) |
| `watch` | Compile then watch source files for changes |

### Options

| Option | Description |
|--------|-------------|
| `--verbose` | Print step-by-step pipeline progress for debugging |

## Config

Create a `tomation.config.ts` (or `.js`) in your project root:

```typescript
export default {
  meta: {
    name: 'My App Tests',
    urls: ['http://localhost:3000'],
  },
  pom: './pom',
  tests: './tests',
  baseUrl: './',
  testFiles: 'https://example.com/fixtures', // optional: for file upload tests
}
```

## Pipeline

```
resolve → strip types → parse → extract POM → deduplicate → flatten → validate → emit
```

1. **Resolve** — discovers `.ts`/`.js` files, resolves `~/` aliases, topological sort
2. **Strip types** — removes TypeScript annotations via `ts.transpileModule`
3. **Parse** — acorn AST extraction of elements, tasks, tests
4. **Extract POM** — namespace derivation from file paths, element/task key namespacing
5. **Deduplicate** — detects key collisions
6. **Flatten** — merges POMs and tests into a single spec object
7. **Validate** — checks structural integrity
8. **Emit** — writes `<meta.name>.tomation.json`

## Output

The compiled output filename is derived from `meta.name`:

| `meta.name` | Output file |
|---|---|
| `"My App Tests"` | `my-app-tests.tomation.json` |
| `"Playground Tests"` | `playground-tests.tomation.json` |
| (missing) | `spec.json` |

## Features

- TypeScript support (`.ts`, `.tsx`, `.pom.ts`, `.test.ts`)
- `~/` path alias resolution
- Import-aware cross-file element reference resolution
- Folder-based namespacing (no collisions between same-name files in different folders)
- Conditional `if` step parsing
- Template param resolution (`{{paramName}}`)
- Watch mode with debounced rebuild

## License

MIT
