/**
 * Dedicated output-channel logging, relayed to the client.
 *
 * PLACEHOLDER — the diagnostics/commands tasks (8.2, 13.5) flesh out lifecycle
 * logging. This minimal version sends the custom `tomation/log` notification
 * the client already listens for, wired to the LSP connection.
 */

import { Connection } from 'vscode-languageserver/node';

/** Custom notification method the client routes to the Tomation output channel. */
export const TOMATION_LOG_NOTIFICATION = 'tomation/log';

/** A simple logger that relays messages to the client's output channel. */
export interface Logger {
  log(message: string): void;
}

/** Create a logger that forwards messages over the LSP connection. */
export function createLogger(connection: Connection): Logger {
  return {
    log(message: string): void {
      connection.sendNotification(TOMATION_LOG_NOTIFICATION, message);
    },
  };
}
