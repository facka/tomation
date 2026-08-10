<script setup lang="ts">
import { useStore } from '@/store';
import { useMessaging } from '@/composables/useMessaging';
import DropZone from './DropZone.vue';

const store = useStore();
const { send } = useMessaging();

function onGetStarted() {
  const input = document.getElementById('spec-file-input') as HTMLInputElement | null;
  if (input) {
    input.click();
  }
}

function onLoadPlayground() {
  send({ type: 'LOAD_BUNDLED_SPEC' });
}

function onDismissPlayground() {
  store.state.playgroundPromptDismissed = true;
}
</script>

<template>
  <div class="home-landing">
    <!-- Welcome -->
    <h1 class="landing-welcome">Welcome to Tomation</h1>
    <p class="landing-tagline">
      Run browser UI tests directly from your sidebar — load a spec and watch it execute step by
      step.
    </p>

    <!-- Get Started -->
    <button class="btn btn-primary landing-get-started" @click="onGetStarted">Get Started</button>

    <!-- Unified Drop Zone -->
    <DropZone />

    <!-- Playground Prompt -->
    <div v-if="store.showPlaygroundPrompt.value" class="playground-prompt">
      <p class="playground-prompt-text">You're on the Tomation Playground! Load example tests?</p>
      <div class="playground-prompt-actions">
        <button class="btn btn-primary btn-sm" @click="onLoadPlayground">
          Load Playground Tests
        </button>
        <button class="btn btn-ghost btn-sm" @click="onDismissPlayground">Dismiss</button>
      </div>
    </div>

    <!-- Playground Link -->
    <a
      class="landing-playground-link"
      href="https://facka.github.io/tomation/"
      target="_blank"
      rel="noopener"
    >
      Try examples in the Playground
    </a>

    <!-- Automations Section -->
    <details class="landing-automations">
      <summary>How to write automations</summary>
      <div class="automations-content">
        <p>
          Automations are written in TypeScript using the <code>@tomationjs/dsl</code> package.
          Define page elements, compose reusable tasks, and write tests that read like plain English.
        </p>
        <p>
          Compile your TypeScript files to a <code>.tomation.json</code> spec by running:
        </p>
        <pre><code>npx @tomationjs/compiler</code></pre>
        <p>
          <a href="https://facka.github.io/tomation/" target="_blank" rel="noopener">
            Read the full documentation →
          </a>
        </p>
      </div>
    </details>
  </div>
</template>
