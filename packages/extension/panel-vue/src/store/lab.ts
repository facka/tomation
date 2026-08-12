import { reactive } from 'vue';
import type { LabState, AIConfig, SelectedNodeData } from '../types/lab';
import { api } from '../logic/browserApi';

// --- Helpers ---

function storageGet(key: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    api.storage.local.get(key, (items) => resolve(items));
  });
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    api.storage.local.set(items, () => resolve());
  });
}

// --- State ---

const labState = reactive<LabState>({
  inspectMode: false,
  selectedNodes: [],
  aiConfig: null,
  contextMode: 'inspect',
  isGenerating: false,
  generatedCode: null,
  generatedPomName: null,
  error: null,
  copyConfirmation: false,
  codeViewerContent: '',
  fullPageHtml: null,
});

// --- Actions ---

function setInspectMode(active: boolean): void {
  labState.inspectMode = active;
}

function addSelectedNode(node: SelectedNodeData): { added: boolean; reason?: string } {
  if (labState.selectedNodes.length >= 20) {
    return { added: false, reason: 'Maximum of 20 nodes reached' };
  }
  const isDuplicate = labState.selectedNodes.some(n => n.outerHTML === node.outerHTML);
  if (isDuplicate) {
    return { added: false, reason: 'duplicate' };
  }
  labState.selectedNodes.push(node);
  updateCodeViewerContent();
  return { added: true };
}

function removeSelectedNode(index: number): void {
  labState.selectedNodes.splice(index, 1);
  updateCodeViewerContent();
}

function clearSelectedNodes(): void {
  labState.selectedNodes = [];
  updateCodeViewerContent();
}

function setAIConfig(config: AIConfig): void {
  labState.aiConfig = config;
}

function setContextMode(mode: 'full' | 'inspect'): void {
  labState.contextMode = mode;
}

function setCodeViewerContent(content: string): void {
  labState.codeViewerContent = content;
}

function updateCodeViewerContent(): void {
  if (labState.contextMode === 'inspect') {
    labState.codeViewerContent = labState.selectedNodes
      .map(n => n.outerHTML)
      .join('\n');
  } else {
    labState.codeViewerContent = labState.fullPageHtml ?? '';
  }
}

function setFullPageHtml(html: string): void {
  labState.fullPageHtml = html;
  if (labState.contextMode === 'full') {
    labState.codeViewerContent = html;
  }
}

function setGenerating(generating: boolean): void {
  labState.isGenerating = generating;
}

function setGeneratedCode(code: string, pomName: string): void {
  labState.generatedCode = code;
  labState.generatedPomName = pomName;
}

function setError(error: string | null): void {
  labState.error = error;
}

function setCopyConfirmation(show: boolean): void {
  labState.copyConfirmation = show;
}

// --- Validation & Persistence ---

function validateAIConfig(config: AIConfig): string | null {
  if (!config.apiKey || !config.apiKey.trim()) {
    return 'API key is required';
  }
  if (config.provider === 'custom' && (!config.endpointUrl || !config.endpointUrl.trim())) {
    return 'Endpoint URL is required for custom provider';
  }
  return null;
}

async function loadAIConfig(): Promise<void> {
  const result = await storageGet('lab_ai_config');
  const stored = result['lab_ai_config'] as AIConfig | undefined;
  if (stored) {
    labState.aiConfig = stored;
  }
}

async function saveAIConfig(config: AIConfig): Promise<{ success: boolean; error?: string }> {
  const validationError = validateAIConfig(config);
  if (validationError) {
    return { success: false, error: validationError };
  }
  await storageSet({ lab_ai_config: config });
  labState.aiConfig = config;
  return { success: true };
}

// --- Export ---

export function useLabStore() {
  return {
    labState,
    setInspectMode,
    addSelectedNode,
    removeSelectedNode,
    clearSelectedNodes,
    setAIConfig,
    setContextMode,
    setCodeViewerContent,
    updateCodeViewerContent,
    setFullPageHtml,
    setGenerating,
    setGeneratedCode,
    setError,
    setCopyConfirmation,
    validateAIConfig,
    loadAIConfig,
    saveAIConfig,
  };
}
