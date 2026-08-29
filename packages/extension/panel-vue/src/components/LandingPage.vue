<script setup lang="ts">
import { useStore } from '@/store';
import { useMessaging } from '@/composables/useMessaging';
import DropZone from './DropZone.vue';

const store = useStore();
const { send } = useMessaging();

function onLoadPlayground() {
  send({ type: 'LOAD_BUNDLED_SPEC' });
}

function onDismissPlayground() {
  store.state.playgroundPromptDismissed = true;
}

function onOpenLab() {
  store.setActiveTab('lab');
}
</script>

<template>
  <div class="home-landing">
    <!-- Brand + welcome -->
    <header class="landing-header">
      <div class="landing-brand">
        <span class="landing-brand-mark">T</span>
        <span class="landing-brand-name">Tomation</span>
      </div>
      <p class="landing-tagline">
        Run browser UI tests from your sidebar, or generate Page Object Models with AI.
      </p>
    </header>

    <!-- Primary actions -->
    <div class="landing-actions">
      <!-- Load Spec (also accepts drag &amp; drop) -->
      <DropZone />

      <!-- Open Lab -->
      <button type="button" class="landing-action-card" @click="onOpenLab">
        <span class="landing-action-icon">
          <font-awesome-icon :icon="['fas', 'flask']" aria-hidden="true" />
        </span>
        <span class="landing-action-text">
          <span class="landing-action-title">Open the Lab</span>
          <span class="landing-action-subtitle">Generate POM files with AI — no spec needed</span>
        </span>
      </button>
    </div>

    <!-- Playground Prompt (contextual: only on the playground) -->
    <div v-if="store.showPlaygroundPrompt.value" class="playground-prompt">
      <p class="playground-prompt-text">You're on the Tomation Playground. Load the example tests?</p>
      <div class="playground-prompt-actions">
        <button class="btn btn-primary btn-sm" @click="onLoadPlayground">
          Load Playground Tests
        </button>
        <button class="btn btn-ghost btn-sm" @click="onDismissPlayground">Dismiss</button>
      </div>
    </div>

    <!-- Footer: secondary links &amp; documentation -->
    <footer class="landing-footer">
      <p class="landing-footer-hint">
        Compile your TypeScript files with <code>npx @tomationjs/compiler</code> to produce a
        <code>.tomation.json</code> spec.
      </p>
      <nav class="landing-footer-links" aria-label="Resources">
        <a href="https://facka.github.io/tomation/docs.html" target="_blank" rel="noopener">Documentation</a>
        <span class="landing-footer-sep" aria-hidden="true">·</span>
        <a href="https://facka.github.io/tomation/" target="_blank" rel="noopener">Playground</a>
        <span class="landing-footer-sep" aria-hidden="true">·</span>
        <a href="https://github.com/facka/tomation" target="_blank" rel="noopener">GitHub</a>
      </nav>
    </footer>
  </div>
</template>
