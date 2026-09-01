/**
 * Tomation DSL — VS Code extension client (activation shim).
 *
 * This is a thin activation layer that runs in the VS Code extension host. It
 * launches the language server (a separate Node process) and wires:
 *   - a filename-pattern `documentSelector` scoped to the four DSL file types,
 *     so the server never displaces the built-in TypeScript language service
 *     for ordinary `.ts` files (Req 2.1, 2.4, 15.5);
 *   - the `Tomation` output channel, fed by the LSP `window/logMessage` and a
 *     custom log notification from the server (Req 9.5 / 13.5);
 *   - workspace configuration pushed to the server on init and forwarded on
 *     `workspace/didChangeConfiguration` (Req 12.x settings bridge);
 *   - a `FileSystemWatcher` for DSL files and `tomation.config.{ts,js}` whose
 *     events the client relays to the server (Req 1.4, 6.5);
 *   - the three Tomation commands, each forwarded to the server.
 *
 * All parsing/validation happens in the server process to keep the extension
 * host responsive (Req 11.1, 11.5). On `deactivate()` the client stops the
 * server, which terminates the process and disposes the diagnostics and
 * watchers it owns (Req 1.5).
 */

import * as path from 'path';
import {
  ExtensionContext,
  OutputChannel,
  workspace,
  window,
  commands,
  WorkspaceFolder,
} from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  RevealOutputChannelOn,
} from 'vscode-languageclient/node';

/** Glob patterns identifying Tomation DSL files. */
const DSL_GLOBS = [
  '**/*.pom.ts',
  '**/*.test.ts',
  '**/*.automation.ts',
  '**/*.data.ts',
] as const;

/** Glob patterns for Tomation project config files. */
const CONFIG_GLOBS = ['**/tomation.config.ts', '**/tomation.config.js'] as const;

/**
 * Filename-pattern document selector. Each entry pairs the `typescript`
 * language with a filename `pattern`, so the server engages only for DSL files
 * and leaves plain TypeScript to the built-in language service (Req 2.4, 15.5).
 */
const DOCUMENT_SELECTOR = DSL_GLOBS.map((pattern) => ({
  language: 'typescript',
  pattern,
}));

/** Custom notification method the server uses to log to the output channel. */
const TOMATION_LOG_NOTIFICATION = 'tomation/log';

/** Commands contributed by the extension, each forwarded to the server. */
const FORWARDED_COMMANDS: ReadonlyArray<{ id: string; method: string }> = [
  { id: 'tomation.validateActiveFile', method: 'tomation/validateActiveFile' },
  { id: 'tomation.validateWorkspace', method: 'tomation/validateWorkspace' },
  { id: 'tomation.clearDiagnostics', method: 'tomation/clearDiagnostics' },
];

let client: LanguageClient | undefined;
let outputChannel: OutputChannel | undefined;

/**
 * Build the current `tomation` settings snapshot to hand to the server as
 * `initializationOptions` and on configuration changes.
 */
function readSettings(): unknown {
  return workspace.getConfiguration('tomation');
}

/**
 * Collect the workspace folders in a plain, serializable form the server can
 * consume (multi-root aware — Req 6.6, 7.6).
 */
function readWorkspaceFolders(): Array<{ name: string; uri: string }> {
  const folders: readonly WorkspaceFolder[] = workspace.workspaceFolders ?? [];
  return folders.map((folder) => ({
    name: folder.name,
    uri: folder.uri.toString(),
  }));
}

/**
 * Activate the extension: start the language server and wire settings,
 * commands, the output channel, and file watchers.
 */
export async function activate(context: ExtensionContext): Promise<void> {
  outputChannel = window.createOutputChannel('Tomation');
  context.subscriptions.push(outputChannel);

  // The server bundle sits beside this client bundle in dist/.
  const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'));

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  // Watch DSL files and config files; the language client forwards the raw
  // create/change/delete events to the server via `didChangeWatchedFiles`,
  // which drives project re-validation and index updates (Req 1.4, 6.5).
  const fileWatchers = [...DSL_GLOBS, ...CONFIG_GLOBS].map((glob) =>
    workspace.createFileSystemWatcher(glob)
  );
  context.subscriptions.push(...fileWatchers);

  const clientOptions: LanguageClientOptions = {
    documentSelector: DOCUMENT_SELECTOR,
    outputChannel,
    // Never steal focus; problems surface through diagnostics, not the panel.
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    // Push the initial settings snapshot and workspace folders to the server.
    initializationOptions: {
      settings: readSettings(),
      workspaceFolders: readWorkspaceFolders(),
    },
    synchronize: {
      // Forward workspace configuration changes to the server (Req 12.x).
      configurationSection: 'tomation',
      // Relay watched-file events to the server (Req 6.5).
      fileEvents: fileWatchers,
    },
  };

  client = new LanguageClient(
    'tomation',
    'Tomation DSL',
    serverOptions,
    clientOptions
  );

  // Wire a custom log notification from the server to the output channel, in
  // addition to the LSP `window/logMessage` that the LanguageClient already
  // routes to `outputChannel` (Req 13.5).
  context.subscriptions.push(
    client.onNotification(TOMATION_LOG_NOTIFICATION, (message: unknown) => {
      appendLog(message);
    })
  );

  // Register the contributed commands; each forwards to the server. If the
  // server is not running (e.g. failed to start), surface a clear message
  // rather than throwing (Req 13.4).
  for (const { id, method } of FORWARDED_COMMANDS) {
    context.subscriptions.push(
      commands.registerCommand(id, async () => {
        if (!client) {
          window.showErrorMessage(
            'Tomation: the language server is not running.'
          );
          return;
        }
        try {
          await client.sendRequest(method, {
            activeUri:
              window.activeTextEditor?.document.uri.toString() ?? null,
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          window.showErrorMessage(`Tomation: command failed — ${detail}`);
          appendLog(`Command "${id}" failed: ${detail}`);
        }
      })
    );
  }

  try {
    // Starting the client launches the server process and begins syncing the
    // open DSL documents so validation begins immediately (Req 1.4).
    await client.start();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    window.showErrorMessage(
      `Tomation: failed to start the language server — ${detail}`
    );
    appendLog(`Failed to start the language server: ${detail}`);
  }
}

/**
 * Deactivate the extension: stop the client, which terminates the server
 * process and disposes the diagnostics and watchers it owns (Req 1.5).
 */
export async function deactivate(): Promise<void> {
  if (!client) {
    return;
  }
  const stopping = client.stop();
  client = undefined;
  await stopping;
}

/** Append a message to the Tomation output channel, coercing non-strings. */
function appendLog(message: unknown): void {
  if (!outputChannel) {
    return;
  }
  const text =
    typeof message === 'string' ? message : JSON.stringify(message);
  outputChannel.appendLine(text);
}
