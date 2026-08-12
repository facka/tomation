export interface SelectedNodeData {
  tagName: string;
  attributes: Record<string, string>;
  outerHTML: string;
  childElementCount: number;
}

export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'gemini' | 'custom';
  endpointUrl: string;
  apiKey: string;
  model: string;
}

export interface LabState {
  inspectMode: boolean;
  selectedNodes: SelectedNodeData[];
  aiConfig: AIConfig | null;
  contextMode: 'full' | 'inspect';
  isGenerating: boolean;
  generatedCode: string | null;
  generatedPomName: string | null;
  error: string | null;
  copyConfirmation: boolean;
  codeViewerContent: string;
  fullPageHtml: string | null;
}
