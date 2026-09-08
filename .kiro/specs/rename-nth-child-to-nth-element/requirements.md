# Requirements: Rename `nthChild` to `isNthElement`

## Introduction

The `where` matcher currently named `nthChild` is misleading in both name and behavior. Its
implementation counts an element's position among its DOM siblings (via `previousElementSibling`),
which mirrors the CSS `:nth-child()` pseudo-class. However, the intended purpose of a `where`
matcher is to filter the list of candidate elements produced by the tag query — not to inspect
DOM sibling position.

The intended semantics are: given the list of elements that match the element's tag (and pass the
other `where` conditions), `isNthElement(n)` should match the n-th element in that filtered list
(1-based). For example, if 5 elements match the tag filter, `isNthElement(2)` matches the second
one.

This spec renames the matcher from `nthChild` to `isNthElement` across the DSL, compiler, runtime,
VS Code extension (completions + hover docs), TypeScript declarations, generated finder snippet,
tests, and all user-facing documentation (README files, docs page, `tomation-ai.md`, examples). It
also changes the matching behavior from "position among DOM siblings" to "position among tag
matches."

### Terminology

- **DSL_Package** — `packages/dsl` (matcher factory functions + TypeScript declarations).
- **Compiler** — `packages/compiler` (parser extraction of matcher calls into descriptors).
- **Runtime** — `packages/extension/src/runtime.js` (DOM matching against `where` descriptors).
- **VSCode_Extension** — `packages/vscode-extension` (language-server completions and hover docs).
- **Candidate_List** — the ordered list of elements returned by `querySelectorAll(tag)` for an
  element descriptor, in document order.
- **Filtered_List** — the subset of the Candidate_List whose members pass all of the descriptor's
  other `where` conditions (every key except `isNthElement`), preserving document order.

## Requirements

### Requirement 1: DSL factory rename

**User Story:** As a test author, I want a matcher named `isNthElement`, so that the name reflects
that it filters by position within the matched element list.

#### Acceptance Criteria

1. THE DSL_Package SHALL export a factory function `isNthElement(n)` that returns the object
   `{ isNthElement: n }`.
2. THE DSL_Package SHALL NOT export a factory function named `nthChild`.
3. WHEN existing code imports `nthChild`, THE DSL_Package SHALL no longer resolve that import
   (the identifier is removed, not aliased), so that stale usages surface as errors rather than
   silently continuing with the old behavior.

### Requirement 2: TypeScript declaration updates

**User Story:** As a test author using TypeScript, I want accurate type declarations, so that
editor autocomplete and type-checking reflect the new matcher.

#### Acceptance Criteria

1. THE DSL_Package SHALL declare `isNthElement(n: number): { isNthElement: number }` in its
   TypeScript declaration file.
2. THE DSL_Package SHALL declare `isNthElement?: number` as an optional field of the
   `WhereDescriptor` interface.
3. THE DSL_Package SHALL include `{ isNthElement: number }` as a member of the `WhereMatcher`
   union type.
4. THE DSL_Package SHALL NOT contain any declaration referencing `nthChild`.

### Requirement 3: Compiler extraction rename

**User Story:** As a test author, I want the compiler to recognize `isNthElement`, so that my
`.where(isNthElement(n))` chains compile into the correct descriptor.

#### Acceptance Criteria

1. WHEN the Compiler encounters an `isNthElement(n)` call inside a `.where()` chain, THE Compiler
   SHALL extract the numeric literal argument and emit `{ isNthElement: n }` into the descriptor's
   `where` object.
2. WHEN the Compiler encounters an `isNthElement` call whose argument is not a numeric literal, or
   whose value is not a positive integer (≥ 1), THE Compiler SHALL emit a warning indicating that a
   positive integer argument is required and SHALL produce an empty descriptor.
3. THE Compiler SHALL NOT recognize `nthChild` as a matcher factory name; an unrecognized
   `nthChild` call SHALL fall through to the existing unknown-matcher behavior (empty descriptor).

### Requirement 4: Runtime matching semantics

**User Story:** As a test author, I want `isNthElement(n)` to select the n-th element among those
matching the tag and other filters, so that I can target items by their order in the result list.

#### Acceptance Criteria

1. WHEN the Runtime resolves an element descriptor whose `where` object contains an `isNthElement`
   key with value `n`, THE Runtime SHALL select the n-th member (1-based, document order) of the
   Filtered_List, where the Filtered_List is the Candidate_List filtered by all other `where`
   conditions.
2. WHEN the Filtered_List contains fewer than `n` members, THE Runtime SHALL treat the descriptor
   as unresolved (no element matches).
3. WHEN evaluating a single element in isolation (outside the ordered loop, e.g. per-element
   predicate checks), THE Runtime SHALL treat the `isNthElement` key as a non-failing no-op,
   because position among the Filtered_List cannot be determined from one element alone. The
   position decision SHALL be made by the ordered iteration over the Candidate_List.
4. THE Runtime SHALL NOT count DOM siblings (`previousElementSibling`) when evaluating
   `isNthElement`.
5. WHEN `n` is 1 and the Filtered_List is non-empty, THE Runtime SHALL select the first matching
   element (equivalent to the default first-match behavior).

### Requirement 5: Failure diagnostics

**User Story:** As a test author debugging a failed match, I want the failure breakdown to reflect
`isNthElement` meaningfully, so that I understand why no element was selected.

#### Acceptance Criteria

1. WHEN a descriptor containing `isNthElement` fails to resolve, THE Runtime failure breakdown
   SHALL report the `isNthElement` matcher using its new key name.
2. THE Runtime breakdown SHALL report, as the observed/actual value for `isNthElement`, the count
   of elements in the Filtered_List (i.e. how many candidates passed the other conditions), so the
   author can see whether the requested index was out of range.

### Requirement 6: Generated finder snippet

**User Story:** As a test author copying the generated finder snippet, I want it to use the new
matcher name and semantics, so that the snippet behaves like the runtime.

#### Acceptance Criteria

1. THE generated finder snippet SHALL use the key `isNthElement` in place of `nthChild`.
2. THE generated finder snippet SHALL select the n-th element among the filtered candidate list
   rather than counting DOM siblings, consistent with Requirement 4.

### Requirement 7: VS Code extension surface

**User Story:** As a test author using the VS Code extension, I want completion and hover docs to
reflect `isNthElement`, so that editor assistance is accurate.

#### Acceptance Criteria

1. THE VSCode_Extension completion provider SHALL offer `isNthElement` with the snippet
   `isNthElement(${1:n})` and SHALL NOT offer `nthChild`.
2. THE VSCode_Extension hover documentation SHALL describe `isNthElement` with a signature of
   `isNthElement(n)` and a description reflecting position among matched elements, and SHALL NOT
   contain a `nthChild` entry.

### Requirement 8: Documentation and examples

**User Story:** As a reader of the project docs, I want all references updated to `isNthElement`,
so that documentation matches the implementation.

#### Acceptance Criteria

1. THE project README (`README.md`) SHALL list `isNthElement(n)` with an accurate description and
   example, and SHALL NOT reference `nthChild`.
2. THE DSL package README, IF it references the matcher, SHALL use `isNthElement` and SHALL NOT
   reference `nthChild`.
3. THE docs page (`examples/playground/docs.html`) matcher table SHALL list `isNthElement(n)` with
   an accurate description and example, and SHALL NOT reference `nthChild`.
4. THE `tomation-ai.md` reference file SHALL list `isNthElement` in every matcher enumeration and
   any matcher table, and SHALL NOT reference `nthChild`.
5. Any example test/POM source that uses the matcher SHALL use `isNthElement` and SHALL NOT
   reference `nthChild`.

### Requirement 9: Test updates

**User Story:** As a maintainer, I want the test suite updated, so that it validates the new name
and semantics.

#### Acceptance Criteria

1. All existing tests referencing `nthChild` (DSL, compiler, runtime, integration, property tests)
   SHALL be updated to reference `isNthElement`.
2. THE runtime tests SHALL verify the new "position among filtered candidates" semantics — that
   `isNthElement(n)` selects the n-th element of the Filtered_List, and that an out-of-range `n`
   yields no match.
3. THE compiler tests SHALL verify that `isNthElement(n)` produces `{ isNthElement: n }` and that a
   non-integer argument produces a warning plus empty descriptor.

### Requirement 10: No residual references

**User Story:** As a maintainer, I want no leftover `nthChild` references, so that the rename is
complete and unambiguous.

#### Acceptance Criteria

1. WHEN the repository is searched for the string `nthChild` after this change, THE search SHALL
   return zero matches in shipped code, type declarations, generated snippets, the VS Code
   extension, user-facing documentation, and examples.
2. Historical spec documents under `.kiro/specs/extended-where-matchers/` and
   `.kiro/specs/docs-page/` MAY retain `nthChild` as historical record and are out of scope for
   this rename, EXCEPT where they would mislead current behavior; the primary success criterion of
   Requirement 10.1 applies to non-spec, shipped, and user-facing surfaces.
