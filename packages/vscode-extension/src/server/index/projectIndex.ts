/**
 * Project Symbol Index.
 *
 * The in-memory model of every element and task declared across a workspace
 * folder's DSL files (Req 7.1). It is the data source the authoring providers
 * read from: completions list element/task names, hover shows an element's
 * tag/label/where summary, and go-to-definition jumps to the declaring file
 * and line (Req 7.2).
 *
 * Keys match compiled output (Req 7.4): each symbol is keyed by its
 * `Namespace__variableName` (elements) / `Namespace__taskName` (tasks) exactly
 * as `extractPom` in `packages/compiler/src/pom.js` produces them. The
 * namespace comes from {@link Engine.deriveNamespace} over the file path and
 * the project's POM root, and cross-file references resolve through
 * {@link Engine.resolveSpecifier} over each file's `imports[]`.
 *
 * One index per workspace folder (Req 7.6) — the server bootstrap keys them by
 * folder URI. Each index owns a single `folderCwd` and lazily resolves that
 * folder's project (config + POM root + base URL) the first time it needs to
 * derive a namespace.
 *
 * Incremental maintenance (Req 7.3): the server drives `updateFile`/
 * `removeFile` through the debounce scheduler on open/change/save/delete. The
 * index keeps a `byFile` map (keyed by file URI) recording which namespaced
 * keys each file contributed, so an update first removes the file's prior
 * symbols and then re-inserts, and a delete removes them outright. This module
 * does NOT debounce — the scheduler in the server owns that.
 *
 * Fallback without `tomation.config` (Req 7.5): when the folder cannot be
 * resolved (no config) the index still works — it derives namespaces with
 * `pomDir = null` and `baseUrl = folderCwd`, indexes whatever open/edited file
 * triggered the update, and follows that file's resolvable POM imports so
 * completions/definitions work across files even without a project config.
 *
 * Resilience (Req 7.1–7.5): no method throws. Reading, type-stripping, and
 * parsing are wrapped in try/catch and skipped gracefully on error, mirroring
 * the defensive style in `fileDiagnostics.ts` and `engine.ts`.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6.
 */

import * as fs from 'fs';

import { TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Engine, ParsedFile } from '../engine/engine';
import { fileKind, isDslFile } from '../util/dslFile';
import { fsPathToUri, uriToFsPath } from '../util/uri';

// ---------------------------------------------------------------------------
// Symbol shapes and the ProjectIndex contract (stable — providers depend on it)
// ---------------------------------------------------------------------------

/** A declared element symbol, keyed by its resolved namespaced key. */
export interface ElementSymbol {
  variableName: string;
  namespacedKey: string;
  tag: string;
  label: string | null;
  whereSummary: string;
  filePath: string;
  line: number;
}

/** A declared task symbol, keyed by its resolved namespaced key. */
export interface TaskSymbol {
  name: string;
  namespacedKey: string;
  label: string | null;
  paramNames: string[];
  filePath: string;
  line: number;
}

/**
 * Per-workspace-folder in-memory model of declared elements and tasks. The
 * server bootstrap drives `updateFile`/`removeFile` through the scheduler and
 * the providers read `elements`/`tasks`.
 */
export interface ProjectIndex {
  elements: Map<string, ElementSymbol>;
  tasks: Map<string, TaskSymbol>;
  byFile: Map<string, { elements: string[]; tasks: string[] }>;
  /** Re-parse a single file and refresh its symbols. */
  updateFile(uri: string): void;
  /** Remove a file's symbols (on delete). */
  removeFile(uri: string): void;
}

/** Dependencies the real index needs from the server bootstrap (Req 7.6). */
export interface ProjectIndexDeps {
  /** The single, long-lived engine adapter — the sole boundary to the compiler. */
  engine: Engine;
  /** Live buffers: open files are read from here, closed files from disk. */
  documents: TextDocuments<TextDocument>;
  /** The workspace folder's filesystem path (from its URI via `uriToFsPath`). */
  folderCwd: string;
}

// ---------------------------------------------------------------------------
// Parser output shapes (minimal structural view; the compiler is untyped)
// ---------------------------------------------------------------------------

/** A parsed element declaration (`parsed.elements[]` — see parser.js). */
interface ParsedElement {
  variableName: string;
  tag: string;
  label?: string | null;
  where?: Record<string, unknown>;
  line: number;
}

/** A parsed task declaration (`parsed.tasks[]` — see parser.js). */
interface ParsedTask {
  name: string;
  label?: string | null;
  params?: string[];
  line: number;
}

/** A parsed import (`parsed.imports[]` — see parser.js). */
interface ParsedImport {
  localName: string;
  importPath: string;
  named?: boolean;
}

// ---------------------------------------------------------------------------
// whereSummary (Req 7.2 — the human-readable summary providers render)
// ---------------------------------------------------------------------------

/**
 * Build a short, deterministic summary from a `where` matcher object, e.g.
 * `{ id: 'login-btn' }` → `id="login-btn"`. Multiple entries are joined with a
 * space in declaration order. Non-string values are stringified; an empty or
 * missing map yields an empty string.
 */
function summarizeWhere(where: Record<string, unknown> | undefined): string {
  if (!where) {
    return '';
  }
  const parts: string[] = [];
  for (const key of Object.keys(where)) {
    const value = where[key];
    const text = typeof value === 'string' ? value : String(value);
    parts.push(key + '="' + text + '"');
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Concrete Project Index. See the module header for the full design; the
 * per-method comments below reference the specific requirements they satisfy.
 */
class ProjectIndexImpl implements ProjectIndex {
  readonly elements = new Map<string, ElementSymbol>();
  readonly tasks = new Map<string, TaskSymbol>();
  /** Keyed by file URI (chosen consistently over fsPath — see updateFile). */
  readonly byFile = new Map<string, { elements: string[]; tasks: string[] }>();

  private readonly engine: Engine;
  private readonly documents: TextDocuments<TextDocument>;
  private readonly folderCwd: string;

  /** Cached project resolution for this folder (Req 7.4/7.5), resolved lazily. */
  private projectResolved = false;
  private pomDir: string | null = null;
  private baseUrl = '';

  constructor(deps: ProjectIndexDeps) {
    this.engine = deps.engine;
    this.documents = deps.documents;
    this.folderCwd = deps.folderCwd;
    this.baseUrl = deps.folderCwd;
  }

  /**
   * Re-parse a single file and refresh its symbols (Req 7.3). Removes the
   * file's prior symbols first (so a rename/delete of a declaration is
   * reflected), then re-parses and re-inserts. Also follows the file's
   * resolvable POM imports so cross-file references are indexed even without a
   * `tomation.config` (Req 7.5). Never throws.
   */
  updateFile(uri: string): void {
    // `visited` guards against re-indexing the same reachable file and against
    // infinite recursion through mutual imports (Req 7.5).
    const visited = new Set<string>();
    this.indexFile(uri, visited);
  }

  /**
   * Remove a file's symbols and its `byFile` entry (on delete — Req 7.3).
   * Never throws.
   */
  removeFile(uri: string): void {
    this.forgetFile(uri);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Lazily resolve this folder's project once, caching `pomDir`/`baseUrl`.
   * When there is no `tomation.config` (or resolution fails) fall back to
   * `pomDir = null` and `baseUrl = folderCwd` and keep indexing (Req 7.5).
   */
  private ensureProjectResolved(): void {
    if (this.projectResolved) {
      return;
    }
    this.projectResolved = true;
    try {
      const result = this.engine.resolveProject(this.folderCwd);
      if (result.ok) {
        this.pomDir = result.pomDir ?? null;
        this.baseUrl = result.baseUrl ?? this.folderCwd;
        return;
      }
    } catch {
      // Fall through to the fallback below.
    }
    // Fallback (Req 7.5): no config / resolve failed.
    this.pomDir = null;
    this.baseUrl = this.folderCwd;
  }

  /**
   * Index one DSL file and recurse into its resolvable POM imports (Req 7.2,
   * 7.5). `visited` is keyed by fsPath to dedupe reachable files. Never throws.
   */
  private indexFile(uri: string, visited: Set<string>): void {
    if (!isDslFile(uri)) {
      return;
    }
    const fsPath = uriToFsPath(uri);
    if (visited.has(fsPath)) {
      return;
    }
    visited.add(fsPath);

    const source = this.readSource(uri, fsPath);
    if (source === null) {
      // Read failure — forget any stale symbols for this file and stop.
      this.forgetFile(uri);
      return;
    }

    const parsed = this.parse(source, fsPath);
    if (!parsed) {
      this.forgetFile(uri);
      return;
    }

    this.ensureProjectResolved();

    // Replace this file's prior symbols with the freshly parsed set (Req 7.3).
    this.forgetFile(uri);
    this.indexSymbols(uri, fsPath, parsed);

    // Follow resolvable POM imports so cross-file refs work (Req 7.2, 7.5).
    this.indexReachableImports(fsPath, parsed, visited);
  }

  /**
   * Read a file's content: prefer the open live buffer, else read from disk
   * (Req 7.3/7.5). Returns `null` on a disk read failure (no throw).
   */
  private readSource(uri: string, fsPath: string): string | null {
    const open = this.documents.get(uri)?.getText();
    if (typeof open === 'string') {
      return open;
    }
    try {
      return fs.readFileSync(fsPath, 'utf8');
    } catch {
      return null;
    }
  }

  /**
   * Type-strip (for `.ts`/`.tsx`) then parse a source into a {@link ParsedFile}
   * (Req 7.1). Passes the raw TS source as `rawSource`, matching the engine
   * adapter and `fileDiagnostics.ts`. Returns `null` when stripping/parsing
   * errors or the engine is unavailable — the file is skipped gracefully.
   */
  private parse(source: string, fsPath: string): ParsedFile | null {
    try {
      let code = source;
      let rawSource: string | null = null;
      if (fsPath.endsWith('.ts') || fsPath.endsWith('.tsx')) {
        rawSource = source;
        const stripped = this.engine.stripTypes(source, fsPath);
        if (stripped.error) {
          return null;
        }
        code = stripped.code;
      }
      const parsed = this.engine.parseSource(code, fsPath, rawSource, {
        baseUrl: this.baseUrl,
      });
      if (parsed.error) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Extract element/task symbols from a parsed file and insert them under
   * their namespaced keys (Req 7.1, 7.4). Records the contributed keys in
   * `byFile` (keyed by URI) for later incremental removal (Req 7.3). Only POM
   * files declare elements/tasks, so files without them contribute nothing.
   */
  private indexSymbols(uri: string, fsPath: string, parsed: ParsedFile): void {
    const elements = (parsed.elements as ParsedElement[] | undefined) ?? [];
    const tasks = (parsed.tasks as ParsedTask[] | undefined) ?? [];
    if (elements.length === 0 && tasks.length === 0) {
      return;
    }

    // Derive the namespace exactly as extractPom does (Req 7.4). A null result
    // (e.g. underscore filename) means we skip this file's symbols gracefully.
    const namespace = this.engine.deriveNamespace(fsPath, this.pomDir);
    if (namespace === null) {
      return;
    }
    const prefix = namespace + '__';

    const contributed = { elements: [] as string[], tasks: [] as string[] };

    for (const el of elements) {
      if (!el || typeof el.variableName !== 'string') {
        continue;
      }
      const namespacedKey = prefix + el.variableName;
      this.elements.set(namespacedKey, {
        variableName: el.variableName,
        namespacedKey,
        tag: el.tag,
        label: el.label ?? null,
        whereSummary: summarizeWhere(el.where),
        filePath: fsPath,
        line: el.line,
      });
      contributed.elements.push(namespacedKey);
    }

    for (const task of tasks) {
      if (!task || typeof task.name !== 'string') {
        continue;
      }
      const namespacedKey = prefix + task.name;
      this.tasks.set(namespacedKey, {
        name: task.name,
        namespacedKey,
        label: task.label ?? null,
        paramNames: Array.isArray(task.params) ? task.params : [],
        filePath: fsPath,
        line: task.line,
      });
      contributed.tasks.push(namespacedKey);
    }

    if (contributed.elements.length > 0 || contributed.tasks.length > 0) {
      this.byFile.set(uri, contributed);
    }
  }

  /**
   * Resolve a file's imports via {@link Engine.resolveSpecifier} and index each
   * reachable POM DSL file not already visited (Req 7.2, 7.5). This is what
   * makes cross-file completions/definitions work without a `tomation.config`.
   */
  private indexReachableImports(
    fsPath: string,
    parsed: ParsedFile,
    visited: Set<string>
  ): void {
    const imports = (parsed.imports as ParsedImport[] | undefined) ?? [];
    for (const imp of imports) {
      if (!imp || typeof imp.importPath !== 'string') {
        continue;
      }
      const resolvedPath = this.engine.resolveSpecifier(
        imp.importPath,
        fsPath,
        this.baseUrl
      );
      if (!resolvedPath) {
        continue;
      }
      // Only follow POM DSL files (they declare the elements/tasks we index).
      if (fileKind(resolvedPath) !== 'pom') {
        continue;
      }
      if (visited.has(resolvedPath)) {
        continue;
      }
      this.indexFile(fsPathToUri(resolvedPath), visited);
    }
  }

  /**
   * Drop every symbol a file previously contributed and clear its `byFile`
   * entry (Req 7.3). Safe to call for a file that was never indexed.
   */
  private forgetFile(uri: string): void {
    const prior = this.byFile.get(uri);
    if (!prior) {
      return;
    }
    for (const key of prior.elements) {
      this.elements.delete(key);
    }
    for (const key of prior.tasks) {
      this.tasks.delete(key);
    }
    this.byFile.delete(uri);
  }
}

/**
 * Create the Project Index for a single workspace folder (Req 7.6). The
 * server bootstrap constructs one per folder, passing the shared engine, the
 * live-buffer manager, and the folder's filesystem path.
 */
export function createProjectIndex(deps: ProjectIndexDeps): ProjectIndex {
  return new ProjectIndexImpl(deps);
}
