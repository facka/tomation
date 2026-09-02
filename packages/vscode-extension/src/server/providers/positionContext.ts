/**
 * Position context classifier.
 *
 * The shared cursor-context helper the three authoring providers consult
 * before doing any work (design §9). Completion (task 7.3) asks "what kind of
 * position is this?" to decide which items to offer; hover (task 7.4) and
 * definition (task 7.5) ask "what symbol is under the cursor?" via the
 * `symbolAt` case (word + optional dotted `Namespace.member` form).
 *
 * Classification is deliberately **heuristic and text-based** — a lightweight
 * scan of the current line and the characters just before the cursor. It does
 * NOT reimplement DSL parsing rules (that is the compiler's job, reused for
 * diagnostics and the index). It only recognizes the shape of the code around
 * the caret well enough to route completions and to identify a hover/definition
 * target. The recognized action/matcher/builder surface is kept in sync with
 * `packages/dsl/index.d.ts` (the DSL type definitions).
 *
 * All functions are pure and never throw: given a document and a position they
 * return a {@link PositionKind} (or `null` for `symbolAt`), so the providers
 * can treat every input uniformly and fall back to `none` / TypeScript.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.1, 10.1.
 */

import { Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

// ---------------------------------------------------------------------------
// PositionKind — the discriminated union providers switch on (design §9)
// ---------------------------------------------------------------------------

/**
 * The classified kind of a cursor position. Completion providers switch on
 * this to decide which items to offer; hover/definition use the `symbolAt`
 * case. See the per-variant comments for what each represents.
 */
export type PositionKind =
  // Cursor immediately after `is.` — offer HTML tag names + `ELEMENT` (Req 8.1).
  | { kind: 'isTag' }
  // After `is.TAG` or a chain method — offer `where`/`childOf`/`navigate`/`as`
  // (Req 8.2).
  | { kind: 'builderChain' }
  // Inside a `.where( … )` argument list — offer matcher factories (Req 8.3).
  | { kind: 'whereArg' }
  // An element-name position: `Click(▮)`, `.in(▮)`, `Assert*(▮)`, `WaitFor(▮)`,
  // `Save*(▮)`, `childOf(▮)`, … — offer element names (Req 8.4).
  | { kind: 'elementRef' }
  // A member access on an imported POM namespace (`Login.▮`) — offer task names
  // (and elements) from that namespace (Req 8.5).
  | { kind: 'taskRef'; namespace: string }
  // Start of a statement inside a runnable/task body — offer DSL actions and
  // constructs. Bare identifiers here can also be task names, so the completion
  // provider surfaces both actions and task names for this kind (Req 8.5, 8.6).
  | { kind: 'topLevelAction' }
  // A hover/definition target: the identifier under the cursor, plus its dotted
  // `Namespace.member` form when the cursor is on a member expression
  // (Req 9.1, 10.1).
  | { kind: 'symbolAt'; word: string; dotted?: string }
  // Anything else / unclassifiable — providers defer to TypeScript (Req 8.9).
  | { kind: 'none' };

/** The identifier (and optional dotted form) under a hover/definition cursor. */
export interface SymbolAt {
  /** The bare identifier word under the cursor (e.g. `submitButton`). */
  word: string;
  /** The dotted member expression when applicable (e.g. `Login.submitButton`). */
  dotted?: string;
}

// ---------------------------------------------------------------------------
// DSL surface constants — kept in sync with packages/dsl/index.d.ts
// ---------------------------------------------------------------------------

/**
 * Action functions whose first argument is an element reference. Typing an
 * element name is expected directly inside `Fn(` for these, so a cursor there
 * classifies as {@link PositionKind} `elementRef` (Req 8.4). Mirrors the
 * element-taking actions declared in `packages/dsl/index.d.ts`.
 */
const ELEMENT_ARG_ACTIONS: ReadonlySet<string> = new Set([
  'Click',
  'AssertExists',
  'AssertNotExists',
  'AssertHasText',
  'WaitFor',
  'WaitForGone',
  'SaveText',
  'SaveValue',
  'SaveAttribute',
]);

/**
 * Builder/target methods whose argument is an element reference — `.in(el)`
 * (Type/Select/Upload/Press targets) and `.childOf(parent)` (element builder).
 * A cursor inside these also classifies as `elementRef` (Req 8.4).
 */
const ELEMENT_ARG_METHODS: ReadonlySet<string> = new Set(['in', 'childOf']);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a cursor position for the **completion** provider (design §9).
 * Inspects the current line up to the cursor and returns which completion
 * context applies. Never throws; unclassifiable positions return `none`
 * (Req 8.9).
 *
 * Order of checks matters — the most specific shapes are tested first so, for
 * example, `is.` is not mistaken for a bare statement start.
 */
export function classifyPosition(
  document: TextDocument,
  position: Position
): PositionKind {
  const prefix = lineTextBeforeCursor(document, position);
  if (prefix === null) {
    return { kind: 'none' };
  }

  // 1. `is.` element-builder entry → tag names (Req 8.1). Matches `is.` and a
  //    partially typed tag like `is.BUT`, but NOT `is.TAG.` (that's a chain).
  if (isTagPosition(prefix)) {
    return { kind: 'isTag' };
  }

  // 2. Inside a `.where( … )` call → matcher factories (Req 8.3). Checked
  //    before the generic chain rule so `.where(` isn't read as a chain dot.
  if (isWhereArgPosition(prefix)) {
    return { kind: 'whereArg' };
  }

  // 3. Element-builder chain dot (`is.TAG.`, `).`, or `.method().`) → chain
  //    methods `where`/`childOf`/`navigate`/`as` (Req 8.2).
  if (isBuilderChainPosition(prefix)) {
    return { kind: 'builderChain' };
  }

  // 4. Element-reference argument position (Req 8.4): inside an element-taking
  //    action call or `.in(`/`childOf(`.
  if (isElementRefPosition(prefix)) {
    return { kind: 'elementRef' };
  }

  // 5. Member access on a namespace (`Login.`) → task/element names from that
  //    imported POM namespace (Req 8.5). Only when it is not itself a builder
  //    chain (handled above) and the left side is a Capitalized identifier.
  const namespace = namespaceMemberPosition(prefix);
  if (namespace !== null) {
    return { kind: 'taskRef', namespace };
  }

  // 6. Statement start inside a body → DSL actions/constructs (Req 8.6). Bare
  //    identifier statements are ambiguous between an action and a task call;
  //    per the design we classify them as `topLevelAction` and let the
  //    completion provider also surface task names for this kind (Req 8.5).
  if (isStatementStart(prefix)) {
    return { kind: 'topLevelAction' };
  }

  return { kind: 'none' };
}

/**
 * Identify the symbol under the cursor for **hover** and **definition**
 * (Req 9.1, 10.1). Returns the bare identifier word plus, when the cursor sits
 * on a member expression (`Namespace.member`), the dotted form so the provider
 * can resolve `Login.submitButton` to its namespaced key. Returns `null` when
 * there is no identifier under the cursor. Never throws.
 *
 * Examples:
 *  - cursor on `submitButton` in `Login.submitButton` → `{ word:
 *    'submitButton', dotted: 'Login.submitButton' }`
 *  - cursor on `Login` in `Login.submitButton` → `{ word: 'Login' }`
 *  - cursor on `Click` in `Click(loginButton)` → `{ word: 'Click' }`
 */
export function symbolAt(
  document: TextDocument,
  position: Position
): SymbolAt | null {
  const line = lineText(document, position);
  if (line === null) {
    return null;
  }
  const col = position.character;

  const range = identifierRangeAt(line, col);
  if (!range) {
    return null;
  }
  const word = line.slice(range.start, range.end);

  // Look left of the identifier's start for a `Namespace.` qualifier so the
  // dotted member form can be reported. Only a Capitalized qualifier (POM
  // namespace convention) yields a dotted form.
  const dotted = dottedQualifier(line, range.start, word);
  return dotted ? { word, dotted } : { word };
}

/**
 * Convenience wrapper returning a {@link PositionKind} `symbolAt` variant for
 * hover/definition callers that prefer to switch on `PositionKind` uniformly,
 * or `none` when there is no identifier under the cursor.
 */
export function classifySymbol(
  document: TextDocument,
  position: Position
): PositionKind {
  const found = symbolAt(document, position);
  if (!found) {
    return { kind: 'none' };
  }
  return found.dotted
    ? { kind: 'symbolAt', word: found.word, dotted: found.dotted }
    : { kind: 'symbolAt', word: found.word };
}

// ---------------------------------------------------------------------------
// Line-buffer helpers (pure, no-throw)
// ---------------------------------------------------------------------------

/**
 * Return the full text of the cursor's line, or `null` if it cannot be read.
 * Uses the whole-line range so both the prefix (before cursor) and the
 * character under the cursor are available.
 */
function lineText(document: TextDocument, position: Position): string | null {
  try {
    const start = Position.create(position.line, 0);
    // A generous end character; `getText` clamps to the actual line/offset.
    const end = Position.create(position.line + 1, 0);
    const text = document.getText({ start, end });
    // Drop a trailing newline so column math on the last line is stable.
    return text.replace(/\r?\n$/, '');
  } catch {
    return null;
  }
}

/**
 * Return the current line's text up to (but not including) the cursor column,
 * or `null` when the line cannot be read.
 */
function lineTextBeforeCursor(
  document: TextDocument,
  position: Position
): string | null {
  const line = lineText(document, position);
  if (line === null) {
    return null;
  }
  return line.slice(0, position.character);
}

// ---------------------------------------------------------------------------
// Completion-context predicates (heuristic scans of the pre-cursor text)
// ---------------------------------------------------------------------------

/**
 * `is.` builder entry: the text ends with `is.` optionally followed by a
 * partially typed tag identifier (`is.`, `is.BUT`), but not a completed chain
 * dot (`is.BUTTON.` is a builder chain, handled separately).
 */
function isTagPosition(prefix: string): boolean {
  return /(^|[^\w$])is\.[A-Za-z]*$/.test(prefix);
}

/**
 * Inside a `.where( … )` argument list: the nearest unclosed `(` to the left
 * is opened by a `.where` call. A pragmatic balanced-paren scan finds the
 * enclosing open paren and checks the identifier immediately before it.
 */
function isWhereArgPosition(prefix: string): boolean {
  const call = enclosingCallName(prefix);
  return call === 'where';
}

/**
 * Element-builder chain dot: a `.` (optionally followed by a partial method
 * name) that follows either `is.TAG`, a closing `)` of a builder call, or an
 * `as`/`where`/`childOf`/`navigate` chain segment. Offers `where`/`childOf`/
 * `navigate`/`as` (Req 8.2).
 */
function isBuilderChainPosition(prefix: string): boolean {
  // `is.TAG.` or `is.TAG.wh` — a completed tag followed by a chain dot.
  if (/(^|[^\w$])is\.[A-Z][A-Za-z0-9]*\.[A-Za-z]*$/.test(prefix)) {
    return true;
  }
  // A chain dot after a closing paren of a builder method, e.g.
  // `is.BUTTON.where(idIs('x')).` or `Element('//a').`.
  if (/\)\s*\.[A-Za-z]*$/.test(prefix) && looksLikeBuilderExpression(prefix)) {
    return true;
  }
  return false;
}

/**
 * Whether the pre-cursor text plausibly belongs to an element-builder
 * expression (starts from `is.`/`Element(`/`is.ELEMENT(`). Used to distinguish
 * a builder chain dot from an ordinary member access.
 */
function looksLikeBuilderExpression(prefix: string): boolean {
  return /(^|[^\w$])(is\.[A-Z]|Element\s*\(|is\.ELEMENT\s*\()/.test(prefix);
}

/**
 * Element-reference argument position (Req 8.4): the cursor is inside the call
 * of an element-taking action (`Click(`, `AssertExists(`, `WaitFor(`,
 * `Save*(`, …) or a `.in(`/`childOf(` argument, and no closing `)` has been
 * typed yet for that call.
 */
function isElementRefPosition(prefix: string): boolean {
  const call = enclosingCallName(prefix);
  if (call === null) {
    return false;
  }
  if (ELEMENT_ARG_METHODS.has(call)) {
    return true;
  }
  return ELEMENT_ARG_ACTIONS.has(call);
}

/**
 * Member access on a POM namespace (`Login.` / `Login.sub`): the pre-cursor
 * text ends with a Capitalized identifier, a dot, and an optional partial
 * member. Returns the namespace name, or `null` when the shape does not match
 * or when it is an `is.`/builder access (handled elsewhere).
 */
function namespaceMemberPosition(prefix: string): string | null {
  const match = /(^|[^\w$])([A-Z][A-Za-z0-9_]*)\.[A-Za-z0-9_]*$/.exec(prefix);
  if (!match) {
    return null;
  }
  const namespace = match[2];
  // `is` is the builder proxy, not a POM namespace.
  if (namespace === 'is') {
    return null;
  }
  return namespace;
}

/**
 * Whether the cursor sits at the start of a statement (only leading
 * whitespace, or a partially typed leading identifier, on the current line).
 * This is the pragmatic `topLevelAction` heuristic — a fresh statement line in
 * a runnable/task body (Req 8.6).
 */
function isStatementStart(prefix: string): boolean {
  return /^\s*[A-Za-z]*$/.test(prefix);
}

// ---------------------------------------------------------------------------
// Enclosing-call detection (balanced-paren scan)
// ---------------------------------------------------------------------------

/**
 * Find the identifier that opens the innermost unclosed `(` to the left of the
 * cursor, e.g. for `Click(loginBu` returns `Click`; for `.where(idIs('x'` (the
 * inner `idIs(` is closed) returns `where`. Returns `null` when the cursor is
 * not inside any open call on this line.
 *
 * A single-line scan is sufficient for the authoring heuristics: DSL action
 * and matcher calls are written on one line in practice, and misclassifying a
 * rare multi-line call merely yields `none` (TypeScript still assists).
 */
function enclosingCallName(prefix: string): string | null {
  let depth = 0;
  let i = prefix.length - 1;
  // Skip string literals so parens/quotes inside strings don't confuse depth.
  while (i >= 0) {
    const ch = prefix[i];
    if (ch === ')') {
      depth++;
      i--;
      continue;
    }
    if (ch === '(') {
      if (depth === 0) {
        // Found the innermost unclosed open paren — read the identifier before it.
        return identifierBefore(prefix, i);
      }
      depth--;
      i--;
      continue;
    }
    i--;
  }
  return null;
}

/**
 * Read the JS identifier ending just before index `openParen` (skipping any
 * whitespace between the name and `(`). Returns `null` when there is no
 * identifier there (e.g. a grouping paren).
 */
function identifierBefore(text: string, openParen: number): string | null {
  let end = openParen - 1;
  while (end >= 0 && /\s/.test(text[end])) {
    end--;
  }
  let start = end;
  while (start >= 0 && /[\w$]/.test(text[start])) {
    start--;
  }
  if (start === end) {
    return null;
  }
  return text.slice(start + 1, end + 1);
}

// ---------------------------------------------------------------------------
// symbolAt helpers
// ---------------------------------------------------------------------------

/**
 * Locate the identifier occupying column `col` on `line`. The cursor may sit
 * anywhere within (or just after) the identifier. Returns its `[start, end)`
 * character range, or `null` when the cursor is not on an identifier.
 */
function identifierRangeAt(
  line: string,
  col: number
): { start: number; end: number } | null {
  const isIdent = (ch: string | undefined): boolean =>
    ch !== undefined && /[\w$]/.test(ch);

  // Expand left from the cursor. When the cursor is at the boundary just after
  // an identifier, `col - 1` still lands on it.
  let start = col;
  while (start > 0 && isIdent(line[start - 1])) {
    start--;
  }
  let end = col;
  while (end < line.length && isIdent(line[end])) {
    end++;
  }
  if (start === end) {
    return null;
  }
  // A leading digit means this is a numeric literal, not an identifier.
  if (/[0-9]/.test(line[start])) {
    return null;
  }
  return { start, end };
}

/**
 * If a Capitalized `Namespace.` qualifier immediately precedes the identifier
 * that starts at `identStart`, return the full dotted form `Namespace.word`.
 * Returns `null` when there is no qualifier or the qualifier is `is` (the
 * builder proxy, not a POM namespace).
 */
function dottedQualifier(
  line: string,
  identStart: number,
  word: string
): string | undefined {
  if (identStart === 0 || line[identStart - 1] !== '.') {
    return undefined;
  }
  // Read the identifier just before the dot.
  let end = identStart - 2;
  let start = end;
  while (start >= 0 && /[\w$]/.test(line[start])) {
    start--;
  }
  if (start === end) {
    return undefined;
  }
  const qualifier = line.slice(start + 1, end + 1);
  // POM namespaces are Capitalized; `is` is the builder proxy.
  if (qualifier === 'is' || !/^[A-Z]/.test(qualifier)) {
    return undefined;
  }
  return qualifier + '.' + word;
}
