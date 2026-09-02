/**
 * File-scoped diagnostics (`validateFile`).
 *
 * Produces the diagnostics that need only a single buffer — no other files
 * required (Req 6.1). This is the live-buffer path: it reads the *unsaved*
 * content from the `TextDocuments` manager (Req 3.6), runs it through the
 * engine adapter exactly as `tomation compile` would (Req 5.1–5.3), maps the
 * results to LSP diagnostics via {@link toDiagnostics}, and publishes them so a
 * re-run *replaces* (never appends to) the file's prior set (Req 15.1).
 *
 * Pass sequence (design §5):
 *
 *   1. Read the live buffer. If the document isn't open, clear the file bucket
 *      (a no-op clear) and return.
 *   2. For a `.ts`/`.tsx` file, strip types first. A strip error yields exactly
 *      one Error diagnostic and stops — no parse, no cascade (Req 15.3). The
 *      raw (original TS) source is passed to `parseSource` as `rawSource`,
 *      matching the engine adapter's own pipeline behavior (Req 5.5).
 *   3. Parse the (stripped) source via the engine.
 *   4. Map `parsed.error` and `parsed.warnings` through the shared mapper.
 *      There is *no* validationError here — cross-file validation is
 *      project-scoped (task 5 / §6).
 *   5. Set the mapped diagnostics as this URI's *file-scoped* bucket in the
 *      shared {@link DiagnosticStore}, which republishes the union of the
 *      file- and project-scoped buckets so the two scopes merge instead of
 *      clobbering each other (design Flow B, Req 6.5).
 *
 * Resilience (Req 5.4, 15.2): the whole pass is wrapped in try/catch. Any
 * thrown error becomes a single Error diagnostic and the function returns
 * normally, so the provider keeps working for later edits rather than dying on
 * one bad buffer.
 *
 * Cancellation (Req 11.1): a superseded run (newer keystroke) bails without
 * publishing so stale results never overwrite fresh ones.
 *
 * Requirements: 3.6, 4.7, 5.4, 6.1, 6.5, 11.1, 15.1, 15.2, 15.3.
 */

import { TextDocuments, CancellationToken } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Engine } from '../engine/engine';
import { uriToFsPath } from '../util/uri';
import { toDiagnostics } from './diagnosticMapper';
import { DiagnosticStore } from './diagnosticStore';

/** Dependencies the file-diagnostics pass needs from the server bootstrap. */
export interface FileDiagnosticsDeps {
  documents: TextDocuments<TextDocument>;
  /**
   * The single, long-lived engine adapter (Req 11.5). Created once in the
   * server bootstrap and shared across every validation — never per-run.
   */
  engine: Engine;
  /**
   * The shared per-URI diagnostic store. File-scoped diagnostics are set as the
   * `file` bucket here so they merge with any project-scoped diagnostics for
   * the same URI instead of overwriting them (Req 6.5).
   */
  store: DiagnosticStore;
}

/** True when a file should be type-stripped before parsing (matches the CLI). */
function isTypeScript(filePath: string): boolean {
  return filePath.endsWith('.ts') || filePath.endsWith('.tsx');
}

/**
 * Validate a single open buffer and publish its file-scoped diagnostics.
 *
 * See the module header for the full pass sequence and resilience/cancellation
 * guarantees. Always resolves (never rejects) so a bad buffer can't take down
 * the provider (Req 5.4, 15.2).
 */
export async function validateFile(
  deps: FileDiagnosticsDeps,
  uri: string,
  token: CancellationToken
): Promise<void> {
  const { documents, engine, store } = deps;

  // 1. Read the live buffer. If it isn't open, clear the file bucket and return
  //    (Req 3.6). Any project-scoped diagnostics for the URI are preserved.
  const doc = documents.get(uri);
  if (!doc) {
    store.setFileDiagnostics(uri, []);
    return;
  }

  const documentText = doc.getText();
  const filePath = uriToFsPath(uri);

  try {
    let source = documentText;
    let rawSource: string | null = null;

    // 2. Strip types for .ts/.tsx. A strip error is a single, leading syntax
    //    error — emit one Error diagnostic and stop, no parse (Req 15.3).
    if (isTypeScript(filePath)) {
      rawSource = documentText;
      const stripResult = engine.stripTypes(documentText, filePath);
      if (stripResult.error) {
        if (token.isCancellationRequested) {
          return;
        }
        const diagnostics = toDiagnostics({
          parseError: stripResult.error,
          documentText,
        });
        store.setFileDiagnostics(uri, diagnostics);
        return;
      }
      source = stripResult.code;
    }

    // A newer keystroke may have superseded this run during stripping (Req 11.1).
    if (token.isCancellationRequested) {
      return;
    }

    // 3. Parse the (stripped) source via the engine.
    const parsed = engine.parseSource(source, filePath, rawSource);

    // The parse is the last async-ish step — bail if superseded (Req 11.1).
    if (token.isCancellationRequested) {
      return;
    }

    // 4. Map parse error + warnings. No validationError here — cross-file
    //    validation is project-scoped (§6). (Req 4.7, 6.1)
    const diagnostics = toDiagnostics({
      parseError: parsed.error ?? null,
      warnings: parsed.warnings ?? [],
      documentText,
    });

    // 5. Set the file bucket — the store republishes the merged file+project
    //    set, replacing the file's prior file-scoped set (Req 6.5, 15.1).
    store.setFileDiagnostics(uri, diagnostics);
  } catch (err) {
    // Resilience: a thrown error becomes a single Error diagnostic and the
    // provider keeps working for later edits (Req 5.4, 15.2). Don't publish a
    // stale error over a superseded run.
    if (token.isCancellationRequested) {
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    const diagnostics = toDiagnostics({
      parseError: { message },
      documentText,
    });
    store.setFileDiagnostics(uri, diagnostics);
  }
}
