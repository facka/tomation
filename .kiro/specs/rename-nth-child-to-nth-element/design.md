# Design: Rename `nthChild` to `isNthElement`

## Overview

This change renames the `where` matcher `nthChild` → `isNthElement` and changes its matching
semantics from "position among DOM siblings" to "position among the filtered candidate list."

The rename spans six code surfaces plus documentation:

1. **DSL** (`packages/dsl/index.js`, `packages/dsl/index.d.ts`) — factory + types.
2. **Compiler** (`packages/compiler/src/parser.js`) — matcher extraction.
3. **Runtime** (`packages/extension/src/runtime.js`) — DOM matching + failure breakdown.
4. **Finder snippet** (`packages/extension/panel-vue/src/logic/finderSnippet.ts`) — generated code.
5. **VS Code extension** (`completionProvider.ts`, `docs.ts`) — editor assistance.
6. **Docs/examples/readmes** (`README.md`, `examples/playground/docs.html`, `tomation-ai.md`, DSL
   README, example POM/test sources).

The semantic change is the interesting part. The name change is mechanical.

## Semantic model

### Current behavior (to be removed)

`evaluateWhereKey(el, 'nthChild', value)` counts `el.previousElementSibling` links to compute a
1-based DOM sibling position and returns `passed: pos === value`. This is a pure per-element
predicate — it needs only the element itself.

### New behavior

`isNthElement(n)` is a **list-position** filter, not a per-element property. Its meaning depends on
the element's index within the Filtered_List (candidates that pass all *other* `where` keys, in
document order). A single element cannot know its own index into that list, so the decision must
move to the iteration site that owns the list.

Two-phase evaluation per descriptor resolution:

1. **Filter phase** — iterate the Candidate_List (`querySelectorAll(tag)` results). For each
   candidate, evaluate all `where` keys *except* `isNthElement`. Collect the passing candidates
   into the Filtered_List, preserving document order.
2. **Position phase** — if `isNthElement` is present with value `n`, select `Filtered_List[n - 1]`
   (1-based). If the list has fewer than `n` members, there is no match.

When `isNthElement` is absent, behavior is unchanged: the first candidate passing all keys wins.

### Why `matchesWhere` treats `isNthElement` as a no-op

`matchesWhere(el, where)` is called per-element in several loops. To keep it a pure predicate and
avoid it silently rejecting the "wrong index" elements (which would break the two-phase logic), the
per-key evaluator returns `passed: true` for `isNthElement`. The position decision is layered on top
by the loop, which counts passing candidates and picks the n-th. This keeps `matchesWhere`
composable and its other callers (highlight query, breakdown) correct.

## Component changes

### 1. DSL package

`packages/dsl/index.js`:

```js
// before
function nthChild(n) {
  return { nthChild: n };
}
// ... exports: nthChild: nthChild,

// after
function isNthElement(n) {
  return { isNthElement: n };
}
// ... exports: isNthElement: isNthElement,
```

`packages/dsl/index.d.ts`:

```ts
// WhereDescriptor: replace `nthChild?: number;` with `isNthElement?: number;`
// WhereMatcher union: replace `| { nthChild: number }` with `| { isNthElement: number }`
// declaration: replace with
export declare function isNthElement(n: number): { isNthElement: number };
```

### 2. Compiler

`packages/compiler/src/parser.js` — the numeric-arg branch:

```js
// Numeric-arg: isNthElement
if (calleeName === 'isNthElement') {
  const n = extractNumber(args[0]);
  if (n === null || !Number.isInteger(n) || n < 1) {
    warnings.push({
      message: `'isNthElement' requires a positive integer argument at ${filePath}:${line}`,
      filePath,
      line,
    });
    return {};
  }
  return { isNthElement: n };
}
```

The extraction/validation logic is unchanged; only the callee name and emitted key change.

### 3. Runtime

`packages/extension/src/runtime.js`:

**a. `evaluateWhereKey` — the `nthChild` case becomes a no-op `isNthElement` case:**

```js
case 'isNthElement':
  // Position among the filtered candidate list is resolved by the iterating
  // loop, not per-element. Treat as a non-failing no-op here.
  return { passed: true, actual: UNAVAILABLE };
```

This removes the `previousElementSibling` counting entirely.

**b. Finder poll loop (`waitForElement` / normal tag+where polling, ~line 604):**

Introduce position-aware selection. Compute the desired index from `where.isNthElement` (or default
to "first match" when absent):

```js
var nthTarget = (where && typeof where.isNthElement === 'number') ? where.isNthElement : null;

function poll() {
  var candidates = root.querySelectorAll(tag);
  maxSeenCandidates = Math.max(maxSeenCandidates, candidates.length);
  var matchIndex = 0;
  for (var i = 0; i < candidates.length; i++) {
    if (matchesWhere(candidates[i], where, root === document ? null : root)) {
      matchIndex++;                       // 1-based count of passing candidates
      if (nthTarget === null || matchIndex === nthTarget) {
        resolve(candidates[i]);
        return;
      }
    }
  }
  // ...existing timeout/breakdown path unchanged aside from actual-count reporting
}
```

Because `matchesWhere` returns `true` for the `isNthElement` key (no-op), the count reflects
elements passing the *other* conditions — exactly the Filtered_List. When `nthTarget` is set, we
resolve only when the running count equals it.

**c. Highlight query path (~line 830) and any-match collection:**

The highlight collector gathers all elements passing `matchesWhere`. If `isNthElement` is present,
the collector should return only the n-th passing element (or none if out of range), matching the
finder. This keeps "highlight the element the finder would pick" accurate.

**d. Failure breakdown (`buildWhereBreakdown`):**

For the `isNthElement` entry, report `actual` as the number of candidates that passed the other
conditions (the Filtered_List size), so the author sees whether the requested index was reachable.
Because `evaluateWhereKey` reports `UNAVAILABLE` per-element, the breakdown builder will special-case
`isNthElement` to fill `actual` with the filtered count computed during the pass. `expected` remains
`n`, and `passed` is `filteredCount >= n`.

**e. Remove/adjust the standalone DOM-sibling counter at ~line 988** if it exists solely to serve
`nthChild`. On inspection this block computes an nth-child index for a different purpose (element
find-trace / CSS-path). It is NOT the matcher and MUST be left intact unless it was added for the
matcher. Design decision: leave unrelated sibling-index utilities untouched; only the matcher case
changes. This will be confirmed during implementation by reading the surrounding function.

### 4. Finder snippet

`packages/extension/panel-vue/src/logic/finderSnippet.ts` currently emits a per-element predicate:

```ts
lines.push('    nthChild: (el, v) => { let p = 1, s = el.previousElementSibling; ... return p === v; },');
```

Because `isNthElement` is list-positional, it cannot be a per-element predicate in the snippet's
matcher map. The snippet must select the n-th passing element after filtering. The emitted snippet's
matching loop will be adjusted to track a running match index and, when `isNthElement` is present,
return the n-th match. The `isNthElement` entry in the predicate map becomes a no-op predicate
(returns `true`), mirroring the runtime, and the surrounding loop applies the index selection.

### 5. VS Code extension

`completionProvider.ts`:

```ts
{ name: 'isNthElement', snippet: 'isNthElement(${1:n})' },
```

`docs.ts`:

```ts
isNthElement: {
  description: 'Match the n-th element (1-based) among the elements matching the tag and other filters.',
  signature: 'isNthElement(n)',
},
```

### 6. Documentation and examples

- `README.md` matcher table row → `isNthElement(n)` | "N-th matching element (1-based)" |
  `is.LI.where(isNthElement(3))`.
- `examples/playground/docs.html` matcher table row → same content, HTML-escaped into the existing
  styled `<tr>`.
- `tomation-ai.md` — update every matcher enumeration list and the matcher table row. Description:
  "N-th matching element (1-based)".
- DSL README (`packages/dsl/README.md`) — if present and referencing the matcher, update it.
- Example sources referencing the matcher (if any in `examples/`) — update to `isNthElement`.

## Testing strategy

### Runtime (`runtime.test.js`, `runtime.property.test.js`)

- Replace `nthChild` tests with `isNthElement`.
- New behavior test: given a DOM with N elements matching a tag, resolving a descriptor with
  `{ isNthElement: k }` selects the k-th matching element in document order.
- Filtered semantics: with an additional `where` condition, the index counts only elements that
  also pass that condition.
- Out-of-range: `isNthElement` greater than the filtered count yields no match (and the breakdown
  reports the filtered count as `actual`).
- Property test: for any `k` in `[1, matchCount]`, the resolved element equals the k-th element of
  the manually filtered list.

### Compiler (`extended-matchers-integration.test.js`, `parser.test.js`)

- `is.LI.where(isNthElement(3))` compiles to `{ isNthElement: 3 }`.
- Non-integer argument → warning + empty descriptor.

### DSL

- `isNthElement(3)` returns `{ isNthElement: 3 }`.

Note: per workspace rules, tests are authored but executed by the user; the implementation tasks
will write/adjust tests and leave execution to the user.

## Migration / compatibility

This is a breaking rename with no backward-compatible alias (Requirement 1.3). Any external code
using `nthChild` will fail to import/compile after the change, which is the intended signal. The
semantic change also means existing `nthChild(n)` usages that relied on DOM-sibling position would
behave differently under `isNthElement(n)`; within this repository there are no such runtime usages
except documentation examples, which are updated.

## Risk notes

- The runtime has multiple candidate-iteration sites (finder poll, highlight query, breakdown).
  Each must apply consistent position selection, or highlight/breakdown will disagree with the
  finder. The design routes all three through the same "count passing candidates, pick n-th" rule.
- The finder snippet is user-facing generated code; its loop change must remain self-contained and
  dependency-free.
