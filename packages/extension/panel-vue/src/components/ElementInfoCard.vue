<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive } from 'vue';
import type { PageElement } from '@/types/spec';
import type { ParentTrace } from '@/types/findTrace';
import type { ElementChainNode } from '@/logic/elementChain';
import { buildElementChain, toHighlightDescriptor } from '@/logic/elementChain';
import { useElementHighlight } from '@/composables/useElementHighlight';
import ChainNodeMeta from '@/components/ChainNodeMeta.vue';

const props = defineProps<{
  elementKey: string;
  pageElements?: Record<string, PageElement>;
  // When true, the step resolved this element during the run but hovering it now
  // finds no match — surfaced as the self-node "removed" notice inside the card.
  removed?: boolean;
  // The step's parent-resolution outcome (from entry.findTrace.parent). Used to
  // mark the parent row that failed to resolve. Purely derived — no DOM lookup.
  parentResolution?: ParentTrace;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { highlightNode, clear } = useElementHighlight();

// The full resolution chain: self first, then each childOf ancestor.
const chain = computed(() => buildElementChain(props.elementKey, props.pageElements));

// The inspected element itself (first node), used for the header + own metadata.
const self = computed(() => chain.value[0] ?? null);

// Ancestors only (everything after self), rendered as the parent chain in
// Element_Chain order (immediate parent first).
const parents = computed(() => chain.value.slice(1));

// Per-row expansion state — multiple rows may be open at once (Req 1.7).
const expandedKeys = reactive(new Set<string>());

/**
 * Flip the expansion state of exactly one row, leaving every other row's state
 * unchanged (its own inverse when applied twice).
 */
function toggleExpand(key: string) {
  if (expandedKeys.has(key)) expandedKeys.delete(key);
  else expandedKeys.add(key);
}

// Per-hovered-node hover outcome. Only one node is hovered at a time; the state
// carries the runtime `found` count (removed notice) and `hidden` flag (hidden-
// ancestor notice) for that node. Reset on leave (Req 4.4, 5.6).
const hoverState = reactive<{ key: string | null; found: number | null; hidden: boolean }>({
  key: null,
  found: null,
  hidden: false,
});

// Plain (non-reactive) guard tracking the node the pointer is currently over.
// Used to ignore late highlight results after the pointer has left the node.
let hoveringKey: string | null = null;

/**
 * The failed parent node's key, derived purely from `parentResolution` (Req 7.4).
 * Every ancestor is spec-defined with a stable Element_Key, so the runtime records
 * the failed ancestor's key on the outcome and we match the chain node by key
 * (falling back to `descriptorId`, then a defensive `where.id` match).
 */
const failedParentKey = computed<string | null>(() => {
  const p = props.parentResolution;
  if (!p || p.resolved !== false) return null;
  const id = p.key ?? p.descriptorId;
  if (!id) return null;
  const node = parents.value.find(
    (n) => n.key === id || n.descriptor?.where?.id === id,
  );
  return node ? node.key : null;
});

/**
 * Whether a node resolved during the run (gate for the removed notice, Req 4.2).
 * Self uses the `removed` prop (LogEntry only sets it when the step resolved the
 * element). A parent counts as resolved-during-run when it is not the failed row
 * and has a descriptor — so the removed notice stays off the failed-parent row.
 */
function nodeResolvedDuringRun(node: ElementChainNode): boolean {
  if (node.isSelf) return props.removed === true;
  return node.key !== failedParentKey.value && !!node.descriptor;
}

/**
 * The removed notice shows for the hovered node when the runtime found no match
 * yet the node resolved during the run (Req 4.1, 4.2, 4.3).
 */
function isHoveredRemoved(node: ElementChainNode): boolean {
  return (
    hoverState.key === node.key &&
    hoverState.found === 0 &&
    nodeResolvedDuringRun(node)
  );
}

/**
 * The hidden-ancestor notice shows for the hovered node when the runtime reports
 * the match exists but is hidden by an ancestor (Req 5.3).
 */
function isHoveredHidden(node: ElementChainNode): boolean {
  return hoverState.key === node.key && hoverState.hidden;
}

/**
 * Hover a chain node → highlight that spec element on the page. Prefers the
 * runtime tomation-key tag (exact instance the finder used) and falls back to
 * descriptor matching when the element was never tagged. Records the outcome's
 * found/hidden into hoverState (guarded against a late result after leave).
 */
async function onNodeEnter(node: ElementChainNode) {
  const descriptor = toHighlightDescriptor(node.descriptor);
  // Nothing to highlight when there is neither a key nor a locator (Req 2.5).
  if (!node.key && !descriptor) return;
  hoveringKey = node.key;
  hoverState.key = node.key;
  hoverState.found = null;
  hoverState.hidden = false;
  const outcome = await highlightNode(node.key, descriptor);
  // Pointer already left this node — ignore this late result.
  if (hoveringKey !== node.key) return;
  if (outcome) {
    hoverState.found = outcome.found;
    hoverState.hidden = outcome.hiddenByAncestor;
  }
}

function onNodeLeave() {
  hoveringKey = null;
  hoverState.key = null;
  hoverState.found = null;
  hoverState.hidden = false;
  void clear();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  // Clear any highlight left active when the card closes.
  void clear();
});
</script>

<template>
  <div class="eic-backdrop" @click="emit('close')"></div>
  <div class="eic-card" role="dialog" aria-label="Element details">
    <div class="eic-header">
      <div class="eic-title-group">
        <span class="eic-title">{{ self?.label ?? elementKey }}</span>
      </div>
      <button class="eic-close" title="Close" @click="emit('close')">
        <font-awesome-icon :icon="['fas', 'xmark']" />
      </button>
    </div>

    <!-- Own metadata -->
    <div v-if="self" class="eic-section">
      <div
        class="eic-self"
        @pointerenter="onNodeEnter(self)"
        @pointerleave="onNodeLeave"
      >
        <span class="element-badge eic-badge">
          <font-awesome-icon :icon="['fas', 'crosshairs']" />
          {{ self.label }}
        </span>
      </div>

      <ChainNodeMeta :node="self" />

      <!-- Per-node notices for the self node, shown only while it is hovered. -->
      <div v-if="isHoveredRemoved(self)" class="eic-removed">
        <font-awesome-icon :icon="['fas', 'triangle-exclamation']" />
        <span>This element is no longer in the page — it may have been removed by a later navigation or DOM change.</span>
      </div>
      <div v-if="isHoveredHidden(self)" class="eic-hidden-ancestor">
        <font-awesome-icon :icon="['fas', 'eye-slash']" />
        <span>This element exists but cannot be shown because an ancestor is hidden.</span>
      </div>
    </div>

    <!-- Parent chain -->
    <div v-if="parents.length" class="eic-section">
      <div class="eic-section-label">
        Parent chain
        <span class="eic-section-hint">(hover to highlight, click to expand)</span>
      </div>
      <ul class="eic-chain">
        <li
          v-for="parent in parents"
          :key="parent.key"
          class="eic-chain-item"
          :class="{ 'eic-not-found': parent.key === failedParentKey }"
          @pointerenter="onNodeEnter(parent)"
          @pointerleave="onNodeLeave"
        >
          <button
            type="button"
            class="eic-chain-toggle"
            :aria-expanded="expandedKeys.has(parent.key)"
            :disabled="!parent.descriptor"
            @click.stop="parent.descriptor && toggleExpand(parent.key)"
          >
            <font-awesome-icon
              class="eic-chevron"
              :icon="['fas', expandedKeys.has(parent.key) ? 'chevron-down' : 'chevron-right']"
            />
            <span class="element-badge eic-badge">{{ parent.label }}</span>
            <code v-if="parent.descriptor" class="eic-tag-chip">&lt;{{ parent.descriptor.tag || '*' }}&gt;</code>
            <span v-else class="eic-missing">not defined in spec</span>
            <span v-if="parent.key === failedParentKey" class="eic-parent-not-found">could not be located</span>
          </button>

          <ChainNodeMeta v-if="expandedKeys.has(parent.key) && parent.descriptor" :node="parent" />

          <!-- Per-node notices, shown only while THIS node is hovered. -->
          <div v-if="isHoveredRemoved(parent)" class="eic-removed">
            <font-awesome-icon :icon="['fas', 'triangle-exclamation']" />
            <span>This element is no longer in the page — it may have been removed by a later navigation or DOM change.</span>
          </div>
          <div v-if="isHoveredHidden(parent)" class="eic-hidden-ancestor">
            <font-awesome-icon :icon="['fas', 'eye-slash']" />
            <span>This element exists but cannot be shown because an ancestor is hidden.</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.eic-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.eic-card {
  position: absolute;
  z-index: 41;
  width: max-content;
  min-width: 240px;
  max-width: 340px;
  margin-top: 4px;
  padding: 10px 12px;
  background: var(--bg-primary, #1e1e1e);
  border: 1px solid var(--border, #444);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-secondary, #aaa);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.eic-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.eic-title-group {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.eic-title {
  font-weight: 600;
  font-size: 12px;
  color: var(--text-primary, #ddd);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.eic-close {
  flex: 0 0 auto;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted, #888);
  padding: 0 2px;
  line-height: 1;
}

.eic-close:hover {
  color: var(--text-primary, #ddd);
}

.eic-removed {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  background: rgba(245, 166, 35, 0.12);
  color: #f5a623;
  font-size: 10px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
}

/* Hidden-ancestor notice — distinct blue/neutral info tint from the amber removed notice. */
.eic-hidden-ancestor {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  background: rgba(90, 156, 248, 0.12);
  color: #5a9cf8;
  font-size: 10px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
}

.eic-section {
  border-top: 1px solid var(--border, #3a3a3a);
  padding-top: 8px;
  margin-top: 8px;
}

.eic-section-label {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted, #888);
  margin-bottom: 6px;
}

.eic-section-hint {
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
  font-style: italic;
  color: var(--text-muted, #777);
}

.eic-self {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 5px;
  border-radius: 4px;
  cursor: pointer;
  min-width: 0;
}

.eic-self:hover {
  background: rgba(245, 166, 35, 0.1);
}

.eic-chain-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 2px 3px;
  border-radius: 4px;
  min-width: 0;
}

.eic-chain-item:hover {
  background: rgba(245, 166, 35, 0.1);
}

/* Failed-parent row — red-ish left border + tint, distinct from the amber removed notice. */
.eic-not-found {
  border-left: 2px solid var(--error, #ef4444);
  background: rgba(239, 68, 68, 0.08);
}

.eic-not-found:hover {
  background: rgba(239, 68, 68, 0.14);
}

/* Real button reset used as the expand toggle for each parent row. */
.eic-chain-toggle {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  width: 100%;
  padding: 2px 2px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font: inherit;
  min-width: 0;
}

.eic-chain-toggle:disabled {
  cursor: default;
  opacity: 0.7;
}

/* Small muted chevron affordance. */
.eic-chevron {
  flex: 0 0 auto;
  color: var(--text-muted, #888);
  font-size: 9px;
  width: 9px;
}

.eic-chain-toggle:disabled .eic-chevron {
  opacity: 0.4;
}

.eic-badge {
  cursor: pointer;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.eic-hint {
  font-size: 10px;
  color: var(--text-muted, #888);
  font-style: italic;
}

.eic-missing {
  font-size: 10px;
  color: var(--error, #ef4444);
  font-style: italic;
}

/* Inline "could not be located" marker on the failed parent row. */
.eic-parent-not-found {
  font-size: 10px;
  color: var(--error, #ef4444);
  font-style: italic;
}

/* Small monospace chip for tag names, e.g. <button>. */
.eic-tag-chip {
  flex: 0 0 auto;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--accent, #f5a623);
  background: rgba(245, 166, 35, 0.1);
  border-radius: 3px;
  padding: 0 4px;
}

.eic-chain {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
</style>
