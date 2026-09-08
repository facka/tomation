<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import type { PageElement } from '@/types/spec';
import type { ElementChainNode } from '@/logic/elementChain';
import { buildElementChain, toHighlightDescriptor } from '@/logic/elementChain';
import { useElementHighlight } from '@/composables/useElementHighlight';

const props = defineProps<{
  elementKey: string;
  pageElements?: Record<string, PageElement>;
  // When true, the step resolved this element during the run but hovering it now
  // finds no match — surfaced as a "removed" notice inside the card.
  removed?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { highlightNode, clear } = useElementHighlight();

// The full resolution chain: self first, then each childOf ancestor.
const chain = computed(() => buildElementChain(props.elementKey, props.pageElements));

// The inspected element itself (first node), used for the header + own metadata.
const self = computed(() => chain.value[0] ?? null);

// Ancestors only (everything after self), rendered as the parent chain.
const parents = computed(() => chain.value.slice(1));

/**
 * Build the where-matcher summary lines for a descriptor, e.g. `id = "submit"`.
 */
function whereLines(descriptor: PageElement | null): string[] {
  if (!descriptor || !descriptor.where) return [];
  return Object.keys(descriptor.where).map(
    (k) => k + ' = ' + JSON.stringify(descriptor.where![k]),
  );
}

/**
 * Hover a chain node → highlight that spec element on the page. Prefers the
 * runtime tomation-key tag (exact instance the finder used) and falls back to
 * descriptor matching when the element was never tagged.
 */
function onNodeEnter(node: ElementChainNode) {
  const descriptor = toHighlightDescriptor(node.descriptor);
  // Nothing to highlight when there is neither a key nor a locator.
  if (!node.key && !descriptor) return;
  void highlightNode(node.key, descriptor);
}

function onNodeLeave() {
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

    <!-- Removed notice (folded in from the old title-tooltip warning). -->
    <div v-if="removed" class="eic-removed">
      <font-awesome-icon :icon="['fas', 'triangle-exclamation']" />
      <span>This element is no longer in the page — it may have been removed by a later navigation or DOM change.</span>
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

      <dl v-if="self.descriptor" class="eic-meta">
        <div v-if="self?.descriptor?.tag" class="eic-row">
          <dt>Tag</dt>
          <dd><code class="eic-value">{{ self.descriptor.tag }}</code></dd>
        </div>
        <div class="eic-row">
          <dt>Key</dt>
          <dd><code class="eic-value">{{ self.key }}</code></dd>
        </div>
        <div v-if="self.descriptor.xpath" class="eic-row">
          <dt>XPath</dt>
          <dd><code class="eic-value">{{ self.descriptor.xpath }}</code></dd>
        </div>
        <div v-else-if="whereLines(self.descriptor).length" class="eic-row">
          <dt>Where</dt>
          <dd class="eic-value-list">
            <code v-for="line in whereLines(self.descriptor)" :key="line" class="eic-value">{{ line }}</code>
          </dd>
        </div>
        <div v-if="self.descriptor.navigate" class="eic-row">
          <dt>Navigate</dt>
          <dd><code class="eic-value">{{ self.descriptor.navigate }}</code></dd>
        </div>
      </dl>
    </div>

    <!-- Parent chain -->
    <div v-if="parents.length" class="eic-section">
      <div class="eic-section-label">
        Parent chain
        <span class="eic-section-hint">(hover to highlight on page)</span>
      </div>
      <ol class="eic-chain">
        <li
          v-for="parent in parents"
          :key="parent.key"
          class="eic-chain-item"
          @pointerenter="onNodeEnter(parent)"
          @pointerleave="onNodeLeave"
        >
          <font-awesome-icon class="eic-chain-arrow" :icon="['fas', 'arrow-up']" />
          <span class="element-badge eic-badge">{{ parent.label }}</span>
          <code v-if="parent.descriptor" class="eic-tag-chip">&lt;{{ parent.descriptor.tag || '*' }}&gt;</code>
          <span v-else class="eic-missing">not defined in spec</span>
        </li>
      </ol>
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

.eic-self,
.eic-chain-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 5px;
  border-radius: 4px;
  cursor: pointer;
  min-width: 0;
}

.eic-self:hover,
.eic-chain-item:hover {
  background: rgba(245, 166, 35, 0.1);
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

.eic-meta {
  margin: 6px 0 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
  align-items: baseline;
}

.eic-row {
  display: contents;
}

.eic-row dt {
  color: var(--text-muted, #888);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.eic-row dd {
  margin: 0;
  min-width: 0;
}

.eic-value-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* Boxed monospace value that wraps rather than overflowing the card. */
.eic-value {
  display: inline-block;
  max-width: 100%;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--text-secondary, #bbb);
  background: var(--bg-secondary, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border, #3a3a3a);
  border-radius: 3px;
  padding: 1px 5px;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: normal;
}

.eic-chain {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.eic-chain-arrow {
  flex: 0 0 auto;
  color: var(--text-muted, #888);
  font-size: 9px;
}
</style>
