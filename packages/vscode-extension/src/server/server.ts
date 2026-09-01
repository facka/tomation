/**
 * Tomation DSL — language server bootstrap.
 *
 * This is the wiring layer for the LSP server process (design §2). It creates
 * the connection and the `TextDocuments` manager, advertises capabilities on
 * `onInitialize`, and connects document lifecycle events, watched-file events,
 * configuration changes, and the authoring request handlers to the modules
 * that implement each concern.
 *
 * The concrete behavior lives in the modules this file wires together — file
 * and project diagnostics, the Project Symbol Index, the debounce scheduler,
 * and the completion/hover/definition providers. Several of those modules are
 * still thin placeholders owned by later tasks; the wiring below is stable and
 * will not need to change as those implementations land.
 *
 * Requirements: 1.4, 2.1, 2.3, 3.1, 3.2, 3.4, 3.5, 6.6, 7.6, 12.1-12.8,
 * 13.1-13.5.
 */

import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  InitializeParams,
  InitializeResult,
  DidChangeWatchedFilesParams,
  FileChangeType,
  CompletionParams,
  HoverParams,
  DefinitionParams,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { isDslFile } from './util/dslFile';
import { uriToFsPath } from './util/uri';
import { readSettings, settingsChanged, TomationSettings } from './util/settings';
import { createScheduler, Scheduler } from './util/debounce';
import { createLogger, Logger } from './output';
import { createEngine, Engine } from './engine/engine';
import { validateFile } from './diagnostics/fileDiagnostics';
import { validateProject } from './diagnostics/projectDiagnostics';
import { createDiagnosticStore, DiagnosticStore } from './diagnostics/diagnosticStore';
import { createProjectIndex, ProjectIndex } from './index/projectIndex';
import { provideCompletion } from './providers/completionProvider';
import { provideHover } from './providers/hoverProvider';
import { provideDefinition } from './providers/definitionProvider';

/** Trigger characters that should re-open completion (design §2). */
const COMPLETION_TRIGGER_CHARACTERS = ['.', '(', "'"];

/** Custom LSP request methods the client forwards for the commands (design §12). */
const COMMAND_VALIDATE_ACTIVE_FILE = 'tomation/validateActiveFile';
const COMMAND_VALIDATE_WORKSPACE = 'tomation/validateWorkspace';
const COMMAND_CLEAR_DIAGNOSTICS = 'tomation/clearDiagnostics';

/** Payload the client sends with a forwarded command request. */
interface CommandRequestParams {
  /** The focused editor's document URI, or `null` when no editor is active. */
  activeUri?: string | null;
}

/** A workspace folder as pushed by the client (multi-root — Req 6.6, 7.6). */
interface WorkspaceFolderInfo {
  name: string;
  uri: string;
}

// LSP connection and open-buffer manager. `TextDocuments` tracks the live
// (unsaved) content of open DSL files (Req 3.6).
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments<TextDocument>(TextDocument);
const logger: Logger = createLogger(connection);

// One long-lived engine adapter shared across every validation (Req 11.5).
// Created once here — never per-run — so the compiler loads a single time.
const engine: Engine = createEngine();

// One shared per-URI diagnostic store. Both the file-scoped and project-scoped
// passes route their diagnostics through this so the two scopes MERGE per URI
// instead of clobbering each other via independent `sendDiagnostics` calls
// (design Flow B, Req 6.5, 15.2). The store publishes through the connection.
const diagnosticStore: DiagnosticStore = createDiagnosticStore((uri, diagnostics) =>
  connection.sendDiagnostics({ uri, diagnostics })
);

// Server-wide state captured on initialize and refreshed on config change.
let settings: TomationSettings = readSettings(undefined);
let workspaceFolders: WorkspaceFolderInfo[] = [];

// One Project Symbol Index per workspace folder (Req 7.6). Keyed by folder URI.
const indexesByFolder = new Map<string, ProjectIndex>();

// Debounced scheduler; reads the debounce interval lazily so a settings change
// takes effect on the next schedule (Req 3.3, 11.2).
const scheduler: Scheduler = createScheduler(
  () => settings.validation.debounceInterval
);

/**
 * Resolve the workspace folder that owns a document/file URI, returning its
 * folder URI. Falls back to the first folder when none matches (single-root or
 * ad-hoc files).
 */
function folderUriFor(uri: string): string | undefined {
  let best: WorkspaceFolderInfo | undefined;
  for (const folder of workspaceFolders) {
    if (uri.startsWith(folder.uri) && (!best || folder.uri.length > best.uri.length)) {
      best = folder;
    }
  }
  if (best) {
    return best.uri;
  }
  return workspaceFolders[0]?.uri;
}

/** Get (or lazily create) the Project Index for the folder owning `uri`. */
function indexForUri(uri: string): ProjectIndex | undefined {
  const folderUri = folderUriFor(uri);
  if (!folderUri) {
    return undefined;
  }
  let index = indexesByFolder.get(folderUri);
  if (!index) {
    // One index per workspace folder (Req 7.6). Give it the shared engine, the
    // live-buffer manager, and the folder's filesystem path (folder URI → cwd
    // via `uriToFsPath`) so it can derive namespaces that match compiled output.
    index = createProjectIndex({
      engine,
      documents,
      folderCwd: uriToFsPath(folderUri),
    });
    indexesByFolder.set(folderUri, index);
  }
  return index;
}

/** Schedule file-scoped validation of an open DSL buffer (Req 3.1, 3.2). */
function scheduleFileValidation(uri: string): void {
  if (!settings.validation.enabled || !isDslFile(uri)) {
    return;
  }
  scheduler.scheduleFile(uri, (token) =>
    validateFile({ documents, engine, store: diagnosticStore }, uri, token)
  );
}

/** Schedule a Project Index refresh for a single file (Req 7.3). */
function scheduleIndexUpdate(uri: string): void {
  if (!isDslFile(uri)) {
    return;
  }
  const index = indexForUri(uri);
  index?.updateFile(uri);
}

/** Schedule project-scoped validation for the folder owning `uri` (Req 6.6). */
function scheduleProjectValidation(uri: string): void {
  if (!settings.validation.enabled || !settings.validation.projectScope) {
    return;
  }
  const folderUri = folderUriFor(uri);
  if (!folderUri) {
    return;
  }
  scheduler.scheduleProject(folderUri, (token) =>
    validateProject(
      { engine, store: diagnosticStore, logger },
      folderUri,
      token
    )
  );
}

// ---------------------------------------------------------------------------
// Initialize: advertise capabilities and capture initialization options.
// ---------------------------------------------------------------------------

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const options = (params.initializationOptions ?? {}) as {
    settings?: unknown;
    workspaceFolders?: WorkspaceFolderInfo[];
  };

  settings = readSettings(options.settings);
  workspaceFolders =
    options.workspaceFolders ??
    (params.workspaceFolders ?? []).map((folder) => ({
      name: folder.name,
      uri: folder.uri,
    }));

  logger.log(
    `Tomation server initialized with ${workspaceFolders.length} workspace folder(s).`
  );

  // Engine-load feedback (Req 13.4, 13.5). The engine adapter loads the
  // compiler safely and never throws; here we surface the outcome. On failure
  // we raise ONE clear, actionable error to the user and log the lifecycle to
  // the output channel — never a silent failure. Diagnostics/authoring degrade
  // to no-ops, but commands, the output channel, and activation keep working.
  if (!engine.ready) {
    logger.showError(
      'Tomation: the DSL compiler failed to load, so live diagnostics and ' +
        'authoring assistance are unavailable' +
        (engine.loadError ? ` (${engine.loadError})` : '') +
        '. Try reinstalling dependencies (npm install) and reloading the ' +
        'window. Other Tomation features remain available.'
    );
  } else {
    logger.log('Tomation compiler loaded successfully.');
  }

  return {
    capabilities: {
      // Incremental sync keeps the buffer content current with minimal traffic
      // (Req 3.2, 3.6).
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: COMPLETION_TRIGGER_CHARACTERS,
        resolveProvider: false,
      },
      hoverProvider: true,
      definitionProvider: true,
    },
  };
});

// ---------------------------------------------------------------------------
// Document lifecycle → scheduler (Req 3.1, 3.2, 3.5, 7.3).
// ---------------------------------------------------------------------------

documents.onDidOpen((event) => {
  scheduleFileValidation(event.document.uri);
  scheduleIndexUpdate(event.document.uri);
});

documents.onDidChangeContent((event) => {
  // Debounced live-buffer validation. Skipped when the user opted for
  // save-only validation (Req 3.2, 12.4).
  if (settings.validation.runOn === 'save') {
    return;
  }
  scheduleFileValidation(event.document.uri);
  scheduleIndexUpdate(event.document.uri);
});

documents.onDidClose((event) => {
  // The manager delivers one `onDidClose` when the last editor for a URI
  // closes, so clearing here is correct: retain diagnostics while any editor
  // for the same URI remains open (Req 3.5). Clear only the file-scoped bucket
  // via the store so any project-scoped diagnostics for the URI survive the
  // close and are still published (they are re-merged automatically).
  diagnosticStore.setFileDiagnostics(event.document.uri, []);
});

documents.onDidSave((event) => {
  // Validate saved content and re-run project validation for the folder
  // (Req 3.4, 6.6).
  scheduleFileValidation(event.document.uri);
  scheduleIndexUpdate(event.document.uri);
  scheduleProjectValidation(event.document.uri);
});

// ---------------------------------------------------------------------------
// Watched files (DSL files + tomation.config.{ts,js}) → project + index
// (Req 6.6, 7.3). The client registers the watcher and relays events.
// ---------------------------------------------------------------------------

connection.onDidChangeWatchedFiles((params: DidChangeWatchedFilesParams) => {
  for (const change of params.changes) {
    const { uri, type } = change;
    if (isDslFile(uri)) {
      if (type === FileChangeType.Deleted) {
        indexForUri(uri)?.removeFile(uri);
      } else {
        scheduleIndexUpdate(uri);
      }
    }
    // A DSL file or config change triggers project re-validation for its
    // folder (Req 6.6). The scheduler coalesces per folder.
    scheduleProjectValidation(uri);
  }
});

// ---------------------------------------------------------------------------
// Configuration changes → apply new behavior live (Req 12.1–12.8).
// ---------------------------------------------------------------------------

/**
 * Re-validate every currently open DSL buffer. Used when validation is toggled
 * back ON so the buffers get their squiggles back immediately rather than
 * waiting for the next edit (Req 12.1).
 */
function revalidateOpenDocuments(): void {
  for (const doc of documents.all()) {
    scheduleFileValidation(doc.uri);
    scheduleProjectValidation(doc.uri);
  }
}

/**
 * Settings keys that cannot be applied live and would require a window reload.
 *
 * Every setting the extension contributes today hot-applies (see design §11):
 * `validation.enabled` is handled explicitly below, and the rest
 * (`projectScope`, `debounceInterval`, `runOn`, `completion.enabled`,
 * `hover.enabled`) are read from the current `settings` snapshot at the point
 * of each operation, so they take effect on the next relevant action with no
 * reload. This list is therefore intentionally empty. It exists as the
 * documented seam for any FUTURE setting that genuinely can't hot-apply: add
 * its key here and {@link maybePromptReload} will request a reload — but only
 * when that specific key actually changed, never on an unrelated change and
 * never when nothing changed (Req 12.7).
 */
function nonHotAppliableChangedKeys(
  _previous: TomationSettings,
  _next: TomationSettings
): string[] {
  return [];
}

/**
 * Request a window reload from the client, but ONLY for settings that cannot
 * hot-apply. Since none exist today, this is a no-op in practice; it never
 * prompts when nothing changed (Req 12.7). Best-effort: a client that can't
 * service the request fails silently rather than disrupting the server.
 */
function maybePromptReload(
  previous: TomationSettings,
  next: TomationSettings
): void {
  const changed = nonHotAppliableChangedKeys(previous, next);
  if (changed.length === 0) {
    return;
  }
  try {
    void connection.window
      .showInformationMessage(
        'Tomation settings changed that require a window reload: ' +
          changed.join(', ') +
          '. Reload now?',
        { title: 'Reload Window' }
      )
      .then((selection) => {
        if (selection?.title === 'Reload Window') {
          // The client owns the actual reload; the server just requests it.
          void connection.sendNotification('tomation/requestReload');
        }
      });
  } catch {
    // Prompting is optional — a client without the capability is fine.
  }
}

connection.onDidChangeConfiguration((change) => {
  const raw = (change.settings as { tomation?: unknown } | undefined)?.tomation;
  const previous = settings;
  const next = readSettings(raw ?? change.settings);

  // Act only when a value actually changed. If the event fires but nothing
  // moved, do nothing at all — no reload prompt, no side effects (Req 12.7).
  if (!settingsChanged(previous, next)) {
    return;
  }

  settings = next;

  // `validation.enabled` is the one setting with an immediate, stateful side
  // effect (Req 12.1):
  if (previous.validation.enabled !== next.validation.enabled) {
    if (!next.validation.enabled) {
      // Toggled OFF → clear ALL Tomation diagnostics and stop scheduling.
      // `scheduleFileValidation`/`scheduleProjectValidation` already guard on
      // `settings.validation.enabled`, so future events become no-ops.
      diagnosticStore.clearAll();
      logger.log('Tomation validation disabled — cleared all diagnostics.');
    } else {
      // Toggled back ON → re-validate all open buffers so squiggles return.
      logger.log('Tomation validation enabled — re-validating open documents.');
      revalidateOpenDocuments();
    }
  }

  // The remaining settings (projectScope, debounceInterval, runOn,
  // completion.enabled, hover.enabled) hot-apply because every consumer reads
  // the current `settings` snapshot at call time:
  //   - `scheduleProjectValidation` checks `settings.validation.projectScope`;
  //   - `scheduler` reads `settings.validation.debounceInterval` lazily;
  //   - `onDidChangeContent` checks `settings.validation.runOn`;
  //   - `onCompletion`/`onHover`/`onDefinition` check the feature-enable flags.
  // No action needed here for them to take effect on the next operation
  // (Req 12.2, 12.3, 12.4, 12.5, 12.6).

  // Finally, prompt for a reload only if a non-hot-appliable setting changed
  // (currently none — Req 12.7).
  maybePromptReload(previous, next);
});

// ---------------------------------------------------------------------------
// Authoring requests → providers (Req 8, 9, 10). Handlers respect the
// feature-enable settings so built-in TypeScript features stay intact.
// ---------------------------------------------------------------------------

connection.onCompletion((params: CompletionParams) => {
  if (!settings.completion.enabled) {
    return [];
  }
  return provideCompletion(
    { documents, getIndex: indexForUri },
    params
  );
});

connection.onHover((params: HoverParams) => {
  if (!settings.hover.enabled) {
    return null;
  }
  return provideHover({ documents, getIndex: indexForUri }, params);
});

connection.onDefinition((params: DefinitionParams) => {
  // Go-to-definition is gated by the hover setting per design §11.
  if (!settings.hover.enabled) {
    return null;
  }
  return provideDefinition({ documents, getIndex: indexForUri }, params);
});

// ---------------------------------------------------------------------------
// Commands (Req 13.1–13.3). The client contributes and registers the commands
// and forwards each here via `client.sendRequest(method, { activeUri })`. The
// server owns the actual behavior. Each handler respects `validation.enabled`
// the same way the scheduling helpers do, except clear which always applies.
// ---------------------------------------------------------------------------

// tomation.validateActiveFile — re-run file diagnostics for the focused editor
// (Req 13.1). The payload carries the active editor URI; validate it when it is
// a DSL file. A non-DSL / absent URI is a no-op.
connection.onRequest(
  COMMAND_VALIDATE_ACTIVE_FILE,
  (params: CommandRequestParams) => {
    const uri = params?.activeUri ?? undefined;
    if (uri && isDslFile(uri)) {
      scheduleFileValidation(uri);
      scheduleProjectValidation(uri);
    }
  }
);

// tomation.validateWorkspace — re-run file diagnostics for all open DSL
// documents and project validation for all workspace folders (Req 13.2).
connection.onRequest(COMMAND_VALIDATE_WORKSPACE, () => {
  for (const doc of documents.all()) {
    scheduleFileValidation(doc.uri);
  }
  // Kick project validation once per folder (the scheduler coalesces per
  // folder anyway — Req 11.3). Use the folder URI directly so validation runs
  // even for folders with no open documents.
  for (const folder of workspaceFolders) {
    scheduleProjectValidation(folder.uri);
  }
});

// tomation.clearDiagnostics — clear ALL published Tomation diagnostics
// (Req 13.3). Reuses the store's clear-all capability, the same one the
// validation.enabled=false path uses.
connection.onRequest(COMMAND_CLEAR_DIAGNOSTICS, () => {
  diagnosticStore.clearAll();
  logger.log('Tomation diagnostics cleared.');
});

// ---------------------------------------------------------------------------
// Shutdown: dispose the scheduler's pending work.
// ---------------------------------------------------------------------------

connection.onShutdown(() => {
  scheduler.dispose();
});

// Start listening. `documents.listen` must be wired before `connection.listen`
// so document sync events are captured from the first message.
documents.listen(connection);
connection.listen();
