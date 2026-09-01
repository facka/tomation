/**
 * Project-scoped diagnostics (`validateProject`).
 *
 * Produces the **cross-file** diagnostics that a single buffer cannot — element
 * and task resolution across files plus `validateSpec` — by running the engine
 * adapter's full pipeline exactly as `tomation check` would (Req 6.2, 5.1–5.3).
 * It is gated on a project config file and always scoped to the one workspace
 * folder passed in, so multi-root workspaces validate each folder against its
 * own `tomation.config` (Req 6.6).
 *
 * Pass sequence (design §6):
 *
 *   1. Resolve the folder's cwd from `folderUri` and locate
 *      `tomation.config.ts`/`.js` on disk. If neither exists → clear any prior
 *      project diagnostics for the folder and return; file-scoped diagnostics
 *      still apply (Req 6.4).
 *   2. If a config exists but `engine.resolveProject(cwd)` fails, split on the
 *      failure kind:
 *      - A config read/parse failure (malformed/unreadable config, detected via
 *        {@link isConfigLoadError}) → SKIP project validation entirely for the
 *        folder and log — do NOT emit misleading errors, do NOT block
 *        file-scoped diagnostics (Req 6.2 malformed-config clarification).
 *      - Any other resolve failure (import cycle, unresolvable `~/` import) is a
 *        genuine cross-file error → do NOT skip; surface it against the config
 *        file at line 1 through the same failure-publishing path as pipeline
 *        errors (Req 6.3, 15.1).
 *   3. Otherwise run `engine.runProjectPipeline(cwd)`:
 *      - On success: clear any prior project-scoped diagnostics for the folder
 *        (file-scoped buckets stay intact via the merge store) (Req 6.3).
 *      - On failure: attribute per-file warnings to their `filePath:line` and
 *        attribute the single `validateSpec`/pipeline error to the folder's
 *        config file at line 1 (Req 6.3, 4.4).
 *   4. All project diagnostics are set through the shared {@link DiagnosticStore}
 *      so they *merge* with each URI's file-scoped diagnostics rather than
 *      overwriting them (design Flow B, Req 6.5).
 *
 * Isolation & resilience (Req 15.2): the whole pass is wrapped in try/catch, so
 * a thrown error neither crashes the server nor blocks other folders/files —
 * it is logged and swallowed. A per-file read failure while computing ranges
 * falls back to an empty document text rather than failing the whole folder.
 *
 * Cancellation (Req 11.1, 11.3): the scheduler coalesces per folder; a
 * superseded run bails before publishing so stale project results never
 * overwrite fresh ones.
 *
 * Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 15.2.
 */

import * as fs from 'fs';
import * as path from 'path';

import { CancellationToken } from 'vscode-languageserver/node';

import { Engine, EngineWarning } from '../engine/engine';
import { Logger } from '../output';
import { uriToFsPath, fsPathToUri } from '../util/uri';
import { toDiagnostics } from './diagnosticMapper';
import { DiagnosticStore } from './diagnosticStore';

/** The config filenames a Tomation project may use (Req 6.2). */
const CONFIG_FILENAMES = ['tomation.config.ts', 'tomation.config.js'];

/** Dependencies the project-diagnostics pass needs from the server bootstrap. */
export interface ProjectDiagnosticsDeps {
  /**
   * The single, long-lived engine adapter (Req 11.5). Created once in the
   * server bootstrap and shared across every validation — never per-run.
   */
  engine: Engine;
  /**
   * The shared per-URI diagnostic store. Project-scoped diagnostics are set as
   * the `project` bucket here so they merge with any file-scoped diagnostics
   * for the same URI instead of overwriting them (design Flow B, Req 6.5).
   */
  store: DiagnosticStore;
  /**
   * Output-channel logger. Malformed-config skips and isolated failures are
   * logged here rather than surfaced as misleading diagnostics (Req 6.2, 15.2).
   */
  logger: Logger;
}

/**
 * Tracks which URIs currently hold project-scoped diagnostics per folder, so a
 * later successful (or config-absent) run can clear exactly that folder's prior
 * project set without touching other folders (Req 6.6). Keyed by folder URI.
 *
 * This is module-level state intentionally: `validateProject` is invoked once
 * per folder per scheduled run, and the prior-URI set must persist across runs.
 */
const projectUrisByFolder = new Map<string, Set<string>>();

/**
 * Locate the project config file inside `cwd`, returning its absolute path or
 * `null` when neither `tomation.config.ts` nor `.js` exists (Req 6.2, 6.4).
 */
function findConfigFile(cwd: string): string | null {
  for (const name of CONFIG_FILENAMES) {
    const candidate = path.join(cwd, name);
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // An fs error probing a candidate is treated as "not this one".
    }
  }
  return null;
}

/**
 * Read a file's text from disk for whole-line range computation. Returns `''`
 * on any read failure so a single unreadable file degrades gracefully to a
 * 0-length range rather than failing the whole folder (Req 15.2).
 */
function readFileTextSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Run project-scoped (cross-file) validation for a single workspace folder and
 * publish the resulting diagnostics through the shared store.
 *
 * See the module header for the full pass sequence and isolation/cancellation
 * guarantees. Always resolves (never rejects) so one folder's failure can't
 * take down the server or block other folders/files (Req 15.2).
 */
export async function validateProject(
  deps: ProjectDiagnosticsDeps,
  folderUri: string,
  token: CancellationToken
): Promise<void> {
  const { engine, store, logger } = deps;
  const cwd = uriToFsPath(folderUri);

  try {
    // 1. Locate the config file. Absent → skip project validation, but clear
    //    any prior project diagnostics for the folder so a config that was just
    //    deleted doesn't leave stale errors behind (Req 6.4).
    const configPath = findConfigFile(cwd);
    if (!configPath) {
      clearFolderProjectDiagnostics(store, folderUri);
      return;
    }

    // 2. resolve() can fail two ways. A config read/parse failure means the
    //    config itself is malformed/unreadable → skip and log (Req 6.2). Any
    //    other failure (import cycle, unresolvable ~/ import) is a genuine
    //    cross-file error → surface it against the config file (Req 6.3).
    const resolveResult = engine.resolveProject(cwd);
    if (!resolveResult.ok) {
      const errorText = engineErrorText(resolveResult.error);
      if (isConfigLoadError(errorText)) {
        logger.log(
          'Skipping project validation for ' +
            cwd +
            ': tomation.config is malformed or unreadable' +
            (resolveResult.error ? ' (' + errorText + ')' : '') +
            '.'
        );
        return;
      }

      // Genuine cross-file resolve error — attribute it to the config file at
      // line 1 via the shared failure path (Req 6.3, 15.1). Handled here in the
      // pre-check so it isn't dropped; runProjectPipeline is not invoked so
      // there is no double-publish.
      publishFailureDiagnostics(store, folderUri, configPath, undefined, errorText);
      return;
    }

    // A newer save may have superseded this run during resolve (Req 11.1/11.3).
    if (token.isCancellationRequested) {
      return;
    }

    // 3. Run the full pipeline for the folder.
    const result = engine.runProjectPipeline(cwd);

    // The pipeline is the last heavy step — bail if superseded (Req 11.1).
    if (token.isCancellationRequested) {
      return;
    }

    if (result.ok) {
      // 3a. Success: clear the folder's prior project diagnostics. File-scoped
      //     buckets are untouched because the store merges per URI (Req 6.3).
      clearFolderProjectDiagnostics(store, folderUri);
      return;
    }

    // 3b. Failure: attribute warnings per file and the error to the config.
    publishFailureDiagnostics(store, folderUri, configPath, result.warnings, result.error);
  } catch (err) {
    // Isolation: a thrown error must not crash the server or block other
    // folders/files. Log and return (Req 15.2).
    const message = err instanceof Error ? err.message : String(err);
    logger.log('Project validation failed for ' + cwd + ': ' + message);
  }
}

/**
 * Build and publish project-scoped diagnostics for a failed pipeline run:
 * per-file warnings attributed to their `filePath:line`, and the single
 * pipeline/`validateSpec` error attributed to the config file at line 1
 * (Req 6.3, 4.4). Replaces the folder's prior project set so stale entries from
 * an earlier run vanish (Req 15.1).
 */
function publishFailureDiagnostics(
  store: DiagnosticStore,
  folderUri: string,
  configPath: string,
  warnings: EngineWarning[] | undefined,
  error: string | undefined
): void {
  // Accumulate this run's project diagnostics per URI before publishing, so
  // multiple warnings for the same file collapse into one publish.
  const byUri = new Map<string, EngineWarning[]>();

  for (const warning of warnings ?? []) {
    if (!warning.filePath) {
      // A warning without a file can't be attributed to a buffer; pin it to the
      // config file so it stays visible rather than being dropped (Req 6.3).
      pushWarning(byUri, fsPathToUri(configPath), warning);
      continue;
    }
    pushWarning(byUri, fsPathToUri(warning.filePath), warning);
  }

  // The single pipeline/validateSpec error has no file/line → config line 1.
  const configUri = fsPathToUri(configPath);

  // The set of URIs this run will publish project diagnostics for.
  const newProjectUris = new Set<string>();

  // Per-file warnings → mapped diagnostics attributed to each file's URI.
  for (const [uri, fileWarnings] of byUri) {
    const documentText = readFileTextSafe(uriToFsPath(uri));
    const diagnostics = toDiagnostics({ warnings: fileWarnings, documentText });
    // If this URI is also the config URI, defer to the merge below so the
    // validation error is included in a single publish for the config file.
    if (uri === configUri && error) {
      const withError = toDiagnostics({
        warnings: fileWarnings,
        validationError: error,
        documentText,
      });
      store.setProjectDiagnostics(uri, withError);
    } else {
      store.setProjectDiagnostics(uri, diagnostics);
    }
    newProjectUris.add(uri);
  }

  // The validation error attributed to the config file, when the config URI had
  // no warnings of its own (otherwise it was merged in above).
  if (error && !byUri.has(configUri)) {
    const diagnostics = toDiagnostics({ validationError: error, documentText: '' });
    store.setProjectDiagnostics(configUri, diagnostics);
    newProjectUris.add(configUri);
  }

  // Clear any prior project URIs for this folder that are no longer present in
  // this run, then record the new set (Req 15.1 replace-not-append).
  const prior = projectUrisByFolder.get(folderUri) ?? new Set<string>();
  for (const uri of prior) {
    if (!newProjectUris.has(uri)) {
      store.setProjectDiagnostics(uri, []);
    }
  }
  projectUrisByFolder.set(folderUri, newProjectUris);
}

/** Append a warning to the per-URI accumulation map. */
function pushWarning(
  byUri: Map<string, EngineWarning[]>,
  uri: string,
  warning: EngineWarning
): void {
  const existing = byUri.get(uri);
  if (existing) {
    existing.push(warning);
  } else {
    byUri.set(uri, [warning]);
  }
}

/**
 * Clear all project-scoped diagnostics previously published for `folderUri`,
 * leaving each URI's file-scoped bucket intact (Req 6.3 success / 6.4 absent).
 */
function clearFolderProjectDiagnostics(
  store: DiagnosticStore,
  folderUri: string
): void {
  const prior = projectUrisByFolder.get(folderUri);
  if (prior) {
    for (const uri of prior) {
      store.setProjectDiagnostics(uri, []);
    }
  }
  projectUrisByFolder.set(folderUri, new Set<string>());
}

/**
 * Decide whether a `resolveProject` error text indicates the config file itself
 * could not be read/parsed — as opposed to a genuine cross-file error (import
 * cycle, unresolvable `~/` import).
 *
 * The compiler's resolver distinguishes these by message. Config read/parse
 * failures produce one of (see resolver.js):
 *   - "tomation.config.js not found in current directory"
 *   - "Failed to parse tomation.config.ts: ..."
 *   - "Failed to load tomation.config.ts: ..."
 * Cycle and unresolvable-import errors do not match these shapes.
 *
 * Matching is case-insensitive substring based. The config file was already
 * confirmed to exist on disk by {@link findConfigFile} before resolve ran, so a
 * "not found" here is a rare race — it is still treated as a config-load skip
 * (Req 6.2).
 */
function isConfigLoadError(errorText: string): boolean {
  const text = errorText.toLowerCase();
  if (text.includes('tomation.config') && text.includes('not found')) {
    return true;
  }
  if (text.includes('failed to parse tomation.config')) {
    return true;
  }
  if (text.includes('failed to load tomation.config')) {
    return true;
  }
  return false;
}

/** Normalize a resolve() error (string or `{ message }`) to text. */
function engineErrorText(error: unknown): string {
  if (!error) {
    return 'unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && 'message' in (error as Record<string, unknown>)) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}
