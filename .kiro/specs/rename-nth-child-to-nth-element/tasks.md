# Tasks: Rename `nthChild` to `isNthElement`

## Overview

Rename the `where` matcher `nthChild` → `isNthElement` and change its semantics from "position among
DOM siblings" to "position among the filtered candidate list" (n-th matching element, 1-based).
Update all code layers (DSL, compiler, runtime, finder snippet, VS Code extension), tests, and
user-facing documentation. Execute one task at a time and wait for confirmation between tasks.

## Tasks

- [x] 1. DSL package: rename factory and types
  - In `packages/dsl/index.js`, rename `nthChild(n)` → `isNthElement(n)` returning
    `{ isNthElement: n }`, and update the exports object key.
  - In `packages/dsl/index.d.ts`, replace the `nthChild` declaration with
    `isNthElement(n: number): { isNthElement: number }`; replace `nthChild?: number` in
    `WhereDescriptor` with `isNthElement?: number`; replace the `{ nthChild: number }` union member
    with `{ isNthElement: number }`.
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4_

- [~] 2. Compiler: rename matcher extraction
  - In `packages/compiler/src/parser.js`, change the numeric-arg branch to match callee name
    `isNthElement` and emit `{ isNthElement: n }`; update the warning message text to reference
    `isNthElement`.
  - _Requirements: 3.1, 3.2, 3.3_

- [~] 3. Runtime: change matcher to no-op and add list-position selection
  - In `packages/extension/src/runtime.js` `evaluateWhereKey`, replace the `nthChild` case (the
    `previousElementSibling` counter) with an `isNthElement` case that returns
    `{ passed: true, actual: UNAVAILABLE }` (no-op).
  - In the finder poll loop, compute `nthTarget` from `where.isNthElement` (or `null`), track a
    1-based running count of candidates passing `matchesWhere`, and resolve the candidate whose
    running count equals `nthTarget` (or the first passing candidate when `nthTarget` is null).
  - Confirm the standalone sibling-index block near line ~988 is unrelated to the matcher (element
    find-trace / CSS path) and leave it untouched; only remove sibling counting that served the
    matcher.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [~] 4. Runtime: highlight query + any-match collection position selection
  - In the highlight query path (~line 830), when `where.isNthElement` is present, select only the
    n-th element among those passing `matchesWhere` (or none if out of range), so highlight matches
    the finder's choice.
  - _Requirements: 4.1, 4.2_

- [~] 5. Runtime: failure breakdown reporting
  - In `buildWhereBreakdown`, special-case the `isNthElement` entry: set `expected` to `n`, set
    `actual` to the count of candidates passing the other conditions (Filtered_List size), and set
    `passed` to `filteredCount >= n`.
  - _Requirements: 5.1, 5.2_

- [~] 6. Finder snippet: rename key and apply list-position selection
  - In `packages/extension/panel-vue/src/logic/finderSnippet.ts`, replace the `nthChild` per-element
    predicate with an `isNthElement` no-op predicate, and adjust the emitted matching loop to track
    a running match index and return the n-th matching element when `isNthElement` is present.
  - Update the comment/matcher-key list in the file header to reference `isNthElement`.
  - _Requirements: 6.1, 6.2_

- [~] 7. VS Code extension: completion + hover docs
  - In `packages/vscode-extension/src/server/providers/completionProvider.ts`, replace the
    `nthChild` entry with `{ name: 'isNthElement', snippet: 'isNthElement(${1:n})' }`.
  - In `packages/vscode-extension/src/server/providers/docs.ts`, replace the `nthChild` doc entry
    with an `isNthElement` entry (signature `isNthElement(n)`, description reflecting position among
    matched elements).
  - _Requirements: 7.1, 7.2_

- [~] 8. Documentation: README, docs page, tomation-ai.md, DSL README
  - `README.md`: update the matcher table row to `isNthElement(n)` with an accurate description and
    `is.LI.where(isNthElement(3))` example.
  - `examples/playground/docs.html`: update the matcher table `<tr>` to `isNthElement(n)` with an
    accurate description and example (HTML-escaped).
  - `tomation-ai.md`: update every matcher enumeration list and the matcher table row to
    `isNthElement`.
  - `packages/dsl/README.md`: if it references the matcher, update it to `isNthElement`.
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [~] 9. Examples: update any POM/test sources using the matcher
  - Search `examples/` for `nthChild` usages and update to `isNthElement`.
  - _Requirements: 8.5_

- [~] 10. Tests: update names and add new-semantics coverage
  - Update DSL, compiler, runtime, integration, and property tests referencing `nthChild` to use
    `isNthElement`.
  - Add/adjust runtime tests: `isNthElement(n)` selects the n-th element of the filtered list;
    out-of-range `n` yields no match and the breakdown reports the filtered count.
  - Adjust compiler tests: `isNthElement(3)` → `{ isNthElement: 3 }`; non-integer arg → warning +
    empty descriptor.
  - Do not execute tests; the user will run them.
  - _Requirements: 9.1, 9.2, 9.3_

- [~] 11. Final sweep: confirm no residual references
  - Search shipped code, type declarations, generated snippets, the VS Code extension, user-facing
    docs, and examples for `nthChild` and confirm zero matches (historical `.kiro/specs/` documents
    excluded).
  - _Requirements: 10.1, 10.2_
