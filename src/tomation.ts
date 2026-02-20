import { v4 as uuidv4 } from 'uuid';
import { AutomationEvents, EVENT_NAMES } from "./engine/events";
import { RunTest } from "./dsl/test";
import { AutomationInstance, Setup, TestSpeed } from './engine/runner';

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

  const shouldRun =
    typeof matches === 'string'
      ? document.location.href.includes(matches)
      : !!document.location.href.match(matches);

  if (!shouldRun) {
    console.log(`[tomation] URL "${document.location.href}" does not match "${matches}"`);
    return;
  }

  try {
    // Messaging bridge
    // Forward framework events

    console.log('[tomation] Setting up messaging bridge with extension...');
    Object.values(EVENT_NAMES).forEach((event) => {
      console.log(`[tomation] Setting up listener for event "${event}"`);
      AutomationEvents.on(event as EVENT_NAMES, (data: any) => {
        console.log(`[tomation] Dispatching event "${event}" to extension`, data);
        window.postMessage({
          message: 'injectedScript-to-contentScript',
          sender: 'tomation',
          payload: {
            cmd: event,
            params: data,
          },
        });
      });
    });

    // Listen for extension messages
    window.addEventListener('message', (event: any) => {
      try {
        console.log('[tomation] Received message from extension:', event.data);
        const { message, sender, payload } = event.data || {};
        const { cmd, params } = payload || {};
        // if (event.source !== window) return;
        if (sender !== 'web-extension') return;
        if (message === 'contentScript-to-injectedScript') {
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
            console.log(`[tomation] Executing command "${cmd}" from extension`);
            commandFn();
          } else {
            console.warn(`[tomation] Unknown command "${cmd}" from extension`);
          }
          return;
        }
      } catch (err) {
        console.error('[tomation] Error handling message from extension:', err);
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
        cmd: EVENT_NAMES.SESSION_INIT,
        params: {
          speed: AutomationInstance.speed,
          sessionId: uuidv4(),
        },
      },
    });

    console.log('[tomation] Ready ✓');
  } catch (err) {
    console.error('[tomation] Initialization failed:', err);
  }
}

export {
  tomation,
}
