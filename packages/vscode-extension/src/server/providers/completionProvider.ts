/**
 * Completion provider.
 *
 * PLACEHOLDER — task 7.3 owns the real implementation (position classification,
 * tag/chain/matcher/element/task/action items). This minimal version defines
 * the `provideCompletion` contract the server bootstrap delegates to and
 * returns no items so built-in TypeScript completions are untouched.
 */

import {
  CompletionItem,
  CompletionParams,
  TextDocuments,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ProjectIndex } from '../index/projectIndex';

/** Dependencies the completion provider needs. */
export interface CompletionDeps {
  documents: TextDocuments<TextDocument>;
  getIndex(uri: string): ProjectIndex | undefined;
}

/**
 * Provide Tomation completions for the cursor position, supplementing (never
 * suppressing) built-in TypeScript completions. Returns an empty list until
 * task 7.3 implements the real logic.
 */
export function provideCompletion(
  _deps: CompletionDeps,
  _params: CompletionParams
): CompletionItem[] {
  return [];
}
