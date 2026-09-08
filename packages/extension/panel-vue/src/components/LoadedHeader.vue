<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from '@/store';
import { useFileLoader } from '@/composables/useFileLoader';

const store = useStore();
const { handleFile } = useFileLoader();

const menuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);

const isLiveReloadActive = computed(() => store.state.liveReload.active);
const liveReloadError = computed(() => store.state.liveReload.error);

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
}

function closeMenu(): void {
  menuOpen.value = false;
}

function onDocumentClick(event: MouseEvent): void {
  if (menuOpen.value && menuRef.value && !menuRef.value.contains(event.target as Node)) {
    closeMenu();
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));

const specName = computed(() => {
  const spec = store.state.currentSpec;
  return spec?.spec.meta?.name || spec?.filename || 'Loaded Spec';
});

const specDescription = computed(() => {
  return store.state.currentSpec?.spec.meta?.description || '';
});

const fileInfo = computed(() => {
  const spec = store.state.currentSpec;
  if (!spec) return '';
  return spec.filename;
});

function getHostFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    return u.hostname;
  } catch {
    try {
      const u2 = new URL('https://' + urlStr);
      return u2.hostname;
    } catch {
      return null;
    }
  }
}

const urlMismatchWarning = computed(() => {
  const spec = store.state.currentSpec;
  const hostname = store.state.currentHostname;
  if (!spec || !hostname) return null;

  const meta = spec.spec.meta;
  if (!meta) return null;

  const urls = meta.urls || (meta.url ? [meta.url] : []);
  if (urls.length === 0) return null;

  const currentHost = hostname.trim().toLowerCase();
  const anyMatch = urls.some((u) => {
    const h = getHostFromUrl(u);
    return h && h.trim().toLowerCase().includes(currentHost);
  });

  if (!anyMatch) {
    return `This spec targets ${urls.join(', ')} but current site is ${hostname}`;
  }

  return null;
});

function onReload() {
  closeMenu();
  const input = document.getElementById('spec-file-input-alt') as HTMLInputElement | null;
  if (input) {
    input.click();
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    handleFile(input.files[0]);
    input.value = '';
  }
}

function onToggleLiveReload() {
  closeMenu();
  if (isLiveReloadActive.value) {
    store.disableLiveReload();
    return;
  }
  const input = window.prompt('Port for "tomation watch" dev server:', '4756');
  if (input === null) return;
  const port = Number.parseInt(input, 10);
  if (!Number.isFinite(port) || port <= 0) return;
  store.enableLiveReload(port);
}

function onRemoveSpec() {
  closeMenu();
  const spec = store.state.currentSpec;
  const hostname = store.state.currentHostname;
  if (!spec || !hostname) return;
  if (!window.confirm(`Remove "${spec.filename}" from this project?`)) return;
  store.removeSpec(hostname, spec.filename);
}
</script>

<template>
  <div class="loaded-header">
    <div class="loaded-meta">
      <h2>{{ specName }}</h2>
      <p v-if="specDescription" class="loaded-description">{{ specDescription }}</p>
      <p class="loaded-file-info">
        {{ fileInfo }}
        <span v-if="isLiveReloadActive" class="live-reload-badge" :class="{ 'live-reload-error': liveReloadError }" :title="liveReloadError || 'Live reload connected'">
          <font-awesome-icon :icon="['fas', 'plug']" /> live
        </span>
      </p>
    </div>
    <div class="loaded-actions">
      <div class="spec-menu" ref="menuRef">
        <button class="btn btn-sm btn-ghost" title="Spec options" @click="toggleMenu">
          <font-awesome-icon :icon="['fas', 'ellipsis-vertical']" />
        </button>
        <div v-if="menuOpen" class="spec-menu-dropdown">
          <button class="spec-menu-item" @click="onReload">
            <font-awesome-icon :icon="['fas', 'rotate-right']" /> Reload spec
          </button>
          <button class="spec-menu-item" @click="onToggleLiveReload">
            <font-awesome-icon :icon="['fas', 'plug']" />
            {{ isLiveReloadActive ? 'Disable live reload' : 'Enable live reload' }}
          </button>
          <button class="spec-menu-item spec-menu-item-danger" @click="onRemoveSpec">
            <font-awesome-icon :icon="['fas', 'trash']" /> Remove spec
          </button>
        </div>
      </div>
      <input
        type="file"
        id="spec-file-input-alt"
        accept=".json,.tomation.json"
        @change="onFileChange"
      />
    </div>
  </div>
  <div v-if="urlMismatchWarning" class="url-warning-banner" role="alert">
    <font-awesome-icon :icon="['fas', 'triangle-exclamation']" aria-hidden="true" /> {{ urlMismatchWarning }}
  </div>
</template>

<style scoped>
#spec-file-input-alt {
  display: none;
}

.spec-menu {
  position: relative;
}

.spec-menu-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 20;
  min-width: 170px;
  background: var(--panel-bg, #fff);
  border: 1px solid var(--border-color, #d0d0d0);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  padding: 4px;
  display: flex;
  flex-direction: column;
}

.spec-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
}

.spec-menu-item:hover {
  background: var(--hover-bg, rgba(0, 0, 0, 0.06));
}

.spec-menu-item-danger {
  color: var(--danger-text, #c0392b);
}

.live-reload-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  color: var(--success-text, #1e8e3e);
  font-size: 11px;
}

.live-reload-badge.live-reload-error {
  color: var(--danger-text, #c0392b);
}

.url-warning-banner {
  background-color: var(--warning-bg, #fff3cd);
  color: var(--warning-text, #856404);
  border: 1px solid var(--warning-border, #ffc107);
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.4;
  margin-bottom: 8px;
}
</style>

