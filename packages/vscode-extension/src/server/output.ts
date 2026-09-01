/**
 * Dedicated output-channel logging, relayed to the client.
 *
 * Two distinct client-visible surfaces live here (design §4, Error Handling):
 *
 *  - {@link Logger.log} sends the custom `tomation/log` notification the client
 *    routes to the `Tomation` output channel. This is the *output channel*
 *    path used for lifecycle lines and non-fatal skips/isolations (Req 13.5).
 *  - {@link Logger.showError} raises a single, user-facing error via the LSP
 *    `window/showErrorMessage` request. This is reserved for conditions that
 *    must never fail silently — chiefly a compiler engine that failed to load
 *    (Req 13.4). It also logs the same text to the output channel so there is a
 *    durable record alongside the transient toast.
 *
 * The engine-load feedback path (Req 13.4, 13.5) uses `showError` for the ONE
 * actionable error and `log` for the lifecycle line; every other feature keeps
 * working regardless.
 */

import { Connection } from 'vscode-languageserver/node';

/** Custom notification method the client routes to the Tomation output channel. */
export const TOMATION_LOG_NOTIFICATION = 'tomation/log';

/** A simple logger that relays messages to the client's output channel. */
export interface Logger {
  /** Append a line to the `Tomation` output channel (Req 13.5). */
  log(message: string): void;
  /**
   * Surface ONE clear, user-facing error and mirror it to the output channel.
   * Reserved for conditions that must never fail silently, e.g. an engine that
   * failed to load (Req 13.4). Best-effort: if the client cannot show the
   * message, the output-channel line still records it.
   */
  showError(message: string): void;
}

/** Create a logger that forwards messages over the LSP connection. */
export function createLogger(connection: Connection): Logger {
  return {
    log(message: string): void {
      connection.sendNotification(TOMATION_LOG_NOTIFICATION, message);
    },
    showError(message: string): void {
      // Durable record in the output channel first (Req 13.5)...
      connection.sendNotification(TOMATION_LOG_NOTIFICATION, message);
      // ...then the single user-facing toast (Req 13.4). Guarded so a client
      // that doesn't support the request can't take down the server.
      try {
        void connection.window.showErrorMessage(message);
      } catch {
        // The output-channel line above already recorded the error.
      }
    },
  };
}
