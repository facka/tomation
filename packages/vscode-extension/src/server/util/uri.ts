/**
 * URI ↔ filesystem-path helpers.
 *
 * `vscode-uri` is not a dependency of this package, so the server does the
 * minimal `file://` ↔ path conversions the compiler pipeline expects. Both the
 * file-scoped path (which needs `uriToFsPath` for `.ts` detection / namespace
 * derivation) and the project-scoped path (which needs `fsPathToUri` to publish
 * per-file diagnostics keyed by URI) share these so the two never diverge on
 * how a path round-trips.
 *
 * Requirements: 6.3, 6.5.
 */

/**
 * Convert a document URI to a filesystem path.
 *
 * Strips the `file://` scheme and authority, then percent-decodes. Non-`file:`
 * URIs are returned unchanged (the engine only needs the extension for
 * detection in that case). A Windows drive path that arrives as `/C:/…` has its
 * leading slash dropped.
 */
export function uriToFsPath(uri: string): string {
  if (!uri.startsWith('file://')) {
    return uri;
  }
  // Drop "file://" and any authority up to the first path slash.
  let rest = uri.slice('file://'.length);
  const slash = rest.indexOf('/');
  rest = slash >= 0 ? rest.slice(slash) : rest;
  let fsPath: string;
  try {
    fsPath = decodeURIComponent(rest);
  } catch {
    fsPath = rest;
  }
  // Windows drive paths arrive as "/C:/..."; drop the leading slash.
  if (/^\/[A-Za-z]:/.test(fsPath)) {
    fsPath = fsPath.slice(1);
  }
  return fsPath;
}

/**
 * Convert a filesystem path to a `file://` URI, percent-encoding each path
 * segment (but preserving the separators) so a diagnostic published under this
 * URI matches the URI VS Code uses for the same file.
 *
 * This is the inverse of {@link uriToFsPath} for POSIX paths and Windows drive
 * paths (`C:\…` → `file:///C:/…`).
 */
export function fsPathToUri(fsPath: string): string {
  // Normalize Windows separators to forward slashes.
  let p = fsPath.replace(/\\/g, '/');

  // A Windows drive path ("C:/...") needs a leading slash for the URI form.
  const isWindowsDrive = /^[A-Za-z]:/.test(p);
  if (isWindowsDrive) {
    p = '/' + p;
  }

  // Encode each segment but keep the slashes as separators.
  const encoded = p
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    // encodeURIComponent turns a drive colon into %3A; restore it so paths
    // round-trip with uriToFsPath.
    .join('/')
    .replace(/%3A/gi, ':');

  return 'file://' + encoded;
}
