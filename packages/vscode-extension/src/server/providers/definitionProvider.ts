/**
 * Definition provider.
 *
 * PLACEHOLDER — task 7.5 owns the real implementation (element/task
 * go-to-definition via the index). This minimal version defines the
 * `provideDefinition` contract the server bootstrap delegates to and returns
 * null so built-in TypeScript go-to-definition is untouched.
 */

import {
  Definition,
  DefinitionParams,
  TextDocuments,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ProjectIndex } from '../index/projectIndex';

/** Dependencies the definition provider needs. */
export interface DefinitionDeps {
  documents: TextDocuments<TextDocument>;
  getIndex(uri: string): ProjectIndex | undefined;
}

/**
 * Provide a Tomation definition location for the reference under the cursor,
 * or null to defer to built-in TypeScript go-to-definition. Returns null until
 * task 7.5 implements the real logic.
 */
export function provideDefinition(
  _deps: DefinitionDeps,
  _params: DefinitionParams
): Definition | null {
  return null;
}
