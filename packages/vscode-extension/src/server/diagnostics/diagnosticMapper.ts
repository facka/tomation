/**
 * Diagnostic mapper — pure translation from engine output to LSP `Diagnostic[]`.
 *
 * This module is the single place that turns the compiler engine's results
 * (parse errors, parse warnings, and cross-file validation errors) into the
 * LSP `Diagnostic` shape that the server publishes. It is deliberately kept
 * *pure* and free of any VS Code API dependency beyond the LSP `Diagnostic`,
 * `DiagnosticSeverity`, and `Range` shapes, so it is trivially unit-testable
 * without a running editor (Req 4, Req 14.3, Req 15.4).
 *
 * Mapping rules (mirroring `tomation check`, so editor problems match the CLI):
 *
 *  - Severity (Req 4.1, 4.2): parse *warnings* map to `Warning`; parse errors,
 *    strip errors, validation errors, and *fatal* warnings map to `Error`.
 *  - Range (Req 4.3, 4.4): a 1-based engine `line` becomes a 0-based LSP range
 *    covering that whole line (start col 0 → line length). When the engine
 *    supplies a precise column/token range, the mapper prefers it (forward-
 *    compatible; today most engine diagnostics are line-only). A `line` of `0`
 *    or missing pins the diagnostic to the first line so it stays visible.
 *  - source (Req 4.5): `"tomation"` on every diagnostic.
 *  - code (Req 4.6): when a message matches a known stable pattern, a short
 *    `code` string is attached; otherwise it is omitted.
 *  - Dedup (Req 15.4): diagnostics with identical `(severity, range, message)`
 *    collapse to one.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 15.4.
 */

import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
} from 'vscode-languageserver/node';

import type { EngineError, EngineWarning } from '../engine/engine';

/** The `source` label attached to every diagnostic (Req 4.5). */
const SOURCE = 'tomation';

/**
 * An engine warning that also *may* carry a `fatal` flag. Today the compiler
 * emits plain {@link EngineWarning}s, but a warning marked fatal is escalated
 * to `Error` severity per the rule table (Req 4.2). Modeled here so the mapper
 * is forward-compatible without changing the engine surface.
 */
export interface MappableWarning extends EngineWarning {
  /** When `true`, this warning is escalated to `Error` severity (Req 4.2). */
  fatal?: boolean;
  /**
   * Optional precise 0-based column range on the warning's line. When present,
   * the mapper prefers it over a whole-line range (Req 4.3).
   */
  startColumn?: number;
  endColumn?: number;
}

/**
 * A parse/strip error that may carry an optional precise 0-based column range.
 * Extends {@link EngineError} so callers can pass the engine's error through
 * directly, with columns being purely additive/forward-compatible (Req 4.3).
 */
export interface MappableError extends EngineError {
  startColumn?: number;
  endColumn?: number;
}

/** The input bag consumed by {@link toDiagnostics}. */
export interface DiagnosticMapperInput {
  /** A fatal parse/strip error for the file, if any (Req 4.2). */
  parseError?: MappableError | null;
  /** Non-fatal parse warnings for the file (Req 4.1). */
  warnings?: MappableWarning[];
  /**
   * A single cross-file validation error message from `validateSpec`, if any.
   * It carries no file/line, so it is pinned to the first line (Req 4.4).
   */
  validationError?: string | null;
  /** The full document text, used to compute whole-line ranges (Req 4.3). */
  documentText: string;
}

/**
 * Known stable diagnostic codes. When an engine message matches one of the
 * patterns below, the corresponding short `code` is attached so tooling (and
 * users) can key off a stable identifier rather than the free-form message
 * (Req 4.6). The message text itself is always preserved unchanged.
 */
const CODE_PATTERNS: Array<{ code: string; test: RegExp }> = [
  { code: 'unknown-element', test: /references unknown element/i },
  { code: 'unknown-task', test: /references unknown task/i },
  { code: 'unresolved-import', test: /cannot resolve import/i },
  { code: 'unknown-data-template', test: /unknown data template/i },
  { code: 'unknown-data-property', test: /unknown data property/i },
  { code: 'unknown-property', test: /unknown property/i },
  { code: 'unknown-function', test: /unknown function/i },
  { code: 'unknown-type-annotation', test: /unknown type annotation/i },
  { code: 'no-data-templates', test: /exports no Data templates/i },
  { code: 'namespace-collision', test: /namespace collision/i },
  { code: 'duplicate-key', test: /duplicate/i },
];

/**
 * Return the stable diagnostic code for a message, or `undefined` when the
 * message matches no known pattern (Req 4.6).
 */
function codeFor(message: string): string | undefined {
  for (const entry of CODE_PATTERNS) {
    if (entry.test.test(message)) {
      return entry.code;
    }
  }
  return undefined;
}

/**
 * Build a 0-based LSP range for a diagnostic.
 *
 * The engine reports 1-based lines. A `line` of `0` or missing pins the range
 * to the first line so the problem stays visible (Req 4.4). When a precise
 * 0-based column range is supplied it is preferred; otherwise the range covers
 * the whole line (start col 0 → line length) (Req 4.3).
 */
function rangeFor(
  line: number | undefined,
  documentText: string,
  startColumn?: number,
  endColumn?: number
): Range {
  // Engine lines are 1-based; 0/missing → first line (0-based line 0).
  const zeroBasedLine =
    typeof line === 'number' && line > 0 ? line - 1 : 0;

  // Prefer a precise column range when the engine provides one (Req 4.3).
  if (typeof startColumn === 'number' && typeof endColumn === 'number') {
    return {
      start: { line: zeroBasedLine, character: Math.max(0, startColumn) },
      end: { line: zeroBasedLine, character: Math.max(0, endColumn) },
    };
  }

  // Otherwise highlight the whole line: col 0 → the line's length (Req 4.3).
  const lineLength = lineLengthAt(documentText, zeroBasedLine);
  return {
    start: { line: zeroBasedLine, character: 0 },
    end: { line: zeroBasedLine, character: lineLength },
  };
}

/**
 * Return the length of the given 0-based line in `documentText`. Falls back to
 * `0` when the line is out of range, which still yields a valid (empty) range
 * that VS Code renders as a caret at the line start.
 */
function lineLengthAt(documentText: string, zeroBasedLine: number): number {
  const lines = documentText.split(/\r\n|\r|\n/);
  const text = lines[zeroBasedLine];
  return typeof text === 'string' ? text.length : 0;
}

/** Build a single diagnostic, attaching a stable `code` when one applies. */
function makeDiagnostic(
  severity: DiagnosticSeverity,
  range: Range,
  message: string
): Diagnostic {
  const diagnostic: Diagnostic = {
    severity,
    range,
    message,
    source: SOURCE,
  };
  const code = codeFor(message);
  if (code) {
    diagnostic.code = code;
  }
  return diagnostic;
}

/**
 * A stable key over `(severity, range, message)` used to collapse duplicate
 * diagnostics for the same problem at the same location (Req 15.4).
 */
function dedupKey(diagnostic: Diagnostic): string {
  const r = diagnostic.range;
  return [
    diagnostic.severity ?? '',
    r.start.line,
    r.start.character,
    r.end.line,
    r.end.character,
    diagnostic.message,
  ].join('\u0000');
}

/**
 * Translate engine output into a deduplicated list of LSP diagnostics.
 *
 * The order of the returned diagnostics follows the source order of the input:
 * the parse error first (a syntax error is a single, leading problem — Req
 * 15.3), then warnings in order, then the validation error. Duplicates by
 * `(severity, range, message)` are collapsed, keeping the first occurrence
 * (Req 15.4).
 *
 * @param input engine results plus the document text for range computation.
 * @returns the diagnostics to publish for the file, deduplicated.
 */
export function toDiagnostics(input: DiagnosticMapperInput): Diagnostic[] {
  const { parseError, warnings, validationError, documentText } = input;
  const diagnostics: Diagnostic[] = [];

  // Parse / strip error → single Error diagnostic (Req 4.2, 15.3).
  if (parseError) {
    diagnostics.push(
      makeDiagnostic(
        DiagnosticSeverity.Error,
        rangeFor(
          parseError.line,
          documentText,
          parseError.startColumn,
          parseError.endColumn
        ),
        parseError.message
      )
    );
  }

  // Parse warnings → Warning, unless flagged fatal → Error (Req 4.1, 4.2).
  if (warnings) {
    for (const warning of warnings) {
      const severity = warning.fatal
        ? DiagnosticSeverity.Error
        : DiagnosticSeverity.Warning;
      diagnostics.push(
        makeDiagnostic(
          severity,
          rangeFor(
            warning.line,
            documentText,
            warning.startColumn,
            warning.endColumn
          ),
          warning.message
        )
      );
    }
  }

  // Cross-file validation error → Error pinned to the first line (Req 4.2, 4.4).
  if (validationError) {
    diagnostics.push(
      makeDiagnostic(
        DiagnosticSeverity.Error,
        rangeFor(0, documentText),
        validationError
      )
    );
  }

  // Dedup identical (severity, range, message), keeping first occurrence.
  const seen = new Set<string>();
  const deduped: Diagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = dedupKey(diagnostic);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(diagnostic);
  }

  return deduped;
}
