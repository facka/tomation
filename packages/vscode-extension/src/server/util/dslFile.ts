/**
 * DSL file detection.
 *
 * Classifies a file (by URI or path) as one of the four Tomation DSL file
 * kinds — `*.pom.ts`, `*.test.ts`, `*.automation.ts`, `*.data.ts` — so the
 * server can scope validation, indexing, and authoring features to DSL files
 * only and never touch ordinary TypeScript (Req 2.1, 2.2, 2.3).
 *
 * Classification is purely suffix-based on the file's path portion. A URI's
 * query string or fragment (if any) is stripped first so a suffix match is
 * never defeated by trailing `?…`/`#…`, keeping detection stable when VS Code
 * passes URIs rather than bare paths.
 *
 * Requirements: 2.1, 2.2, 2.3.
 */

/** The kinds of Tomation DSL file, keyed by filename suffix. */
export type DslFileKind = 'pom' | 'test' | 'automation' | 'data';

/**
 * Suffix → kind mapping. Ordered most-specific-first is not required since the
 * suffixes are mutually exclusive, but the list is the single source of truth
 * for what counts as a DSL file.
 */
const KIND_BY_SUFFIX: ReadonlyArray<[string, DslFileKind]> = [
  ['.pom.ts', 'pom'],
  ['.test.ts', 'test'],
  ['.automation.ts', 'automation'],
  ['.data.ts', 'data'],
];

/**
 * Strip a URI's query string and fragment, leaving the path portion used for
 * suffix matching. A bare filesystem path passes through unchanged.
 */
function pathPortion(uriOrPath: string): string {
  const withoutFragment = uriOrPath.split('#', 1)[0];
  return withoutFragment.split('?', 1)[0];
}

/**
 * Return true when the given URI or path names a Tomation DSL file
 * (`*.pom.ts`, `*.test.ts`, `*.automation.ts`, `*.data.ts`).
 */
export function isDslFile(uriOrPath: string): boolean {
  return fileKind(uriOrPath) !== null;
}

/**
 * Return the DSL file kind for the given URI or path, or `null` when it is not
 * a DSL file.
 */
export function fileKind(uriOrPath: string): DslFileKind | null {
  const lower = pathPortion(uriOrPath).toLowerCase();
  for (const [suffix, kind] of KIND_BY_SUFFIX) {
    if (lower.endsWith(suffix)) {
      return kind;
    }
  }
  return null;
}
