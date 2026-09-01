/**
 * Project-scoped diagnostics.
 *
 * PLACEHOLDER — task 5.1 owns the real implementation (locate config, run the
 * pipeline, attribute errors per file, merge with file-scoped, multi-root).
 * This minimal version defines the `validateProject` contract the server
 * bootstrap schedules against, keyed per workspace folder.
 */

import { Connection, CancellationToken } from 'vscode-languageserver/node';

/** Dependencies the project-diagnostics pass needs from the server bootstrap. */
export interface ProjectDiagnosticsDeps {
  connection: Connection;
}

/**
 * Run project-scoped (cross-file) validation for a single workspace folder.
 *
 * The real implementation (task 5.1) locates `tomation.config.{ts,js}`, runs
 * the engine pipeline, and publishes attributed diagnostics. For now it is a
 * no-op so the wiring compiles and the scheduler path is exercised.
 */
export async function validateProject(
  _deps: ProjectDiagnosticsDeps,
  _folderUri: string,
  _token: CancellationToken
): Promise<void> {
  // No-op until task 5.1 implements project-scoped validation.
}
