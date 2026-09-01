/**
 * DSL file detection.
 *
 * PLACEHOLDER — task 2.1 owns the real implementation. This minimal version
 * satisfies the type contract the server bootstrap wires against
 * (`isDslFile`, `fileKind`). Do not build out beyond the contract here.
 */

/** The kinds of Tomation DSL file, keyed by filename suffix. */
export type DslFileKind = 'pom' | 'test' | 'automation' | 'data';

const KIND_BY_SUFFIX: ReadonlyArray<[string, DslFileKind]> = [
  ['.pom.ts', 'pom'],
  ['.test.ts', 'test'],
  ['.automation.ts', 'automation'],
  ['.data.ts', 'data'],
];

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
  const lower = uriOrPath.toLowerCase();
  for (const [suffix, kind] of KIND_BY_SUFFIX) {
    if (lower.endsWith(suffix)) {
      return kind;
    }
  }
  return null;
}
