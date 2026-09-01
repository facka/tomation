/**
 * Hover provider.
 *
 * Surfaces a concise Tomation hover for the symbol under the cursor (design
 * §9). Three kinds of target are recognized, resolved in the order below:
 *
 *  1. **DSL symbol docs** (Req 9.1): a known DSL keyword — action, construct,
 *     matcher factory, builder method, the `is` proxy, or an ambient helper —
 *     renders its {@link DslDoc} description (and signature, when present) from
 *     the static docs table. This is checked first for a *bare* word so
 *     `Click`, `where`, `idIs`, … always show their documentation.
 *  2. **Element reference** (Req 9.2): a user-defined element name resolves to
 *     an {@link ElementSymbol} in the project index and renders its tag, label
 *     (if any), where-summary (if any), and declaration location.
 *  3. **Task reference** (Req 9.3): a user-defined task name resolves to a
 *     {@link TaskSymbol} in the index and renders its name and declaration
 *     location.
 *  4. Otherwise **null** (Req 9.4) so built-in TypeScript hover is used.
 *
 * Resolution-ordering rationale: DSL keyword names (from the docs table) and
 * user symbol names (from the index) occupy disjoint spaces in practice — a
 * `word` like `Click` is a DSL keyword while `loginButton` is an element — so
 * checking docs first for a bare word, then the element index, then the task
 * index, yields the intuitive result without collisions. When the cursor sits
 * on a *dotted* member expression (`Login.submitButton`) the target is
 * unambiguously a user reference, so the docs step is skipped and the index is
 * consulted directly (element before task).
 *
 * Symbol resolution against the index (Req 9.2, 9.3): the index maps are keyed
 * by `Namespace__member`, so this provider iterates `values()`. A bare `word`
 * matches a symbol's `variableName`/`name`; a `dotted` `Namespace.member`
 * matches when the symbol's `namespacedKey` equals `Namespace__member` (or,
 * defensively, ends with `__member` for the same member).
 *
 * The `hover.enabled` gate (Req 12.6) is enforced by the server bootstrap
 * before this provider is called; returning null on any miss or error here is
 * still correct and keeps the feature inert when it has nothing to add.
 *
 * Defensive throughout (design §9): every lookup is wrapped so the provider
 * never throws — on any error it returns null and TypeScript hover takes over.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 12.6.
 */

import {
  Hover,
  HoverParams,
  MarkupKind,
  TextDocuments,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  ProjectIndex,
  ElementSymbol,
  TaskSymbol,
} from '../index/projectIndex';
import { lookupDoc } from './docs';
import { symbolAt, SymbolAt } from './positionContext';

/** Dependencies the hover provider needs. */
export interface HoverDeps {
  documents: TextDocuments<TextDocument>;
  getIndex(uri: string): ProjectIndex | undefined;
}

/**
 * Provide a Tomation hover for the symbol under the cursor, or null to defer
 * to built-in TypeScript hover (Req 9.1–9.4). Never throws.
 */
export function provideHover(
  deps: HoverDeps,
  params: HoverParams
): Hover | null {
  try {
    const uri = params.textDocument.uri;
    const document = deps.documents.get(uri);
    if (!document) {
      return null;
    }

    // 1. Identify the symbol under the cursor (Req 9.4: none → defer to TS).
    const symbol = symbolAt(document, params.position);
    if (!symbol) {
      return null;
    }

    const index = deps.getIndex(uri);

    // When the cursor is on a dotted member (`Namespace.member`), the target is
    // a user reference — resolve against the index directly (element, then
    // task) and skip the docs step (Req 9.2, 9.3).
    if (symbol.dotted) {
      const element = index ? resolveElement(index, symbol) : undefined;
      if (element) {
        return markdownHover(renderElement(element));
      }
      const task = index ? resolveTask(index, symbol) : undefined;
      if (task) {
        return markdownHover(renderTask(task));
      }
      return null;
    }

    // 2. Bare word: prefer DSL keyword docs (Req 9.1). DSL keywords and
    //    user-defined symbol names do not collide in practice.
    const doc = lookupDoc(symbol.word);
    if (doc) {
      return markdownHover(renderDoc(doc));
    }

    // 3. Element reference (Req 9.2).
    const element = index ? resolveElement(index, symbol) : undefined;
    if (element) {
      return markdownHover(renderElement(element));
    }

    // 4. Task reference (Req 9.3).
    const task = index ? resolveTask(index, symbol) : undefined;
    if (task) {
      return markdownHover(renderTask(task));
    }

    // 5. Nothing matched — defer to built-in TypeScript hover (Req 9.4).
    return null;
  } catch {
    // Never throw: on any failure, defer to TypeScript (Req 9.4).
    return null;
  }
}

// ---------------------------------------------------------------------------
// Index resolution (Req 9.2, 9.3) — maps are keyed by `Namespace__member`.
// ---------------------------------------------------------------------------

/**
 * Resolve the element the symbol refers to, matching a bare `word` against
 * `variableName` and a `dotted` `Namespace.member` against the symbol's
 * `namespacedKey` (Req 9.2). Iterates `elements.values()` since the map is
 * keyed by namespaced key. Returns `undefined` when nothing matches.
 */
function resolveElement(
  index: ProjectIndex,
  symbol: SymbolAt
): ElementSymbol | undefined {
  for (const element of index.elements.values()) {
    if (matchesSymbol(symbol, element.variableName, element.namespacedKey)) {
      return element;
    }
  }
  return undefined;
}

/**
 * Resolve the task the symbol refers to, matching a bare `word` against `name`
 * and a `dotted` form against `namespacedKey` (Req 9.3). Returns `undefined`
 * when nothing matches.
 */
function resolveTask(
  index: ProjectIndex,
  symbol: SymbolAt
): TaskSymbol | undefined {
  for (const task of index.tasks.values()) {
    if (matchesSymbol(symbol, task.name, task.namespacedKey)) {
      return task;
    }
  }
  return undefined;
}

/**
 * Whether a resolved symbol (identified by its bare `member` name and its
 * `namespacedKey`) is the target of the cursor's {@link SymbolAt}.
 *
 * For a dotted `Namespace.member` the match is exact on the namespaced key
 * (`Namespace__member`), with a defensive suffix fallback (`__member` for the
 * same member) in case of namespace derivation nuances. For a bare word the
 * match is on the member name alone.
 */
function matchesSymbol(
  symbol: SymbolAt,
  member: string,
  namespacedKey: string
): boolean {
  if (symbol.dotted) {
    const parsed = splitDotted(symbol.dotted);
    if (!parsed) {
      return false;
    }
    // The member portion of the reference must match the symbol's own member.
    if (parsed.member !== member) {
      return false;
    }
    const expectedKey = parsed.namespace + '__' + parsed.member;
    return (
      namespacedKey === expectedKey ||
      namespacedKey.endsWith('__' + parsed.member)
    );
  }
  return symbol.word === member;
}

/** Split a dotted `Namespace.member` into its parts, or `null` if malformed. */
function splitDotted(
  dotted: string
): { namespace: string; member: string } | null {
  const dot = dotted.indexOf('.');
  if (dot <= 0 || dot >= dotted.length - 1) {
    return null;
  }
  return {
    namespace: dotted.slice(0, dot),
    member: dotted.slice(dot + 1),
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

/**
 * Render a DSL docs entry as Markdown (Req 9.1): the description, plus a
 * fenced signature line when one is available.
 */
function renderDoc(doc: DslDocLike): string {
  if (doc.signature) {
    return '```ts\n' + doc.signature + '\n```\n\n' + doc.description;
  }
  return doc.description;
}

/**
 * Render an element symbol as Markdown (Req 9.2): tag, optional label, optional
 * where-summary, and the declaration location.
 */
function renderElement(element: ElementSymbol): string {
  const lines: string[] = [];
  lines.push('**Element** `' + element.tag + '`');
  if (element.label) {
    lines.push('Label: ' + element.label);
  }
  if (element.whereSummary) {
    lines.push('Where: `' + element.whereSummary + '`');
  }
  lines.push('');
  lines.push('_' + formatLocation(element.filePath, element.line) + '_');
  return lines.join('\n\n');
}

/**
 * Render a task symbol as Markdown (Req 9.3): the task name (with its optional
 * label) and the declaration location.
 */
function renderTask(task: TaskSymbol): string {
  const lines: string[] = [];
  const heading = task.label
    ? '**Task** `' + task.name + '` — ' + task.label
    : '**Task** `' + task.name + '`';
  lines.push(heading);
  lines.push('');
  lines.push('_' + formatLocation(task.filePath, task.line) + '_');
  return lines.join('\n\n');
}

/** Format a `filePath:line` declaration location for display. */
function formatLocation(filePath: string, line: number): string {
  return filePath + ':' + line;
}

/** Wrap Markdown content in a {@link Hover} with `MarkupKind.Markdown`. */
function markdownHover(value: string): Hover {
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value,
    },
  };
}

/** Minimal structural view of a docs entry (avoids importing the interface). */
interface DslDocLike {
  description: string;
  signature?: string;
}
