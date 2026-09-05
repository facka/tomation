import type { PageElement } from '@/types/spec';

/**
 * Build a self-contained, copy-pasteable JavaScript expression (a "Finder_Snippet")
 * that reproduces the Tomation element finder for a failed step's descriptor.
 *
 * The developer pastes the returned string into the browser DevTools console on the
 * page under test; it logs the candidate/match counts (tag+where strategy) or the
 * matched node count (xpath strategy) so they can observe why nothing matched.
 *
 * This is a PURE STRING BUILDER — it must never execute the snippet. All interpolated
 * values are JSON-encoded so quoting/escaping is always safe.
 *
 * The matcher predicates mirror `runtime.js` `evaluateWhereKey` for the supported keys:
 * id, textIs, textContains, classIncludes, placeholder, name, type, value, ariaLabel,
 * role, title, hrefContains, isDisabled, dataAttr, nthChild. `closestLabel`/`navigate`
 * are not fully reproduced (a note is appended when present).
 *
 * @param descriptor - the element descriptor resolved from pageElements[entry.target]
 * @param parentDescriptor - the resolved parent descriptor when descriptor.childOf is set
 * @returns runnable JS as a string (never executed here)
 */
export function buildFinderSnippet(
  descriptor: PageElement,
  parentDescriptor?: PageElement | null
): string {
  // --- XPath strategy ---
  if (descriptor.xpath) {
    const xpath = JSON.stringify(descriptor.xpath);
    return [
      '// Reproduces tomation\'s XPath finder. Paste into the DevTools console.',
      '(() => {',
      '  const xpath = ' + xpath + ';',
      '  const snap = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);',
      '  console.log(snap.snapshotLength + \' node(s) match\', Array.from({length: snap.snapshotLength}, (_, i) => snap.snapshotItem(i)));',
      '  return snap.snapshotLength ? snap.snapshotItem(0) : null;',
      '})();',
    ].join('\n');
  }

  // --- tag+where strategy ---
  const tag = JSON.stringify(descriptor.tag || '*');
  const where = JSON.stringify(descriptor.where || {});

  const lines: string[] = [];
  lines.push('// Reproduces tomation\'s element finder. Paste into the DevTools console.');
  lines.push('(() => {');
  // Matcher predicates mirror runtime.js evaluateWhereKey for the supported keys.
  lines.push('  const matchers = {');
  lines.push('    id: (el, v) => el.id === v,');
  lines.push('    textIs: (el, v) => el.textContent.trim() === v,');
  lines.push('    textContains: (el, v) => el.textContent.includes(v),');
  lines.push('    classIncludes: (el, v) => el.className.split(\' \').includes(v),');
  lines.push('    placeholder: (el, v) => el.getAttribute(\'placeholder\') === v,');
  lines.push('    name: (el, v) => el.getAttribute(\'name\') === v,');
  lines.push('    type: (el, v) => el.getAttribute(\'type\') === v,');
  lines.push('    ariaLabel: (el, v) => el.getAttribute(\'aria-label\') === v,');
  lines.push('    role: (el, v) => el.getAttribute(\'role\') === v,');
  lines.push('    title: (el, v) => el.getAttribute(\'title\') === v,');
  lines.push('    value: (el, v) => el.value === v,');
  lines.push('    hrefContains: (el, v) => (el.getAttribute(\'href\') || \'\').includes(v),');
  lines.push('    isDisabled: (el, v) => el.disabled === true,');
  lines.push('    dataAttr: (el, v) => el.getAttribute(\'data-\' + v.name) === v.value,');
  lines.push('    nthChild: (el, v) => { let p = 1, s = el.previousElementSibling; while (s) { p++; s = s.previousElementSibling; } return p === v; },');
  lines.push('  };');
  lines.push('  const tag = ' + tag + ';');
  lines.push('  const where = ' + where + ';');

  // childOf: scope the search root to the parent element and reference its conditions.
  if (parentDescriptor) {
    const parentTag = parentDescriptor.tag || '*';
    const parentWhere = JSON.stringify(parentDescriptor.where || {});
    // When the parent carries navigate hops, the real scope root is the parent
    // AFTER applying those hops (Navigate-then-scope). Surface it in the comment;
    // the executable placeholder root stays `document`.
    const parentNavNote = parentDescriptor.navigate
      ? ' navigate: ' + JSON.stringify(parentDescriptor.navigate) + ' —'
      : '';
    lines.push(
      '  const root = document; // childOf: ' + parentTag + ' where ' + parentWhere +
      parentNavNote + ' — replace with the parent element to scope the search'
    );
  } else {
    lines.push('  const root = document;');
  }

  lines.push('  const candidates = [...root.querySelectorAll(tag)];');
  lines.push('  const matches = candidates.filter(el => Object.entries(where).every(([k, v]) => matchers[k] ? matchers[k](el, v) : true));');
  lines.push('  console.log(candidates.length + \' <\' + tag + \'> candidate(s), \' + matches.length + \' match\', matches);');
  lines.push('  return matches;');
  lines.push('})();');

  // Note when the descriptor uses modes the snippet does not fully reproduce.
  const hasClosestLabel = !!(descriptor.where && 'closestLabel' in descriptor.where);
  const hasNavigate = !!descriptor.navigate;
  if (hasClosestLabel || hasNavigate) {
    lines.push('// note: closestLabel/navigate is not reproduced in this snippet');
  }

  return lines.join('\n');
}
