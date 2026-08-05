import { ref } from 'vue';
import { validateSpec } from '@/logic/validateSpec';
import { useStore } from '@/store';

/**
 * Composable for file loading via drag-drop or file input.
 * Orchestrates FileReader → JSON.parse → validateSpec → store.loadSpec.
 */
export function useFileLoader() {
  const error = ref<string | null>(null);
  const isDragOver = ref(false);

  /**
   * Process a single File object: read as text, parse JSON, validate, and load into store.
   */
  function handleFile(file: File): void {
    error.value = null;

    if (!file.name.endsWith('.tomation.json')) {
      error.value = 'File must have a .tomation.json extension';
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => {
      error.value = 'Failed to read file';
    };

    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      let parsed: unknown;

      try {
        parsed = JSON.parse(text);
      } catch (e) {
        error.value = `Failed to parse JSON: ${(e as Error).message}`;
        return;
      }

      const result = validateSpec(parsed);
      if (!result.ok) {
        error.value = result.error;
        return;
      }

      const store = useStore();
      const hostname = store.state.currentHostname || 'localhost';
      store.loadSpec(hostname, file.name, result.spec);
    };

    reader.readAsText(file);
  }

  /**
   * Handle a drag-drop event: extract the first file and process it.
   */
  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    isDragOver.value = false;

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      return;
    }

    if (files.length > 1) {
      error.value = 'Only a single file can be loaded at a time';
      return;
    }

    handleFile(files[0]);
  }

  /**
   * Handle drag enter: set visual drag-over state.
   */
  function handleDragEnter(event: DragEvent): void {
    event.preventDefault();
    isDragOver.value = true;
  }

  /**
   * Handle drag leave: clear visual drag-over state.
   */
  function handleDragLeave(): void {
    isDragOver.value = false;
  }

  return { error, isDragOver, handleFile, handleDrop, handleDragEnter, handleDragLeave };
}
