/**
 * Definition provider.
 *
 * Go-to-definition for Tomation element and task references (design §11). When
 * the cursor sits on an element name (`loginButton`) or a task name — either
 * bare or in dotted `Namespace.member` form (`Login.submitButton`) — this
 * resolves it against the project index and returns an LSP {@link Location}
 * pointing at the declaration's file and line (Req 10.1, 10.2). Because the
 * index records each symbol's declaring `filePath`, the returned location may
 * live in a different DSL file, which naturally opens that file when the
 * reference is cross-file (Req 10.3).
 *
 * When the identifier under the cursor is not a Tomation element/task (it is
 * absent from the index), this returns null so VS Code's built-in TypeScript
 * go-to-definition handles it instead (Req 10.4). An identifier that looks like
 * a reference but resolves to nothing likewise returns no result rather than
 * navigating incorrectly (Req 10.5).
 *
 * The feature is gated by the `hover.enabled` setting (Req 12.6): the server
 * bootstrap checks that flag before delegating here, per design §11. Returning
 * null on any failure remains correct regardless of that gate.
 *
 * Resilience: this never throws. The symbol scan, index lookup, and location
 * construction are wrapped defensively; any error yields null so the caller
 * falls back to TypeScript, mirroring the no-throw style of the other
 * providers and the index.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 12.6.
 */

import {
  Definition,
  DefinitionParams,
  Location,
  Range,
  TextDocuments,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  ElementSymbol,
  ProjectIndex,
  TaskSymbol,
} from '../index/projectIndex';
import { symbolAt } from './positionContext';
import { fsPathToUri } from '../util/uri';

/** Dependencies the definition provider needs. */
export interface DefinitionDeps {
  documents: TextDocuments<TextDocument>;
  getIndex(uri: string): ProjectIndex | undefined;
}

/**
 * Provide a Tomation definition location for the reference under the cursor,
 * or null to defer to built-in TypeScript go-to-definition.
 *
 * Flow (see module header for the requirement mapping):
 *  1. Find the identifier under the cursor via {@link symbolAt}; no identifier
 *     → null (defer to TypeScript, Req 10.4).
 *  2. Resolve it against the workspace folder's index — an element or task
 *     matched by bare name or dotted `Namespace.member` form (Req 10.1, 10.2).
 *  3. On a match, return a {@link Location} at the declaration's file + line;
 *     this opens the other DSL file when cross-file (Req 10.3).
 *  4. No index or no match → null (Req 10.4, 10.5).
 */
export function provideDefinition(
  deps: DefinitionDeps,
  params: DefinitionParams
): Definition | null {
  try {
    const uri = params.textDocument.uri;
    const document = deps.documents.get(uri);
    if (!document) {
      return null;
    }

    // 1. What identifier is under the cursor? (Req 10.1)
    const symbol = symbolAt(document, params.position);
    if (!symbol) {
      // Not on an identifier — defer to TypeScript (Req 10.4).
      return null;
    }

    // 5. No index for this folder yet — defer to TypeScript (Req 10.4).
    const index = deps.getIndex(uri);
    if (!index) {
      return null;
    }

    // 2. Resolve against the index. Elements are checked before tasks (see
    //    resolveSymbol) so an element reference wins when a name is ambiguous.
    const resolved = resolveSymbol(index, symbol.word, symbol.dotted);
    if (!resolved) {
      // Looks like an identifier but is not a Tomation element/task, or is an
      // unresolved reference — return no result (Req 10.4, 10.5).
      return null;
    }

    // 3. Point at the declaration line, opening the other file when cross-file
    //    (Req 10.2, 10.3).
    return toLocation(resolved.filePath, resolved.line);
  } catch {
    // Never throw — any failure defers to TypeScript.
    return null;
  }
}

/**
 * A resolved declaration target: just the pieces needed to build a location.
 */
interface ResolvedTarget {
  filePath: string;
  line: number;
}

/**
 * Match the identifier under the cursor to an indexed element or task
 * (Req 10.1, 10.2).
 *
 * Two forms are accepted:
 *  - bare `word` — the element `variableName` or task `name`;
 *  - dotted `Namespace.member` — a namespaced key ending in
 *    `Namespace__member` (the compiled key form the index uses, Req 7.4).
 *
 * Resolution ordering: **elements are checked before tasks**. Element and task
 * names live in the same reference space in authored DSL, so a single ordering
 * is chosen for determinism; elements are the more common go-to-definition
 * target, so they take precedence. The dotted form is tried first within each
 * kind (it is more specific), then the bare name.
 *
 * The index maps are keyed by namespaced key, so lookups iterate the values.
 * Returns null when nothing matches (Req 10.5).
 */
function resolveSymbol(
  index: ProjectIndex,
  word: string,
  dotted: string | undefined
): ResolvedTarget | null {
  // The dotted `Namespace.member` form maps to a namespaced key suffix
  // `Namespace__member` (Req 7.4). Compare against that suffix.
  const dottedSuffix = dotted ? dotted.replace('.', '__') : null;

  // Prefer an element match (see ordering note above).
  const element = findElement(index, word, dottedSuffix);
  if (element) {
    return { filePath: element.filePath, line: element.line };
  }

  const task = findTask(index, word, dottedSuffix);
  if (task) {
    return { filePath: task.filePath, line: task.line };
  }

  return null;
}

/**
 * Find an element by dotted `Namespace__member` key suffix (preferred) or by
 * bare `variableName`. Returns null when no element matches.
 */
function findElement(
  index: ProjectIndex,
  word: string,
  dottedSuffix: string | null
): ElementSymbol | null {
  let bareMatch: ElementSymbol | null = null;
  for (const el of index.elements.values()) {
    if (dottedSuffix && el.namespacedKey.endsWith(dottedSuffix)) {
      return el;
    }
    if (!bareMatch && el.variableName === word) {
      bareMatch = el;
    }
  }
  // Only fall back to a bare-name match when there was no dotted qualifier;
  // a dotted reference must match its namespace, not merely the member name.
  return dottedSuffix ? null : bareMatch;
}

/**
 * Find a task by dotted `Namespace__member` key suffix (preferred) or by bare
 * `name`. Returns null when no task matches.
 */
function findTask(
  index: ProjectIndex,
  word: string,
  dottedSuffix: string | null
): TaskSymbol | null {
  let bareMatch: TaskSymbol | null = null;
  for (const task of index.tasks.values()) {
    if (dottedSuffix && task.namespacedKey.endsWith(dottedSuffix)) {
      return task;
    }
    if (!bareMatch && task.name === word) {
      bareMatch = task;
    }
  }
  return dottedSuffix ? null : bareMatch;
}

/**
 * Build an LSP {@link Location} for a declaration at `filePath` and 1-based
 * `line`. The filesystem path is converted to a `file://` URI so VS Code can
 * open the declaring file (cross-file when it differs from the request URI —
 * Req 10.3). The 1-based `line` is converted to a 0-based LSP range targeting
 * the start of the declaration line; a non-positive line clamps to line 0.
 */
function toLocation(filePath: string, line: number): Location {
  const zeroBased = line > 0 ? line - 1 : 0;
  const range = Range.create(zeroBased, 0, zeroBased, 0);
  return Location.create(fsPathToUri(filePath), range);
}
