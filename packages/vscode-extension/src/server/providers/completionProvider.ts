/**
 * Completion provider.
 *
 * Supplements — never suppresses — the built-in TypeScript completions inside a
 * DSL file (Req 8.8). The server bootstrap gates this behind the
 * `completion.enabled` setting (Req 12.5) and delegates here on each completion
 * request; this module classifies the cursor position (via
 * {@link classifyPosition}) and returns the Tomation-specific items VS Code
 * merges into the list.
 *
 * Per {@link PositionKind} the provider offers:
 *  - `isTag`          → HTML tag names + `ELEMENT` (Req 8.1)
 *  - `builderChain`   → `where` / `childOf` / `navigate` / `as` (Req 8.2)
 *  - `whereArg`       → matcher factories with argument snippets (Req 8.3)
 *  - `elementRef`     → element names from the index, local + namespaced (Req 8.4)
 *  - `taskRef`        → task names scoped to the namespace (Req 8.5)
 *  - `topLevelAction` → DSL actions/constructs + bare task calls (Req 8.5, 8.6)
 *  - `symbolAt`/`none`→ nothing, so TypeScript is untouched (Req 8.9)
 *
 * Where a symbol has an entry in {@link DSL_DOCS} the item carries its
 * description (as Markdown documentation) and signature (as detail) so a
 * suggestion is self-documenting (Req 8.7).
 *
 * Everything is defensive and never throws: any failure (unreadable document,
 * missing index, unexpected error) yields an empty list, which is always a
 * safe answer because TypeScript still provides its own completions (Req 8.9).
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 12.5.
 */

import {
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
  InsertTextFormat,
  MarkupKind,
  TextDocuments,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { ProjectIndex } from '../index/projectIndex';
import { lookupDoc } from './docs';
import { classifyPosition } from './positionContext';

/** Dependencies the completion provider needs. */
export interface CompletionDeps {
  documents: TextDocuments<TextDocument>;
  getIndex(uri: string): ProjectIndex | undefined;
}

// ---------------------------------------------------------------------------
// DSL surface constants — kept in sync with packages/dsl/index.d.ts
// ---------------------------------------------------------------------------

/**
 * A curated list of common HTML tag names offered after `is.` (Req 8.1). The
 * `is` proxy accepts any uppercase HTML tag, so this is a pragmatic subset of
 * the most frequently used elements rather than an exhaustive enumeration.
 */
const HTML_TAGS: readonly string[] = [
  'A',
  'ARTICLE',
  'ASIDE',
  'BUTTON',
  'CANVAS',
  'DIV',
  'FIELDSET',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'IFRAME',
  'IMG',
  'INPUT',
  'LABEL',
  'LEGEND',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'OPTION',
  'P',
  'SECTION',
  'SELECT',
  'SPAN',
  'TABLE',
  'TBODY',
  'TD',
  'TEXTAREA',
  'TH',
  'THEAD',
  'TR',
  'UL',
];

/** Element-builder chain methods offered after a builder expression (Req 8.2). */
const BUILDER_METHODS: readonly string[] = [
  'where',
  'childOf',
  'navigate',
  'as',
];

/**
 * Matcher factories offered inside a `.where( … )` argument list (Req 8.3),
 * each paired with a snippet mirroring its argument shape in
 * `packages/dsl/index.d.ts`. `${0}` marks the final tab stop where relevant.
 */
const WHERE_MATCHERS: ReadonlyArray<{ name: string; snippet: string }> = [
  { name: 'idIs', snippet: "idIs('${1:id}')" },
  { name: 'innerTextIs', snippet: "innerTextIs('${1:text}')" },
  { name: 'innerTextContains', snippet: "innerTextContains('${1:text}')" },
  { name: 'classIncludes', snippet: "classIncludes('${1:class}')" },
  { name: 'placeholderIs', snippet: "placeholderIs('${1:placeholder}')" },
  { name: 'nameIs', snippet: "nameIs('${1:name}')" },
  { name: 'typeIs', snippet: "typeIs('${1:type}')" },
  { name: 'valueIs', snippet: "valueIs('${1:value}')" },
  { name: 'dataAttr', snippet: "dataAttr('${1:name}', '${2:value}')" },
  { name: 'ariaLabel', snippet: "ariaLabel('${1:label}')" },
  { name: 'roleIs', snippet: "roleIs('${1:role}')" },
  { name: 'titleIs', snippet: "titleIs('${1:title}')" },
  { name: 'hrefContains', snippet: "hrefContains('${1:href}')" },
  { name: 'isDisabled', snippet: 'isDisabled()' },
  { name: 'nthChild', snippet: 'nthChild(${1:n})' },
  { name: 'closestLabelIs', snippet: "closestLabelIs('${1:tag}', '${2:text}')" },
];

/**
 * DSL actions and constructs offered at statement start (Req 8.6). Includes the
 * `Press*` shortcuts and the top-level constructs (`Test`/`Task`/`Automation`).
 */
const TOP_LEVEL_ACTIONS: readonly string[] = [
  'Click',
  'Type',
  'TypePassword',
  'Select',
  'Navigate',
  'AssertExists',
  'AssertNotExists',
  'AssertHasText',
  'Wait',
  'WaitFor',
  'WaitForGone',
  'Manual',
  'Upload',
  'PressKey',
  'Press',
  'PressUp',
  'PressDown',
  'PressLeft',
  'PressRight',
  'PressTab',
  'PressEnter',
  'PressEsc',
  'PressSpace',
  'SaveText',
  'SaveAttribute',
  'SaveValue',
  'Save',
  'When',
  'Test',
  'Task',
  'Automation',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Provide Tomation completions for the cursor position, supplementing (never
 * suppressing) built-in TypeScript completions (Req 8.8). Returns an empty list
 * when the document or index is unavailable or the position is unclassifiable
 * (Req 8.9), and never throws.
 */
export function provideCompletion(
  deps: CompletionDeps,
  params: CompletionParams
): CompletionItem[] {
  try {
    const uri = params.textDocument.uri;
    const document = deps.documents.get(uri);
    if (!document) {
      return [];
    }

    // The index is required for element/task names and is the shared source of
    // truth; without it there is nothing project-specific to offer (Req 8.9).
    const index = deps.getIndex(uri);
    if (!index) {
      return [];
    }

    const context = classifyPosition(document, params.position);
    switch (context.kind) {
      case 'isTag':
        return tagItems();
      case 'builderChain':
        return builderChainItems();
      case 'whereArg':
        return whereMatcherItems();
      case 'elementRef':
        return elementItems(index);
      case 'taskRef':
        return taskItems(index, context.namespace);
      case 'topLevelAction':
        return topLevelItems(index);
      case 'symbolAt':
      case 'none':
      default:
        return [];
    }
  } catch {
    // Never throw — an empty list keeps TypeScript completions intact (Req 8.9).
    return [];
  }
}

// ---------------------------------------------------------------------------
// Per-context item builders
// ---------------------------------------------------------------------------

/** HTML tag names + `ELEMENT` after `is.` (Req 8.1). */
function tagItems(): CompletionItem[] {
  const items: CompletionItem[] = HTML_TAGS.map((tag) => ({
    label: tag,
    kind: CompletionItemKind.Constant,
    detail: `HTML <${tag.toLowerCase()}> element builder`,
  }));
  // `ELEMENT` is the XPath-based builder on the `is` proxy — attach its doc.
  items.push(
    withDoc(
      {
        label: 'ELEMENT',
        kind: CompletionItemKind.Function,
        insertText: "ELEMENT('${1:xpath}')",
        insertTextFormat: InsertTextFormat.Snippet,
      },
      'ELEMENT'
    )
  );
  return items;
}

/** Builder chain methods `where`/`childOf`/`navigate`/`as` (Req 8.2). */
function builderChainItems(): CompletionItem[] {
  return BUILDER_METHODS.map((name) =>
    withDoc(
      {
        label: name,
        kind: CompletionItemKind.Method,
      },
      name
    )
  );
}

/** Matcher factories with argument snippets inside `.where( … )` (Req 8.3). */
function whereMatcherItems(): CompletionItem[] {
  return WHERE_MATCHERS.map(({ name, snippet }) =>
    withDoc(
      {
        label: name,
        kind: CompletionItemKind.Function,
        insertText: snippet,
        insertTextFormat: InsertTextFormat.Snippet,
      },
      name
    )
  );
}

/**
 * Element names from the index (Req 8.4). The local `variableName` is the
 * label; the namespaced key is offered via `filterText`/`detail` so cross-file
 * names remain discoverable, and the tag/where summary is shown as detail.
 */
function elementItems(index: ProjectIndex): CompletionItem[] {
  const items: CompletionItem[] = [];
  for (const element of index.elements.values()) {
    if (!element || typeof element.variableName !== 'string') {
      continue;
    }
    items.push({
      label: element.variableName,
      kind: CompletionItemKind.Variable,
      detail: elementDetail(element.tag, element.whereSummary),
      // Keep the namespaced key matchable so typing the qualified form still
      // surfaces the element, and stable so cross-file duplicates disambiguate.
      filterText: element.namespacedKey,
      documentation: elementDoc(element.namespacedKey, element.label),
    });
  }
  return items;
}

/**
 * Task names from the index (Req 8.5). Scoped to `namespace` where the key is
 * namespaced (`namespace + '__'`), still surfacing the bare task name/label.
 */
function taskItems(index: ProjectIndex, namespace: string): CompletionItem[] {
  const prefix = namespace + '__';
  const items: CompletionItem[] = [];
  for (const task of index.tasks.values()) {
    if (!task || typeof task.name !== 'string') {
      continue;
    }
    // Scope to the requested namespace where sensible; if nothing matches the
    // caller still gets the empty list rather than unrelated tasks.
    if (!task.namespacedKey.startsWith(prefix)) {
      continue;
    }
    items.push(taskItem(task.name, task.namespacedKey, task.label, task.paramNames));
  }
  return items;
}

/**
 * Statement-start items (Req 8.6): DSL actions/constructs plus bare task calls
 * from the index (per the classifier's documented decision to treat bare
 * identifiers here as either an action or a task, Req 8.5).
 */
function topLevelItems(index: ProjectIndex): CompletionItem[] {
  const items: CompletionItem[] = TOP_LEVEL_ACTIONS.map((name) =>
    withDoc(
      {
        label: name,
        kind: CompletionItemKind.Function,
      },
      name
    )
  );

  // Also surface bare task calls (Req 8.5) — no namespace scoping here since a
  // statement-start identifier may reference any imported task.
  for (const task of index.tasks.values()) {
    if (!task || typeof task.name !== 'string') {
      continue;
    }
    items.push(taskItem(task.name, task.namespacedKey, task.label, task.paramNames));
  }
  return items;
}

// ---------------------------------------------------------------------------
// Item helpers
// ---------------------------------------------------------------------------

/** Build a completion item for a task, with a param hint as detail. */
function taskItem(
  name: string,
  namespacedKey: string,
  label: string | null,
  paramNames: string[]
): CompletionItem {
  const params = Array.isArray(paramNames) ? paramNames : [];
  const signature = params.length > 0 ? `${name}({ ${params.join(', ')} })` : `${name}()`;
  const detailParts: string[] = [signature];
  if (label) {
    detailParts.push(`— ${label}`);
  }
  return {
    label: name,
    kind: CompletionItemKind.Reference,
    detail: detailParts.join(' '),
    filterText: namespacedKey,
  };
}

/** Compose the detail string for an element item from its tag and where summary. */
function elementDetail(tag: string, whereSummary: string): string {
  const tagPart = tag ? `<${tag.toLowerCase()}>` : 'element';
  return whereSummary ? `${tagPart} ${whereSummary}` : tagPart;
}

/** Compose Markdown documentation for an element item (namespaced key + label). */
function elementDoc(
  namespacedKey: string,
  label: string | null
): CompletionItem['documentation'] {
  const lines: string[] = [`\`${namespacedKey}\``];
  if (label) {
    lines.push('', label);
  }
  return { kind: MarkupKind.Markdown, value: lines.join('\n') };
}

/**
 * Attach documentation from {@link DSL_DOCS} to an item where an entry exists
 * (Req 8.7): the description becomes Markdown `documentation` and the signature
 * (falling back to the item's existing detail) becomes `detail`. Items without
 * a doc entry are returned unchanged.
 */
function withDoc(item: CompletionItem, symbol: string): CompletionItem {
  const doc = lookupDoc(symbol);
  if (!doc) {
    return item;
  }
  return {
    ...item,
    detail: doc.signature ?? item.detail,
    documentation: {
      kind: MarkupKind.Markdown,
      value: doc.description,
    },
  };
}
