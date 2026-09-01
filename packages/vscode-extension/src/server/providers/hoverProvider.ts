/**
 * Hover provider.
 *
 * PLACEHOLDER — task 7.4 owns the real implementation (docs-map descriptions,
 * element/task summaries). This minimal version defines the `provideHover`
 * contract the server bootstrap delegates to and returns null so built-in
 * TypeScript hover is untouched.
 */

import {
  Hover,
  HoverParams,
  TextDocuments,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ProjectIndex } from '../index/projectIndex';

/** Dependencies the hover provider needs. */
export interface HoverDeps {
  documents: TextDocuments<TextDocument>;
  getIndex(uri: string): ProjectIndex | undefined;
}

/**
 * Provide a Tomation hover for the symbol under the cursor, or null to defer
 * to built-in TypeScript hover. Returns null until task 7.4 implements the
 * real logic.
 */
export function provideHover(
  _deps: HoverDeps,
  _params: HoverParams
): Hover | null {
  return null;
}
