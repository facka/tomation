/**
 * File-scoped diagnostics.
 *
 * PLACEHOLDER — task 4.2 owns the real implementation (strip → parse → map →
 * publish, wrapped in try/catch). This minimal version defines the
 * `validateFile` contract the server bootstrap schedules against. It publishes
 * an empty diagnostic set (a no-op clear) until the real logic lands.
 */

import { Connection, TextDocuments, CancellationToken } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/** Dependencies the file-diagnostics pass needs from the server bootstrap. */
export interface FileDiagnosticsDeps {
  connection: Connection;
  documents: TextDocuments<TextDocument>;
}

/**
 * Validate a single open buffer and publish its file-scoped diagnostics.
 *
 * The real implementation (task 4.2) reads the live buffer, strips types for
 * `.ts`, parses via the engine, maps results, and publishes them (replacing
 * the prior set). For now it publishes an empty set so re-validation clears
 * stale problems and the wiring is exercised end to end.
 */
export async function validateFile(
  deps: FileDiagnosticsDeps,
  uri: string,
  _token: CancellationToken
): Promise<void> {
  deps.connection.sendDiagnostics({ uri, diagnostics: [] });
}
