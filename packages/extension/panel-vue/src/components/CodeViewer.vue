<script setup lang="ts">
import { computed, watch, ref } from 'vue';
import { useLabStore } from '@/store/lab';

const { labState, setCodeViewerContent, updateCodeViewerContent } = useLabStore();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

interface Token {
  type: 'tag' | 'attr-name' | 'attr-value' | 'text';
  value: string;
}

function tokenizeHtml(html: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < html.length) {
    if (html[i] === '<') {
      // Find end of tag
      const closeIdx = html.indexOf('>', i);
      if (closeIdx === -1) {
        // No closing '>' found, treat rest as text
        tokens.push({ type: 'text', value: html.slice(i) });
        break;
      }

      const tagContent = html.slice(i, closeIdx + 1);
      // Parse the tag into parts: tag name, attributes
      tokenizeTag(tagContent, tokens);
      i = closeIdx + 1;
    } else {
      // Text content until next '<'
      const nextTag = html.indexOf('<', i);
      const textEnd = nextTag === -1 ? html.length : nextTag;
      const text = html.slice(i, textEnd);
      if (text) {
        tokens.push({ type: 'text', value: text });
      }
      i = textEnd;
    }
  }

  return tokens;
}

function tokenizeTag(tag: string, tokens: Token[]) {
  // Match: < + optional / + tag name
  const tagNameMatch = tag.match(/^(<\/?[a-zA-Z][a-zA-Z0-9-]*)/);
  if (!tagNameMatch) {
    // Not a recognizable tag (e.g., <!-- comment -->), treat as tag token
    tokens.push({ type: 'tag', value: tag });
    return;
  }

  let pos = tagNameMatch[1].length;
  tokens.push({ type: 'tag', value: tagNameMatch[1] });

  // Parse attributes
  const rest = tag.slice(pos, tag.length - (tag.endsWith('/>') ? 2 : 1));
  let attrStr = rest;
  let attrPos = 0;

  while (attrPos < attrStr.length) {
    // Skip whitespace
    const wsMatch = attrStr.slice(attrPos).match(/^(\s+)/);
    if (wsMatch) {
      tokens.push({ type: 'tag', value: wsMatch[1] });
      attrPos += wsMatch[1].length;
    }

    if (attrPos >= attrStr.length) break;

    // Match attribute name
    const nameMatch = attrStr.slice(attrPos).match(/^([a-zA-Z_:][a-zA-Z0-9_.:-]*)/);
    if (!nameMatch) {
      // Unknown content, push rest as tag
      tokens.push({ type: 'tag', value: attrStr.slice(attrPos) });
      break;
    }

    tokens.push({ type: 'attr-name', value: nameMatch[1] });
    attrPos += nameMatch[1].length;

    // Check for = sign
    const eqMatch = attrStr.slice(attrPos).match(/^(\s*=\s*)/);
    if (!eqMatch) continue;

    tokens.push({ type: 'tag', value: eqMatch[1] });
    attrPos += eqMatch[1].length;

    // Match attribute value (quoted or unquoted)
    const valStart = attrStr[attrPos];
    if (valStart === '"' || valStart === "'") {
      const closeQuote = attrStr.indexOf(valStart, attrPos + 1);
      if (closeQuote === -1) {
        tokens.push({ type: 'attr-value', value: attrStr.slice(attrPos) });
        break;
      }
      tokens.push({ type: 'attr-value', value: attrStr.slice(attrPos, closeQuote + 1) });
      attrPos = closeQuote + 1;
    } else {
      // Unquoted value
      const unquotedMatch = attrStr.slice(attrPos).match(/^([^\s>]+)/);
      if (unquotedMatch) {
        tokens.push({ type: 'attr-value', value: unquotedMatch[1] });
        attrPos += unquotedMatch[1].length;
      }
    }
  }

  // Closing > or />
  if (tag.endsWith('/>')) {
    tokens.push({ type: 'tag', value: '/>' });
  } else {
    tokens.push({ type: 'tag', value: '>' });
  }
}

const isEmpty = computed(() => labState.codeViewerContent.trim().length === 0);

const highlightedHtml = computed(() => {
  if (isEmpty.value) return '';
  const tokens = tokenizeHtml(labState.codeViewerContent);
  return tokens
    .map((token) => {
      const escaped = escapeHtml(token.value);
      switch (token.type) {
        case 'tag':
          return `<span class="hl-tag">${escaped}</span>`;
        case 'attr-name':
          return `<span class="hl-attr-name">${escaped}</span>`;
        case 'attr-value':
          return `<span class="hl-attr-value">${escaped}</span>`;
        case 'text':
          return `<span class="hl-text">${escaped}</span>`;
        default:
          return escaped;
      }
    })
    .join('');
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function onInput(event: Event) {
  const target = event.target as HTMLTextAreaElement;
  setCodeViewerContent(target.value);
}

function syncScroll(event: Event) {
  const textarea = event.target as HTMLTextAreaElement;
  const overlay = textarea.parentElement?.querySelector('.code-overlay') as HTMLElement | null;
  if (overlay) {
    overlay.scrollTop = textarea.scrollTop;
    overlay.scrollLeft = textarea.scrollLeft;
  }
}

// When contextMode changes, regenerate content (discarding edits)
watch(
  () => labState.contextMode,
  () => {
    updateCodeViewerContent();
  }
);
</script>

<template>
  <div class="code-viewer">
    <div v-if="isEmpty" class="code-viewer-empty">
      <p class="code-viewer-empty-text">No HTML content loaded</p>
    </div>

    <div v-else class="code-viewer-editor">
      <textarea
        ref="textareaRef"
        class="code-textarea"
        :value="labState.codeViewerContent"
        @input="onInput"
        @scroll="syncScroll"
        spellcheck="false"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
      ></textarea>
      <pre class="code-overlay"><code v-html="highlightedHtml"></code></pre>
    </div>
  </div>
</template>

<style scoped>
.code-viewer {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  overflow: hidden;
}

.code-viewer-empty {
  padding: 24px 12px;
  text-align: center;
}

.code-viewer-empty-text {
  font-size: 12px;
  color: var(--text-muted);
}

.code-viewer-editor {
  position: relative;
  min-height: 120px;
  max-height: 300px;
}

.code-textarea,
.code-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 10px 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
  box-sizing: border-box;
}

.code-textarea {
  position: relative;
  z-index: 1;
  color: transparent;
  caret-color: var(--text-primary);
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  min-height: 120px;
  max-height: 300px;
}

.code-overlay {
  z-index: 0;
  pointer-events: none;
  background: var(--bg-elevated);
  border: none;
  color: var(--text-secondary);
}

.code-overlay code {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

/* Syntax highlighting colors */
.code-overlay :deep(.hl-tag) {
  color: #569cd6;
}

.code-overlay :deep(.hl-attr-name) {
  color: #9cdcfe;
}

.code-overlay :deep(.hl-attr-value) {
  color: #ce9178;
}

.code-overlay :deep(.hl-text) {
  color: var(--text-secondary);
}
</style>
