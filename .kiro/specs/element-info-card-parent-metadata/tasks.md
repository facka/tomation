# Implementation Plan: Element Info Card Parent Metadata

## Overview

This plan implements inline-expandable parent rows with full metadata, tags every
resolved `childOf` ancestor with its own `tomation-key`, adds per-node "removed" and
"hidden-ancestor" notices, and marks the parent row that failed to resolve. Work is
sequenced foundation-first: shared type/message contracts and the compiler `parentChain`
come before the Runtime that consumes them, the Runtime before the composable, and the
composable before the Vue components that read its `HighlightOutcome`. Each feature task
is immediately followed by the property/example tests that validate it.

**Test execution note (workspace rule):** the developer runs all tests manually. Tasks in
this plan only **write** test files. No task runs `node --test`, any other test command, or
`node -c`. Runtime code stays ES5-style; panel code is TypeScript/Vue. Property tests use
`fast-check` (≥100 iterations) with `node:test` + `node:assert/strict` + `jsdom` for runtime,
and Vue component tests + `fast-check` for the panel. Each property test carries the tag
`// Feature: element-info-card-parent-metadata, Property <n>: <text>`.

## Tasks

- [x] 1. Extend shared message/trace contracts (additive)
  - [x] 1.1 Add `hiddenByAncestor?: boolean` to `HoverResult` in `messages.ts`
    - Add the optional field to the `HoverResult` interface in `packages/extension/panel-vue/src/types/messages.ts`, documented as "true when a Hidden_Ancestor hides the first match"
    - Keep the field additive so existing consumers are unaffected
    - _Requirements: 5.2, 6.4_
  - [x] 1.2 Add optional `key?: string` to `ParentTrace` in `findTrace.ts`
    - Add `key?: string` (the failed ancestor's raw Element_Key) to the `ParentTrace` shape used by `entry.findTrace.parent`
    - Document it as the primary card-match target, with `descriptorId` retained for back-compat
    - _Requirements: 7.2, 7.4_

- [ ] 2. Compile the ancestor `parentChain` in `background.js` (Req 3)
  - [ ] 2.1 Implement `buildParentChain` and emit `parentChain` from `buildStepMessage`
    - Add a `buildParentChain(childOfRef, pageElements)` helper that walks the `childOf` chain up `pageElements`, collecting `{ key, descriptor }` per ancestor, stopping on a missing ancestor or a cycle (a key already seen), then reverses to root → immediate-parent order
    - In `buildStepMessage`, when `descriptor.childOf` resolves, set `msg.parentChain` (when non-empty) and keep `msg.parentDescriptor`/`msg.parentKey` as back-compat aliases equal to the last (immediate) chain entry
    - Reuse existing `findParentKey` / `findParentDescriptor` helpers
    - _Requirements: 3.1, 3.2, 6.3, 6.4_
  - [ ]* 2.2 Write compiler example tests for `parentChain`
    - Assert `buildStepMessage` emits `parentChain` ordered root → immediate parent for a multi-level `childOf`
    - Assert `parentDescriptor`/`parentKey` still alias the immediate (last) entry
    - Assert a cycle or a missing ancestor terminates the walk with a finite chain
    - _Requirements: 3.1, 3.2, 6.4_

- [ ] 3. Resolve and tag every ancestor in `runtime.js` (Req 3, Req 6)
  - [ ] 3.1 Refactor `findElementWithParent` to `resolveParentChain`
    - When `stepMessage.parentChain` is present (length ≥ 1), resolve the chain iteratively root → immediate parent: for each ancestor call `findElement(ancestor.descriptor, scope)`, apply the ancestor's `navigate` hops (Navigate-then-scope), `tagElementKey(resolved, ancestor.key)`, then use the resolved element as the scope for the next level
    - Resolve the child with `findElement(elementDescriptor, finalScope)`
    - Fall back to the existing single-`parentDescriptor` path when `parentChain` is absent
    - Short-circuit on the first unresolved ancestor: set no tag for it, preserve every earlier tag and all existing page `tomation-key` values, and record the failed ancestor's Element_Key (`ancestor.key`) on the parent-resolution failure outcome (alongside the preserved `descriptorId`)
    - Preserve element-matching semantics, the 5s `findElement` timeout, parent-scoping, and Action_Highlight independence unchanged; keep runtime code ES5-style
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 6.1, 6.2, 6.3, 6.5, 6.6_
  - [ ]* 3.2 Write Property 1 test — every resolved ancestor tagged with exactly its own key
    - `// Feature: element-info-card-parent-metadata, Property 1: ...`
    - jsdom + `runtime.js`/`background.js`; random `childOf` chains (depth ≥ 1 incl. ≥ 2), random key sets incl. empty/whitespace; assert each resolved non-empty-key ancestor carries exactly one matching `tomation-key`, empty-key ancestors carry none, and N ≥ 1 repeats leave exactly one
    - _Requirements: 3.1, 3.2, 3.3, 3.8_
  - [ ]* 3.3 Write Property 2 test — unresolved ancestors not tagged, existing tags preserved
    - `// Feature: element-info-card-parent-metadata, Property 2: ...`
    - Random chains where some ancestor cannot resolve; assert no tag for the unresolved ancestor and every pre-existing `tomation-key` (incl. earlier-in-walk tags) is unchanged
    - _Requirements: 3.4_
  - [ ]* 3.4 Write Property 3 test — tagging does not change which elements resolve
    - `// Feature: element-info-card-parent-metadata, Property 3: ...`
    - Resolve the same chain with and without pre-existing `tomation-key` attributes; assert identical resolved child and ancestors and that `tomation-key` is never evaluated as a `where` matcher key
    - _Requirements: 3.5, 6.3_
  - [ ]* 3.5 Write Property 4 test — key/active/hover attributes independent and key tags persist
    - `// Feature: element-info-card-parent-metadata, Property 4: ...`
    - Random sequences of tag / `highlightElement` / `unhighlightElement` / hover-set / hover-clear; assert each attribute changes only for its own operation, `data-tomation-active` + `data-tomation-hover` can coexist, removing `data-tomation-active` leaves `tomation-key` intact
    - _Requirements: 3.6, 3.7, 6.1, 6.2_
  - [ ]* 3.6 Write Property 5 test — chain scoping resolves each level within the previous
    - `// Feature: element-info-card-parent-metadata, Property 5: ...`
    - Random chains; assert each ancestor resolves within the previous ancestor's subtree and the final child search is scoped to the innermost ancestor (an otherwise-matching element outside it is not found)
    - _Requirements: 6.5_
  - [ ]* 3.7 Write runtime scoping/navigate example tests (Req 6)
    - Example tests: a `childOf` parent scopes the child search (6.5); a parent carrying `navigate` uses the navigated element as the child search root (6.6); Action_Highlight set/remove around a step is unchanged (6.1); retain existing 5s-timeout example tests unchanged (6.3)
    - _Requirements: 6.1, 6.3, 6.5, 6.6_

- [ ] 4. Hidden-ancestor detection in `runtime.js` (Req 5)
  - [ ] 4.1 Implement `detectHiddenAncestor(el)` and wire the flag into hover handlers
    - Add a read-only `detectHiddenAncestor(el)` walking ancestors for `display:none`, `visibility:hidden`/`collapse`, `opacity:0`, zero-size, and `overflow` clipping, plus the `offsetParent === null` (non-`fixed`) not-rendered case, using only `getComputedStyle` and `getBoundingClientRect` (never writes styles/attributes)
    - Add `hiddenByAncestor: detectHiddenAncestor(matches[0])` to the non-empty returns of `handleHoverHighlight`, `handleHoverHighlightXPath`, and `handleHoverHighlightDescriptor`; keep zero-match returns at `found: 0` with the flag omitted/false; leave `handleHoverClear` unchanged
    - Keep runtime code ES5-style
    - _Requirements: 5.1, 5.2, 5.4_
  - [ ]* 4.2 Write Property 8 test — hidden flag equals condition and preserves the count
    - `// Feature: element-info-card-parent-metadata, Property 8: ...`
    - jsdom DOMs with the first match visible or ancestor-hidden (using `getBoundingClientRect` stubs for zero-size/overflow sub-cases); assert `hiddenByAncestor` is true exactly when a Hidden_Ancestor hides it and `found` equals the baseline handler's count
    - _Requirements: 5.1, 5.2_
  - [ ]* 4.3 Write Property 9 test — detection is non-mutating
    - `// Feature: element-info-card-parent-metadata, Property 9: ...`
    - Snapshot inline styles/classes/attributes of the element and ancestors before/after `detectHiddenAncestor`; assert identical and that no revealing style is applied
    - _Requirements: 5.4_

- [ ] 5. Checkpoint — runtime & compiler layer
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Return a `HighlightOutcome` from `useElementHighlight.ts` (Req 4, Req 5)
  - [ ] 6.1 Change the composable to resolve to `HighlightOutcome | null` and update callers
    - Add `export interface HighlightOutcome { found: number; hiddenByAncestor: boolean }`
    - Change `highlight` / `highlightXPath` / `highlightDescriptor` / `highlightNode` to resolve to `HighlightOutcome | null` (`null` = undelivered request, Req 2.9)
    - `debouncedHighlight` maps the raw `HoverResult` to `res ? { found: res.found, hiddenByAncestor: res.hiddenByAncestor === true } : null`; `highlightNode`'s key-then-descriptor fallback now compares `outcome.found > 0`; keep the single-active-key `clearNow`-before-`start` handoff unchanged
    - Update all callers (`ElementInfoCard.vue`, `LogEntry.vue`) to read the new object shape
    - _Requirements: 4.1, 4.3, 5.2, 6.4, 2.7, 2.9_
  - [ ]* 6.2 Write Property 6 test — single-active row handoff never leaves two rows highlighted
    - `// Feature: element-info-card-parent-metadata, Property 6: ...`
    - Drive a sequence of distinct chain-row hovers through `useElementHighlight`, record ordered sent messages, assert each `HOVER_CLEAR` for the prior row precedes the next `HOVER_HIGHLIGHT`
    - _Requirements: 2.7_

- [ ] 7. Shared `ChainNodeMeta.vue` metadata component (Req 1.4, 1.9)
  - [ ] 7.1 Extract the metadata block into `ChainNodeMeta.vue`
    - Create `packages/extension/panel-vue/src/components/ChainNodeMeta.vue` with a `node: ElementChainNode` prop, rendering Tag (when `descriptor.tag`), Key (always), XPath (when `descriptor.xpath`) else Where lines (when `descriptor.where`), and Navigate (when `descriptor.navigate`)
    - Move `whereLines()` into this component (or a shared util it imports) so self and parents use one code path
    - _Requirements: 1.4, 1.9_
  - [ ]* 7.2 Write Property 11 test — expanded metadata field presence mirrors the descriptor
    - `// Feature: element-info-card-parent-metadata, Property 11: ...`
    - `fast-check` over generated `PageElement` descriptors; render `ChainNodeMeta` and assert the rendered field set equals the descriptor's present-field set, identically for self and parent nodes
    - _Requirements: 1.4, 1.9_

- [ ] 8. Refactor `ElementInfoCard.vue` — expandable rows, notices, indicator
  - [ ] 8.1 Add props, expansion state, and refactor the self region to `ChainNodeMeta`
    - Add additive props `parentResolution?: ParentTrace` (from `entry.findTrace.parent`); keep `elementKey`, `pageElements`, `removed` (now the self-node fallback)
    - Add `expandedKeys = reactive(new Set<string>())` with `toggleExpand(key)` flipping only that key; render the self region via `<ChainNodeMeta :node="self" />`
    - _Requirements: 1.7, 1.9_
  - [ ] 8.2 Render expandable parent rows with orthogonal hover/click
    - Render one row per ancestor in Element_Chain order (immediate parent first); collapsed row shows label + tag chip + expand affordance (`aria-expanded`), no-descriptor rows show "not defined in spec" with the toggle `disabled` and no metadata
    - `@click.stop` toggles expansion (only when `parent.descriptor`); mount `<ChainNodeMeta>` only when expanded and descriptor present; keep the card the single open popup (open no second popup)
    - Wire `@pointerenter="onNodeEnter(parent)"` / `@pointerleave="onNodeLeave"` independently of click; `onNodeEnter` skips nodes with neither key nor descriptor (Req 2.5), sets `hoverState.key`, awaits `highlightNode`, and guards against a late result after leave; `onNodeLeave` calls `clear()` and resets `hoverState`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2, 2.5, 2.6, 2.8_
  - [ ] 8.3 Per-node removed and hidden-ancestor notices
    - Add `hoverState = reactive({ key, found, hidden })`; `isHoveredRemoved(node)` = `hoverState.key === node.key && hoverState.found === 0 && nodeResolvedDuringRun(node)`; `isHoveredHidden(node)` = `hoverState.key === node.key && hoverState.hidden`
    - `nodeResolvedDuringRun`: self uses `props.removed`; a parent counts as resolved-during-run when it is not `failedParentKey` and has a descriptor (keeps the removed notice off the failed row)
    - Render the removed notice and the hidden-ancestor notice per row, shown only while that node is hovered; clear both on leave
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.3, 5.5, 5.6_
  - [ ] 8.4 Parent-not-found indicator via `failedParentKey`
    - Add `failedParentKey` computed derived purely from `props.parentResolution`: `null` when absent/resolved; else match the chain node by the failed ancestor's key (`p.key ?? p.descriptorId`, secondary defensive match on `descriptor.where.id`); mark exactly that row and no other (no DOM resolution)
    - Apply an `eic-not-found` state on the matched row, allow expansion when it has a descriptor (Req 7.5), and keep it visually distinct from collapsed/expanded and from the removed notice
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  - [ ] 8.5 Add CSS for the new row states
    - Add styles for the expand chevron/`aria-expanded` affordance, the disabled no-descriptor row, the parent-not-found indicator, and the hidden-ancestor notice, ensuring the not-found and removed states are visually distinct (Req 7.6)
    - _Requirements: 1.2, 5.3, 7.1, 7.6_
  - [ ]* 8.6 Write Property 7 test — removed notice iff resolved during run and no match remains
    - `// Feature: element-info-card-parent-metadata, Property 7: ...`
    - Pure `fast-check` property over `(resolvedDuringRun: boolean, found: number | null)`; assert the removed notice shows iff `resolvedDuringRun && found === 0`
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ]* 8.7 Write Property 10 test — parent-not-found marks exactly the unresolved node
    - `// Feature: element-info-card-parent-metadata, Property 10: ...`
    - `fast-check` over generated chains and `ParentTrace` outcomes; assert exactly the node matching by the failed ancestor's Element_Key is marked and zero rows for resolved/absent/unmatched outcomes
    - _Requirements: 7.1, 7.2, 7.3_
  - [ ]* 8.8 Write Property 12 test — row expansion toggles exactly one row and is its own inverse
    - `// Feature: element-info-card-parent-metadata, Property 12: ...`
    - `fast-check` over random row-key sets and toggle sequences against the `Set<string>` model; assert single-key flips, others unchanged, toggle-twice identity, and simultaneous multi-expansion
    - _Requirements: 1.5, 1.7_
  - [ ]* 8.9 Write card component/example tests (Req 1, 2, 4, 5, 7)
    - Rendering: one row per ancestor in order (1.1); collapsed row shows label + tag + `aria-expanded=false` (1.2); activate expands (1.3) / re-activate collapses (1.5); no-descriptor row shows "not defined in spec" + no metadata (1.6); exactly one `role="dialog"` after expansion (1.8); self + expanded parent both render `<ChainNodeMeta>` (1.9)
    - Hover: `pointerenter` on self/parent calls `highlightNode(key, descriptor)` (2.1, 2.2); neither-key-nor-descriptor issues no request (2.5); `pointerleave` calls `clear()` (2.6); unmount mid-hover clears (2.8); null outcome leaves DOM unchanged (2.9)
    - Notices: removed on `found === 0` for a resolved node, gone on leave (4.1, 4.4); none when `found ≥ 1` (4.3); hidden notice when `hiddenByAncestor` reported, gone on leave (5.3, 5.6); none when visible (5.5)
    - Indicator: marked failed row distinct from collapsed/expanded and from removed notice (7.1, 7.6); resolved/absent marks nothing (7.3); marking uses props only (7.4); marked row with descriptor still expandable (7.5)
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 1.9, 2.1, 2.2, 2.5, 2.6, 2.8, 2.9, 4.1, 4.3, 4.4, 5.3, 5.5, 5.6, 7.1, 7.3, 7.4, 7.5, 7.6_

- [ ] 9. Wire `LogEntry.vue` to supply `parentResolution` (Req 4, Req 7)
  - [ ] 9.1 Pass `parentResolution` and update the removed-notice read
    - Add `:parent-resolution="entry.findTrace?.parent"` to both `<ElementInfoCard>` usages
    - Update `showRemovedMessage` logic to read the new outcome object (`outcome?.found === 0`); no other change
    - _Requirements: 4.1, 7.1, 7.2, 7.4_

- [ ] 10. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and are not implemented by the coding agent; they are authored as files and the developer runs them manually per workspace rules.
- Each task references specific requirement sub-clauses for traceability.
- The 12 correctness properties map to tasks: P1 → 3.2, P2 → 3.3, P3 → 3.4, P4 → 3.5, P5 → 3.6, P6 → 6.2, P7 → 8.6, P8 → 4.2, P9 → 4.3, P10 → 8.7, P11 → 7.2, P12 → 8.8.
- Runtime code stays ES5-style; panel code is TypeScript/Vue. Existing helpers (`findElement`, `findParentKey`, `findParentDescriptor`, `tagElementKey`, `applyNavigateSteps`, `buildElementChain`, `whereLines`) are reused.
- `HoverResult.hiddenByAncestor` and `ParentTrace.key` are additive; `parentDescriptor`/`parentKey` remain as back-compat aliases.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["2.2", "3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "6.1", "7.1"] },
    { "id": 4, "tasks": ["6.2", "7.2", "8.1"] },
    { "id": 5, "tasks": ["8.2"] },
    { "id": 6, "tasks": ["8.3"] },
    { "id": 7, "tasks": ["8.4"] },
    { "id": 8, "tasks": ["8.5"] },
    { "id": 9, "tasks": ["8.6", "8.7", "8.8", "8.9", "9.1"] }
  ]
}
```
