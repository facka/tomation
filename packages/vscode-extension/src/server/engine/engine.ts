/**
 * Engine adapter — the single boundary to `@tomationjs/compiler`.
 *
 * The extension does not reimplement any DSL rules. This module is the one
 * place that reaches into the compiler, calling its already-exported functions
 * in-process so that editor diagnostics match `tomation compile`/`tomation
 * check` exactly (Req 5.1, 5.2, 5.3).
 *
 * The compiler ships as untyped CommonJS. The CLI (`packages/compiler/bin/
 * tomation.js`) imports its submodules directly, and this adapter does the
 * same via {@link loadCompiler} so behavior is identical. Because the modules
 * are untyped, the imported functions are modeled with minimal structural
 * shapes; the surface this adapter *exports* is fully typed.
 *
 * Safe loading (Req 13.4): the `require` calls are wrapped in try/catch. If any
 * fails, {@link Engine.ready} is `false` and {@link Engine.loadError} carries
 * the message — the adapter never throws at construction, and every operation
 * short-circuits to an "engine unavailable" result rather than crashing the
 * server. The rest of the extension (commands, output channel, activation)
 * keeps running.
 *
 * TypeScript handling (Req 5.5): for `.ts`/`.tsx` files the adapter strips
 * types *before* parsing and passes the raw (original TS) source through to
 * `parseSource` as `rawSource`, matching the CLI so automation parameter type
 * extraction keeps working. Non-TS files pass `rawSource = null`.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.5, 13.4.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Exported result types
// ---------------------------------------------------------------------------

/** A single engine warning, as produced by the parser/pipeline. */
export interface EngineWarning {
  message: string;
  filePath: string;
  line: number;
  source?: string;
}

/** A parse/strip error, with an optional 1-based line. */
export interface EngineError {
  message: string;
  line?: number;
}

/**
 * The result of parsing one file. The compiler is untyped, so this is a
 * minimal structural view over the fields the diagnostics/index code reads;
 * unknown extra fields are preserved via the index signature.
 */
export interface ParsedFile {
  type?: string;
  filePath?: string;
  elements?: unknown[];
  tasks?: unknown[];
  tests?: unknown[];
  automations?: unknown[];
  imports?: Array<{ localName: string; importPath: string }>;
  dataTemplates?: unknown[];
  warnings?: EngineWarning[];
  error?: EngineError | null;
  [key: string]: unknown;
}

/** The result of type-stripping a `.ts`/`.tsx` source. */
export interface StripResult {
  code: string;
  error?: EngineError | null;
}

/** The result of resolving a project (file discovery + config). */
export interface ResolveResult {
  ok: boolean;
  error?: string | EngineError;
  files?: string[];
  meta?: Record<string, unknown>;
  pomDir?: string | null;
  baseUrl?: string;
  automationsDir?: string | null;
  dataDir?: string | null;
  [key: string]: unknown;
}

/**
 * The result of running the full project pipeline. Mirrors the CLI
 * `runPipeline` return: `{ ok: true, spec, files }` on success or
 * `{ ok: false, error, warnings? }` on failure. Non-fatal warnings are
 * accumulated in both cases.
 */
export interface PipelineResult {
  ok: boolean;
  spec?: Record<string, unknown>;
  files?: string[];
  error?: string;
  warnings?: EngineWarning[];
}

/** The public engine surface consumed by the diagnostics/index/providers. */
export interface Engine {
  /** `false` when the compiler failed to load. */
  readonly ready: boolean;
  /** The load-failure message when {@link ready} is `false`. */
  readonly loadError?: string;
  /** Parse a single (already JS) source into a {@link ParsedFile}. */
  parseSource(
    source: string,
    filePath: string,
    rawSource: string | null,
    options?: { baseUrl?: string }
  ): ParsedFile;
  /** Strip TypeScript types from a source, returning plain JS. */
  stripTypes(source: string, filePath: string): StripResult;
  /** Resolve a project's files and config from `cwd`. */
  resolveProject(cwd: string): ResolveResult;
  /** Run the full pipeline for a project rooted at `cwd`. */
  runProjectPipeline(cwd: string): PipelineResult;
  /**
   * Derive the PascalCase namespace for a POM/automation file relative to a
   * base directory (POM/automation root), mirroring the compiler so index keys
   * match compiled output (Req 7.4). Returns `null` when the compiler is
   * unavailable or the derivation throws (e.g. an underscore in the filename),
   * so callers can skip that file's symbols gracefully rather than crash.
   */
  deriveNamespace(filePath: string, baseDir: string | null): string | null;
  /**
   * Resolve an import specifier (from `fromFilePath`, using `baseUrl` for `~/`
   * aliasing) to an absolute file path, mirroring the compiler so cross-file
   * reference keys match compiled output (Req 7.2). Returns `null` when the
   * compiler is unavailable or resolution throws / yields nothing.
   */
  resolveSpecifier(
    specifier: string,
    fromFilePath: string,
    baseUrl: string
  ): string | null;
}

// ---------------------------------------------------------------------------
// Compiler module shapes (untyped CommonJS)
// ---------------------------------------------------------------------------

interface CompilerModules {
  parseSource(
    source: string,
    filePath: string,
    rawSource: string | null,
    options: { baseUrl?: string }
  ): ParsedFile;
  stripTypes(source: string, filePath: string): StripResult;
  resolve(cwd: string): ResolveResult;
  resolveSpecifier(
    importPath: string,
    fromFilePath: string,
    baseUrl: string
  ): string | null;
  extractPom(
    parsedFile: ParsedFile,
    options: { pomDir: string | null }
  ): PomResult;
  deriveNamespace(filePath: string, baseDir: string | null): string;
  detectNamespaceCollisions(pomResults: PomResult[]): EngineError[];
  deduplicateKeys(pomResults: PomResult[]): { ok: boolean; error?: string };
  flattenSpec(
    pomResults: PomResult[],
    testFiles: ParsedFile[],
    meta: Record<string, unknown>,
    options: { cwd: string }
  ): Record<string, unknown>;
  validateSpec(spec: Record<string, unknown>): {
    ok: boolean;
    error?: string;
    spec?: Record<string, unknown>;
  };
}

/** Minimal view over an extracted POM result. */
interface PomResult {
  namespace?: string;
  filePath?: string;
  pageElements?: Record<string, unknown>;
  tasks?: Record<string, { steps?: unknown[] }>;
  errors?: EngineError[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Safe compiler loading
// ---------------------------------------------------------------------------

/** Default meta when a project's config supplies none (matches the CLI). */
const DEFAULT_META: Record<string, unknown> = {
  name: 'Untitled',
  url: '',
  description: '',
};

/**
 * Lazily and safely `require` the compiler submodules the CLI uses, wiring the
 * named exports into a single {@link CompilerModules} bag. Returns `null` (and
 * the caller records `loadError`) if any require fails — the adapter never
 * throws (Req 13.4).
 */
function loadCompiler(): CompilerModules {
  // The submodule layout matches how the CLI consumes the compiler today. The
  // compiler is CommonJS, so `require` returns the module.exports object.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const parser = require('@tomationjs/compiler/src/parser');
  const tsStripper = require('@tomationjs/compiler/src/ts-stripper');
  const resolver = require('@tomationjs/compiler/src/resolver');
  const pom = require('@tomationjs/compiler/src/pom');
  const deduplicator = require('@tomationjs/compiler/src/deduplicator');
  const flattener = require('@tomationjs/compiler/src/flattener');
  const validator = require('@tomationjs/compiler/src/validator');
  /* eslint-enable @typescript-eslint/no-var-requires */

  return {
    parseSource: parser.parseSource,
    stripTypes: tsStripper.stripTypes,
    resolve: resolver.resolve,
    resolveSpecifier: resolver.resolveSpecifier,
    extractPom: pom.extractPom,
    deriveNamespace: pom.deriveNamespace,
    detectNamespaceCollisions: pom.detectNamespaceCollisions,
    deduplicateKeys: deduplicator.deduplicateKeys,
    flattenSpec: flattener.flattenSpec,
    validateSpec: validator.validateSpec,
  };
}

/** True when a file should be type-stripped before parsing (matches the CLI). */
function isTypeScript(filePath: string): boolean {
  return filePath.endsWith('.ts') || filePath.endsWith('.tsx');
}

// ---------------------------------------------------------------------------
// Engine implementation
// ---------------------------------------------------------------------------

class CompilerEngine implements Engine {
  readonly ready: boolean;
  readonly loadError?: string;
  private readonly compiler: CompilerModules | null;

  constructor() {
    let compiler: CompilerModules | null = null;
    let loadError: string | undefined;
    try {
      compiler = loadCompiler();
    } catch (err) {
      compiler = null;
      loadError = errorMessage(err);
    }
    this.compiler = compiler;
    this.ready = compiler !== null;
    this.loadError = loadError;
  }

  parseSource(
    source: string,
    filePath: string,
    rawSource: string | null,
    options?: { baseUrl?: string }
  ): ParsedFile {
    if (!this.compiler) {
      return { error: this.unavailableError() };
    }
    return this.compiler.parseSource(source, filePath, rawSource, options ?? {});
  }

  stripTypes(source: string, filePath: string): StripResult {
    if (!this.compiler) {
      return { code: source, error: this.unavailableError() };
    }
    return this.compiler.stripTypes(source, filePath);
  }

  resolveProject(cwd: string): ResolveResult {
    if (!this.compiler) {
      return { ok: false, error: this.unavailableError() };
    }
    return this.compiler.resolve(cwd);
  }

  /**
   * Wrap `pom.deriveNamespace` (Req 7.4). The compiler throws when a filename
   * or folder contains underscores; the index only wants a graceful `null` in
   * that case so it can skip the file's symbols rather than fail the pass.
   */
  deriveNamespace(filePath: string, baseDir: string | null): string | null {
    if (!this.compiler) {
      return null;
    }
    try {
      return this.compiler.deriveNamespace(filePath, baseDir);
    } catch {
      return null;
    }
  }

  /**
   * Wrap `resolver.resolveSpecifier` (Req 7.2). Returns `null` when the
   * compiler is unavailable or resolution throws / yields nothing, so callers
   * can silently skip an unresolvable import.
   */
  resolveSpecifier(
    specifier: string,
    fromFilePath: string,
    baseUrl: string
  ): string | null {
    if (!this.compiler) {
      return null;
    }
    try {
      return this.compiler.resolveSpecifier(specifier, fromFilePath, baseUrl) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Run the full pipeline for a project rooted at `cwd`, mirroring the CLI
   * `runPipeline` sequence so editor project diagnostics match `tomation
   * check`:
   *
   *   resolve → (per file) read + stripTypes(if .ts) + parseSource →
   *   extractPom (POMs) → detectNamespaceCollisions → cross-file element
   *   reference resolution via imports (resolveSpecifier + step-target rewrite)
   *   → deriveNamespace (automations) → deduplicateKeys → flattenSpec →
   *   validateSpec.
   *
   * Reads files from disk (project-scoped runs operate on saved files; live
   * buffer handling lives in the file-scoped path). Per-file warnings are
   * accumulated as `{ message, filePath, line }` and returned in `warnings`.
   */
  runProjectPipeline(cwd: string): PipelineResult {
    const compiler = this.compiler;
    if (!compiler) {
      return { ok: false, error: this.unavailableError().message };
    }

    const warnings: EngineWarning[] = [];

    // Step 1: resolve project files + config.
    const resolveResult = compiler.resolve(cwd);
    if (!resolveResult.ok) {
      return { ok: false, error: engineErrorText(resolveResult.error) };
    }

    const files = resolveResult.files ?? [];
    const pomDir = resolveResult.pomDir ?? null;
    const automationsDir = resolveResult.automationsDir ?? null;
    const baseUrl = resolveResult.baseUrl ?? cwd;
    const meta = resolveResult.meta ?? DEFAULT_META;

    // Step 2: read, strip types (if .ts/.tsx), and parse each file.
    const parsedFiles: ParsedFile[] = [];
    for (const filePath of files) {
      let source: string;
      try {
        source = fs.readFileSync(filePath, 'utf8');
      } catch (err) {
        return {
          ok: false,
          error: 'Failed to read ' + filePath + ': ' + errorMessage(err),
          warnings,
        };
      }

      // Keep the raw TS source for automation param type extraction.
      const ts = isTypeScript(filePath);
      const rawSource = ts ? source : null;

      if (ts) {
        const stripResult = compiler.stripTypes(source, filePath);
        if (stripResult.error) {
          return {
            ok: false,
            error:
              'TypeScript error in ' +
              filePath +
              ':' +
              stripResult.error.line +
              ': ' +
              stripResult.error.message,
            warnings,
          };
        }
        source = stripResult.code;
      }

      const parsed = compiler.parseSource(source, filePath, rawSource, {
        baseUrl,
      });
      if (parsed.error) {
        return { ok: false, error: parsed.error.message, warnings };
      }
      if (parsed.warnings && parsed.warnings.length > 0) {
        warnings.push(...parsed.warnings);
      }
      parsedFiles.push(parsed);
    }

    // Step 3: separate POM / test / automation files; extract POM results.
    const pomResults: PomResult[] = [];
    const testFiles: ParsedFile[] = [];
    const automationFiles: ParsedFile[] = [];
    for (const pf of parsedFiles) {
      if (pf.type === 'pom') {
        const pomResult = compiler.extractPom(pf, { pomDir });
        if (pomResult.errors && pomResult.errors.length > 0) {
          return { ok: false, error: pomResult.errors[0].message, warnings };
        }
        pomResults.push(pomResult);
      } else if (pf.type === 'automation') {
        automationFiles.push(pf);
      } else {
        // Warn if a .data.ts file exports no Data templates (matches the CLI).
        if (
          pf.filePath &&
          pf.filePath.endsWith('.data.ts') &&
          (!pf.dataTemplates || pf.dataTemplates.length === 0)
        ) {
          warnings.push({
            message:
              'Data file "' +
              path.basename(pf.filePath) +
              '" exports no Data templates',
            filePath: pf.filePath,
            line: 0,
          });
        }
        testFiles.push(pf);
      }
    }

    // Step 3b: detect namespace collisions across POM files.
    const collisionErrors = compiler.detectNamespaceCollisions(pomResults);
    if (collisionErrors.length > 0) {
      return { ok: false, error: collisionErrors[0].message, warnings };
    }

    // Step 3c: resolve cross-file element references in steps via imports.
    const fileToNamespace: Record<string, string> = {};
    for (const pr of pomResults) {
      if (pr.namespace && pr.filePath) {
        fileToNamespace[pr.filePath] = pr.namespace;
      }
    }

    for (const rpf of parsedFiles) {
      if (!rpf.imports || rpf.imports.length === 0) {
        continue;
      }

      const importMap: Record<string, string> = {};
      for (const imp of rpf.imports) {
        const resolvedPath = compiler.resolveSpecifier(
          imp.importPath,
          rpf.filePath ?? '',
          baseUrl
        );
        if (resolvedPath && fileToNamespace[resolvedPath]) {
          importMap[imp.localName] = fileToNamespace[resolvedPath];
        } else if (!resolvedPath) {
          // Unresolvable import — warn if it looks like a POM import.
          warnings.push({
            message:
              'Cannot resolve import "' +
              imp.importPath +
              '" in ' +
              path.basename(rpf.filePath ?? '') +
              '. If this imports a POM file, use the ~/ alias path (e.g., ' +
              "import " +
              imp.localName +
              " from '~/pom/...') for correct namespace resolution.",
            filePath: rpf.filePath ?? '',
            line: 0,
          });
        }
        // A resolvable non-POM import is fine to skip silently.
      }

      if (Object.keys(importMap).length > 0) {
        rewriteStepTargets(rpf, importMap);

        // Also rewrite the already-extracted POM task steps for this file,
        // since extractPom copied the steps before rewriting happened.
        if (rpf.type === 'pom') {
          for (const pr of pomResults) {
            if (pr.filePath === rpf.filePath) {
              for (const key of Object.keys(pr.tasks ?? {})) {
                const taskEntry = pr.tasks![key];
                if (taskEntry.steps) {
                  taskEntry.steps = rewriteSteps(taskEntry.steps, importMap);
                }
              }
              break;
            }
          }
        }
      }
    }

    // Step 3d: derive namespaces for automation files and prefix labels.
    for (const af of automationFiles) {
      const automations = (af.automations ?? []) as Array<{
        label?: string;
        name?: string;
      }>;
      if (automations.length === 0) {
        continue;
      }
      try {
        const autoNamespace = compiler.deriveNamespace(
          af.filePath ?? '',
          automationsDir
        );
        for (const automation of automations) {
          if (automation.label) {
            automation.name = autoNamespace + '__' + automation.label;
          }
        }
      } catch (err) {
        return { ok: false, error: errorMessage(err), warnings };
      }
    }

    // Step 4: deduplicate keys.
    const dedupResult = compiler.deduplicateKeys(pomResults);
    if (!dedupResult.ok) {
      return { ok: false, error: dedupResult.error, warnings };
    }

    // Step 5: flatten.
    const spec = compiler.flattenSpec(
      pomResults,
      testFiles.concat(automationFiles),
      meta,
      { cwd }
    );

    // Step 6: validate.
    const validationResult = compiler.validateSpec(spec);
    if (!validationResult.ok) {
      return { ok: false, error: validationResult.error, warnings };
    }

    return {
      ok: true,
      spec: validationResult.spec,
      files,
      warnings,
    };
  }

  /** The error object returned when the compiler is unavailable. */
  private unavailableError(): EngineError {
    return {
      message:
        'Tomation compiler is unavailable' +
        (this.loadError ? ': ' + this.loadError : '') +
        '.',
    };
  }
}

// ---------------------------------------------------------------------------
// Import-based target rewriting (mirrors the CLI)
// ---------------------------------------------------------------------------

/**
 * Rewrite step targets in a parsed file using the import → namespace map, so a
 * `VariableName__property` target becomes `Namespace__property`. Covers test,
 * task, and automation steps.
 */
function rewriteStepTargets(
  parsedFile: ParsedFile,
  importMap: Record<string, string>
): void {
  const collections: Array<{ steps?: unknown[] }[]> = [];
  if (parsedFile.tests) {
    collections.push(parsedFile.tests as { steps?: unknown[] }[]);
  }
  if (parsedFile.tasks) {
    collections.push(parsedFile.tasks as { steps?: unknown[] }[]);
  }
  if (parsedFile.automations) {
    collections.push(parsedFile.automations as { steps?: unknown[] }[]);
  }
  for (const collection of collections) {
    for (const entry of collection) {
      entry.steps = rewriteSteps(entry.steps, importMap);
    }
  }
}

/** A parsed step, modeled loosely since the compiler is untyped. */
interface Step {
  action?: string;
  target?: string;
  name?: string;
  then?: unknown[];
  [key: string]: unknown;
}

/**
 * Rewrite an array of steps, replacing import-based targets and task
 * invocations with their namespaced equivalents, recursing into `if` blocks.
 */
function rewriteSteps(
  steps: unknown[] | undefined,
  importMap: Record<string, string>
): unknown[] | undefined {
  if (!steps) {
    return steps;
  }
  return steps.map((raw) => {
    const step = { ...(raw as Step) };

    if (step.target && step.target.indexOf('__') !== -1) {
      const parts = step.target.split('__');
      const varName = parts[0];
      const prop = parts.slice(1).join('__');
      if (importMap[varName]) {
        step.target = importMap[varName] + '__' + prop;
      }
    }

    if (step.action === 'task' && step.name && step.name.indexOf('__') !== -1) {
      const parts = step.name.split('__');
      const varName = parts[0];
      const method = parts.slice(1).join('__');
      if (importMap[varName]) {
        step.name = importMap[varName] + '__' + method;
      }
    }

    if (step.action === 'if' && step.then) {
      step.then = rewriteSteps(step.then, importMap);
    }

    return step;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a human-readable message from an unknown thrown value. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

/** Normalize a resolve() error (string or `{ message }`) to text. */
function engineErrorText(error: string | EngineError | undefined): string {
  if (!error) {
    return 'Unknown error';
  }
  return typeof error === 'string' ? error : error.message;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the engine adapter, loading the compiler safely. When loading fails
 * the returned engine has `ready === false` and every operation short-circuits
 * to an "unavailable" result rather than throwing (Req 13.4).
 */
export function createEngine(): Engine {
  return new CompilerEngine();
}
