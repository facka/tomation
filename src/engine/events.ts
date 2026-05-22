enum EVENT_NAMES {
  ACTION_UPDATE = 'tomation-action-update',
  SAVE_VALUE = 'tomation-save-value',
  REGISTER_TEST = 'tomation-register-test',
  TEST_STARTED = 'tomation-test-started',
  TEST_PASSED = 'tomation-test-passed',
  TEST_FAILED = 'tomation-test-failed',
  TEST_END = 'tomation-test-end',
  TEST_STOP = 'tomation-test-stop',
  TEST_PAUSE = 'tomation-test-pause',
  TEST_PLAY = 'tomation-test-play',
  USER_ACCEPT = 'tomation-user-accept',
  USER_REJECT = 'tomation-user-reject',
  SESSION_INIT = 'tomation-session-init',
  URL_MISMATCH = 'tomation-url-mismatch',
  SESSION_CONNECTED = 'tomation-session-connected',
  CLEAR_TESTS = 'tomation-clear-tests',
  TESTS_LOADED = 'tomation-tests-loaded',
}

type AutomationEventHandlerType = ((action?: unknown) => void | Promise<void>)

class EventDispatcher {
  private events: Map<EVENT_NAMES, Set<AutomationEventHandlerType>>

  /**
   * Creates an empty in-memory registry of event listeners.
   */
  constructor() {
    this.events = new Map()
  }

  /**
   * Subscribes a callback to an event.
   * Returns a function that can be called to unsubscribe the callback.
   */
  on(eventName: EVENT_NAMES, callback: AutomationEventHandlerType): () => void {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, new Set())
    }

    this.events.get(eventName)?.add(callback)

    return () => this.off(eventName, callback)
  }

  /**
   * Removes a specific callback from an event.
   * If the event has no listeners left, its entry is removed.
   */
  off(eventName: EVENT_NAMES, callback: AutomationEventHandlerType) {
    const listeners = this.events.get(eventName)

    if (!listeners) {
      return
    }

    listeners.delete(callback)

    if (listeners.size === 0) {
      this.events.delete(eventName)
    }
  }

  /**
   * Subscribes a callback that will run only once.
   * The callback is automatically removed before it is executed.
   */
  once(eventName: EVENT_NAMES, callback: AutomationEventHandlerType): () => void {
    const wrapper: AutomationEventHandlerType = async (data?: unknown) => {
      this.off(eventName, wrapper)
      await callback(data)
    }

    return this.on(eventName, wrapper)
  }

  /**
   * Dispatches an event payload to all current listeners in registration order.
   * Listener callbacks are awaited sequentially.
   */
  async dispatch(eventName: EVENT_NAMES, data?: unknown) {
    const listeners = this.events.get(eventName)

    if (!listeners || listeners.size === 0) {
      return
    }

    for (const callback of Array.from(listeners)) {
      await callback(data)
    }
  }

  /**
   * Clears listeners for a specific event or for all events if no event is provided.
   */
  clear(eventName?: EVENT_NAMES) {
    if (eventName) {
      this.events.delete(eventName)
      return
    }

    this.events.clear()
  }

  /**
   * Returns the number of listeners currently registered for an event.
   */
  listenerCount(eventName: EVENT_NAMES) {
    return this.events.get(eventName)?.size ?? 0
  }
}

const AutomationEvents = new EventDispatcher()

export {
  EVENT_NAMES,
  AutomationEvents
}
