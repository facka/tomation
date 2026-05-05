import { v4 as uuidv4 } from 'uuid';
import { AutomationEvents, EVENT_NAMES } from "./engine/events";
import { RunTest } from "./dsl/test";
import { AutomationInstance, Setup, TestSpeed } from './engine/runner';
import { logger } from './feedback/logger';
interface TomationOptions {
  matches: string | RegExp;
  tests: any[];
  speed?: keyof typeof TestSpeed;
  debug?: boolean;
}

function tomation(options: TomationOptions) {
  const {
    matches,
    tests = [],
    speed = 'NORMAL',
    debug = false,
  } = options;

  const sessionId = uuidv4();
  logger.log(`Initializing on URL: ${document.location.href} with session ID: ${sessionId}`);
  window.postMessage({
      message: 'injectedScript-to-contentScript',
      sender: 'tomation',
      payload: {
        cmd: EVENT_NAMES.SESSION_INIT,
        params: {
          sessionId,
        },
      },
    });

  const shouldRun =
    typeof matches === 'string'
      ? document.location.href.includes(matches)
      : !!document.location.href.match(matches);

  if (!shouldRun) {
    logger.log(`URL "${document.location.href}" does not match "${matches}"`);
    window.postMessage({
      message: 'injectedScript-to-contentScript',
      sender: 'tomation',
      payload: {
        cmd: EVENT_NAMES.URL_MISMATCH,
        params: {
          sessionId,
          matches,
          url: document.location.href
        },
      },
    });
    return;
  }

  try {
    // Messaging bridge
    // Forward framework events

    logger.log('Setting up messaging bridge with extension...');
    Object.values(EVENT_NAMES).forEach((event) => {
      logger.log(`Setting up listener for event "${event}"`);
      AutomationEvents.on(event as EVENT_NAMES, (data: any) => {
        const payload = {
          cmd: event,
          params: {
            ...data,
            sessionId,
          },
        }
        logger.log(`Dispatching event "${event}" to extension: `, payload);
        window.postMessage({
          message: 'injectedScript-to-contentScript',
          sender: 'tomation',
          payload,
        });
      });
    });

    // Listen for extension messages
    window.addEventListener('message', (event: any) => {
      try {
        const { message, sender, payload } = event.data || {};
        const { cmd, params } = payload || {};
        // if (event.source !== window) return;
        if (sender !== 'web-extension') return;
        if (message === 'contentScript-to-injectedScript') {
          logger.log('Received message from extension:', event.data);
          const commands: Record<string, () => void> = {
            'run-test-request': () => RunTest(params?.testId),
            'reload-tests-request': () => Setup(window, tests || []),
            'pause-test-request': () => AutomationInstance.pause(),
            'stop-test-request': () => AutomationInstance.stop(),
            'continue-test-request': () => AutomationInstance.continue(),
            'next-step-request': () => AutomationInstance.next(),
            'retry-action-request': () => AutomationInstance.retryAction(),
            'skip-action-request': () => AutomationInstance.skipAction(),
            'user-accept-request': () => AutomationEvents.dispatch(EVENT_NAMES.USER_ACCEPT),
            'user-reject-request': () => AutomationEvents.dispatch(EVENT_NAMES.USER_REJECT),
          };
          const commandFn = commands[cmd];
          if (commandFn) {
            logger.log(`Executing command "${cmd}" from extension`);
            commandFn();
          } else {
            logger.warn(`Unknown command "${cmd}" from extension`);
          }
          return;
        }
      } catch (err) {
        logger.error('Error handling message from extension:', err);
      }
    });  
    

    // Core setup
    Setup(window, tests);

    // Optional tuning
    AutomationInstance.setDebug(debug);
    AutomationInstance.speed = TestSpeed[speed];

    window.postMessage({
      message: 'injectedScript-to-contentScript',
      sender: 'tomation',
      payload: {
        cmd: EVENT_NAMES.SESSION_CONNECTED,
        params: {
          speed: AutomationInstance.speed,
          sessionId,
        },
      },
    });

    logger.log('Ready ✓');
  } catch (err) {
    logger.error('Initialization failed:', err);
  }
}

export {
  tomation,
}
