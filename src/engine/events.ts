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
}

type AutomationEventHandlerType = ((action?: any) => void)

class EventDispatcher {
  events: Map<EVENT_NAMES, Array<AutomationEventHandlerType>>

  constructor() {
    this.events = new Map()
  }

  on(eventName: EVENT_NAMES, callback: AutomationEventHandlerType) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, [])
    }
    this.events.get(eventName)?.push(callback)
  }

  off(eventName: EVENT_NAMES, callback: AutomationEventHandlerType) {
    if (this.events.has(eventName) ) {
      this.events.set(eventName, this.events.get(eventName)?.filter((cb: AutomationEventHandlerType) => cb !== callback) || [])
    }
  }

  dispatch(eventName: EVENT_NAMES, data?: any) {
    if (this.events.has(eventName) ) {
      this.events.get(eventName)?.forEach((callback: AutomationEventHandlerType) => {
        console.log(`Dispatch Event ${eventName}:`, data)
        callback(data)
      })
    }
  }
}

const AutomationEvents = new EventDispatcher()

export {
  EVENT_NAMES,
  AutomationEvents
}
