/**
 * Per-URI diagnostic store — merges file-scoped and project-scoped diagnostics.
 *
 * LSP `connection.sendDiagnostics({ uri, diagnostics })` *replaces* the entire
 * diagnostic set for a URI. Both the file-scoped pass (`fileDiagnostics.ts`,
 * §5) and the project-scoped pass (`projectDiagnostics.ts`, §6) publish per
 * URI, so if each called `sendDiagnostics` directly they would clobber one
 * another. Design Flow B requires the server to publish "per-file diagnostics
 * (merging file-scoped + project-scoped for each affected URI)".
 *
 * This store is the single owner of what gets published. It holds, per URI, two
 * independent buckets — `file` and `project` — and whenever either bucket
 * changes it publishes the *union* (deduplicated) for that URI. The two scopes
 * therefore combine instead of overwriting each other (Req 6.5, 15.2).
 *
 * The store is kept free of any live connection: it takes a `publish(uri,
 * diagnostics)` callback, so it is trivially unit-testable and the server just
 * wires `connection.sendDiagnostics` into it (Req 14.3).
 *
 * Requirements: 6.5, 15.2, 15.4.
 */

import { Diagnostic } from 'vscode-languageserver/node';

/** The publish sink the store calls whenever a URI's merged set changes. */
export type PublishDiagnostics = (uri: string, diagnostics: Diagnostic[]) => void;

/** The two independent diagnostic buckets held for a single URI. */
interface UriBuckets {
  file: Diagnostic[];
  project: Diagnostic[];
}

/**
 * A stable key over `(severity, range, message, code)` used to collapse
 * duplicates when the two buckets are merged (Req 15.4). The mapper already
 * dedups *within* a scope; this dedups *across* scopes so the same problem
 * reported by both file- and project-scoped passes appears once.
 */
function dedupKey(diagnostic: Diagnostic): string {
  const r = diagnostic.range;
  return [
    diagnostic.severity ?? '',
    r.start.line,
    r.start.character,
    r.end.line,
    r.end.character,
    diagnostic.code ?? '',
    diagnostic.message,
  ].join('\u0000');
}

/** Merge two diagnostic lists, keeping the first occurrence of each. */
function mergeDeduped(
  file: Diagnostic[],
  project: Diagnostic[]
): Diagnostic[] {
  const seen = new Set<string>();
  const merged: Diagnostic[] = [];
  for (const diagnostic of [...file, ...project]) {
    const key = dedupKey(diagnostic);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(diagnostic);
  }
  return merged;
}

/**
 * A per-URI store that merges file-scoped and project-scoped diagnostics before
 * publishing. Both passes route their `sendDiagnostics` through here so the two
 * scopes combine per URI instead of clobbering each other.
 */
export interface DiagnosticStore {
  /**
   * Set the file-scoped diagnostics for `uri` and republish the merged set.
   * Passing an empty array clears the file bucket (a re-run replaces, never
   * appends — Req 15.1).
   */
  setFileDiagnostics(uri: string, diagnostics: Diagnostic[]): void;

  /**
   * Set the project-scoped diagnostics for `uri` and republish the merged set.
   * Passing an empty array clears the project bucket for that URI.
   */
  setProjectDiagnostics(uri: string, diagnostics: Diagnostic[]): void;

  /**
   * Clear the project bucket for every URI matched by `predicate` (used to
   * clear a folder's prior project diagnostics on a successful re-run, keeping
   * each URI's file-scoped bucket intact — Req 6.3 success case).
   */
  clearProjectWhere(predicate: (uri: string) => boolean): void;

  /** Return the current merged set for a URI (primarily for tests). */
  get(uri: string): Diagnostic[];
}

/**
 * Create a {@link DiagnosticStore} that publishes through `publish`.
 *
 * @param publish sink invoked with the merged, deduplicated set for a URI
 *   whenever that URI's file or project bucket changes.
 */
export function createDiagnosticStore(
  publish: PublishDiagnostics
): DiagnosticStore {
  // Per-URI buckets. A URI is dropped from the map once both buckets are empty
  // so the store does not grow unbounded across a long session.
  const byUri = new Map<string, UriBuckets>();

  function bucketsFor(uri: string): UriBuckets {
    let buckets = byUri.get(uri);
    if (!buckets) {
      buckets = { file: [], project: [] };
      byUri.set(uri, buckets);
    }
    return buckets;
  }

  /** Publish the merged set for `uri`, and drop the entry when fully empty. */
  function publishMerged(uri: string, buckets: UriBuckets): void {
    const merged = mergeDeduped(buckets.file, buckets.project);
    publish(uri, merged);
    if (buckets.file.length === 0 && buckets.project.length === 0) {
      byUri.delete(uri);
    }
  }

  return {
    setFileDiagnostics(uri: string, diagnostics: Diagnostic[]): void {
      const buckets = bucketsFor(uri);
      buckets.file = diagnostics;
      publishMerged(uri, buckets);
    },

    setProjectDiagnostics(uri: string, diagnostics: Diagnostic[]): void {
      const buckets = bucketsFor(uri);
      buckets.project = diagnostics;
      publishMerged(uri, buckets);
    },

    clearProjectWhere(predicate: (uri: string) => boolean): void {
      // Snapshot the keys first: publishMerged may delete entries mid-iteration.
      for (const uri of [...byUri.keys()]) {
        const buckets = byUri.get(uri);
        if (!buckets || buckets.project.length === 0) {
          continue;
        }
        if (predicate(uri)) {
          buckets.project = [];
          publishMerged(uri, buckets);
        }
      }
    },

    get(uri: string): Diagnostic[] {
      const buckets = byUri.get(uri);
      if (!buckets) {
        return [];
      }
      return mergeDeduped(buckets.file, buckets.project);
    },
  };
}
