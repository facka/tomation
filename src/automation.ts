import { 
  AbstractAction,
  Action,
  ActionOnElement,
  ClickAction,
  AssertTextIsAction,
  AssertContainsTextAction,
  AssertValueIsAction,
  AssertExistsAction,
  AssertNotExistsAction,
  SelectAction,
  TypeAction,
  TypePasswordAction,
  PressEscKeyAction,
  PressDownKeyAction,
  PressTabKeyAction,
  PressKeyAction,
  KEY_MAP,
  PressEnterKeyAction,
  UploadFileAction,
  SaveValueAction,
  WaitAction,
  WaitUntilElementRemovedAction,
  PauseAction,
  ManualAction,
  ACTION_STATUS,
  ReloadPageAction,
} from './actions'
import { UIUtils } from "./ui-utils"
import { UIElement, setDocument } from './ui-element-builder'
import DateUtils from './date-utils'
import { v4 as uuidv4 } from 'uuid';

// --- LOGGING CONTROL ---
class Logger {
  private enabled = false;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  log(...args: any[]) {
    if (this.enabled) {
      console.log('[tomation]', ...args);
    }
  }

  groupCollapsed(...args: any[]) {
    if (this.enabled) {
      console.groupCollapsed('[tomation]', ...args);
    }
  }

  groupEnd() {
    if (this.enabled) {
      console.groupEnd();
    }
  }

  error(...args: any[]) {
    if (this.enabled) {
      console.error('[tomation]', ...args);
    }
  }
}

const logger = new Logger();
const setAutomationLogs = (enabled: boolean) => {
    logger.setEnabled(enabled);
}

class AutomationCompiler {
  static currentAction: Action
  static isCompiling: boolean

  static compileAction (action: Action) {
    const previousAction = AutomationCompiler.currentAction
    AutomationCompiler.currentAction = action
    action.compileSteps()
    AutomationCompiler.currentAction = previousAction
  }

  static addAction (action: AbstractAction) {
    logger.log('Add action: ', action.getDescription())
    AutomationCompiler.currentAction.addStep(action)
  }

  static init (startAction: Action) {
    AutomationCompiler.currentAction = startAction
    AutomationCompiler.isCompiling = true
    logger.groupCollapsed('Compile: ' + startAction.getDescription())
    startAction.compileSteps()
    AutomationCompiler.isCompiling = false
    logger.log('Compilation finished')
    logger.groupEnd()
  }
}

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

enum TestSpeed {
  SLOW = 2000,
  NORMAL = 1000,
  FAST = 200
}

enum TestPlayStatus {
  PLAYING = 'Playing',
  STOPPED = 'Stopped',
  PAUSED = 'Paused'
}

enum RunMode {
  NORMAL = 'Normal',
  STEPBYSTEP = 'Step By Step',
}


class AutomationRunner {
  static running = false

  static async start (startAction: Action) {
    if (AutomationRunner.running) {
      logger.error('Not able to run test while other test is running.')
      throw new Error('Not able to run test while other test is running.')
    }
    AutomationRunner.running = true
    AutomationInstance.status = TestPlayStatus.PLAYING
    AutomationInstance.runMode = RunMode.NORMAL
    logger.groupCollapsed('Start Action: ', startAction.getDescription())
    AutomationEvents.dispatch(EVENT_NAMES.TEST_STARTED, {
      action: startAction?.getJSON(),
    })
    try {
      await startAction?.execute()
      AutomationEvents.dispatch(EVENT_NAMES.TEST_PASSED, { id: startAction.name })
    } catch (e: any) {
      AutomationEvents.dispatch(EVENT_NAMES.TEST_FAILED, { id: startAction.name })
      AutomationInstance.uiUtils.hideCheckElementContainer()
      logger.error(`🤖 Error running task ${startAction.getDescription()}. Reason: ${e.message}`)
      throw e
    } finally {
      logger.groupEnd()
      AutomationRunner.running = false
      AutomationEvents.dispatch(EVENT_NAMES.TEST_END, {
        action: startAction?.getJSON()
      })
    }
  }  
}

const TestsMap: any = {}

const Test = (id: string, steps: () => void) => {
  console.log(`Registering Test: ${id}...`)
  const action = new Action(id, steps)
  AutomationCompiler.init(action)
  console.log(`Compiled Test: ${id}`)
  AutomationEvents.dispatch(EVENT_NAMES.REGISTER_TEST, { id, action: action.getJSON() })
  console.log(`Registered Test: ${id} in TestsMap`)
  TestsMap[id] = () => {
    AutomationRunner.start(action)
  }
}

const RunTest = (id: string) => {
  if (!TestsMap[id]) {
    console.log('Available Tests:', Object.keys(TestsMap))
    throw new Error(`Test with id ${id} not found.`)
  } else {
    TestsMap[id]()
  }
}

const Task = <T>(id: string, steps: (params: T) => void) => {
  return async (params?: T): Promise<void> => {
    const action = new Action(id, steps)
    action.setParams(params)
    if (!AutomationRunner.running && !AutomationCompiler.isCompiling) {
      try {
        logger.log(`Compilation of Task ${id} starts...`)
        AutomationCompiler.init(action)
        logger.log(`Compilation of Task ${id} Finished.`)
        logger.log(`Start running Task ${id}...`)
        await AutomationRunner.start(action)
        logger.log(`End of Task ${id}: SUCCESS`)
      } catch (e: any) {
        logger.error('Error running task ' + id + '. ' + e.message)
      }
    } else {
      logger.log(`Adding action ${id} to compilation stack`)
      AutomationCompiler.addAction(action)
      AutomationCompiler.compileAction(action)
    }
  }
}

const Click = (uiElement: UIElement) => {
  const action = new ClickAction(uiElement)
  AutomationCompiler.addAction(action)
}

const Assert = (uiElement: UIElement) => {
  return {
    textIs: (text: string) => {
      AutomationCompiler.addAction(new AssertTextIsAction(uiElement, text))
    },
    containsText: (text: string) => {
      AutomationCompiler.addAction(new AssertContainsTextAction(uiElement, text))
    },
    valueIs: (value: string) => {
      AutomationCompiler.addAction(new AssertValueIsAction(uiElement, value))
    },
    exists: () => {
      AutomationCompiler.addAction(new AssertExistsAction(uiElement))
    },
    notExists: () => {
      AutomationCompiler.addAction(new AssertNotExistsAction(uiElement))
    }
  }
}

const Select = (value: string) => {
  return {
    in: (uiElement: UIElement) => {
      const action = new SelectAction(uiElement, value)
      AutomationCompiler.addAction(action)
    }
  }
}

const Type = (value: string) => {
  return {
    in: (uiElement: UIElement) => {
      const action = new TypeAction(uiElement, value)
      AutomationCompiler.addAction(action)
    }
  }
}

const ClearValue = () => {
  return {
    in: (uiElement: UIElement) => {
      const action = new TypeAction(uiElement, '')
      AutomationCompiler.addAction(action)
    }
  }
}

const PressEscKey = () => {
  return {
    in: (uiElement: UIElement) => {
      AutomationCompiler.addAction(new PressEscKeyAction(uiElement))
    }
  }
}

const PressDownKey = () => {
  return {
    in: (uiElement: UIElement) => {
      AutomationCompiler.addAction(new PressDownKeyAction(uiElement))
    }
  }
}

const PressTabKey = () => {
  return {
    in: (uiElement: UIElement) => {
      AutomationCompiler.addAction(new PressTabKeyAction(uiElement))
    }
  }
}

const PressEnterKey = () => {
  return {
    in: (uiElement: UIElement) => {
      AutomationCompiler.addAction(new PressEnterKeyAction(uiElement))
    }
  }
}

const PressKey = (key: KEY_MAP) => {
  return {
    in: (uiElement: UIElement) => {
      AutomationCompiler.addAction(new PressKeyAction(uiElement, key))
    }
  }
}

const TypePassword = (value: string) => {
  return {
    in: (uiElement: UIElement) => {
      const action = new TypePasswordAction(uiElement, value)
      AutomationCompiler.addAction(action)
    }
  }
}

const UploadFile = (file: File) => {
  return {
    in: (uiElement: UIElement) => {
      const action = new UploadFileAction(uiElement, file)
      AutomationCompiler.addAction(action)
    }
  }
}

const SaveValue = (uiElement: UIElement) => {
  return {
    in: (memorySlotName: string) => {
      const action = new SaveValueAction(uiElement, memorySlotName)
      AutomationCompiler.addAction(action)
    }
  }
}

const Wait = (miliseconds: number) => {
  AutomationCompiler.addAction(new WaitAction(miliseconds))
}

Wait.untilElement = (uiElement: UIElement) => {
  return {
    isRemoved: () => {
      AutomationCompiler.addAction(new WaitUntilElementRemovedAction(uiElement))
    }
  }
}

const Pause = () => {
  AutomationCompiler.addAction(new PauseAction())
}

const ManualTask = (description: string) => {
  AutomationCompiler.addAction(new ManualAction(description))
}

const ReloadPage = () => {
  AutomationCompiler.addAction(new ReloadPageAction())
}

class Automation {
  private _document: Document
  debug: Boolean
  private _uiUtils: UIUtils
  speed: TestSpeed
  status: TestPlayStatus
  runMode: RunMode
  currentActionCallback: ((action: AbstractAction) => {}) | undefined
  currentAction: AbstractAction | undefined

  constructor(window: Window) {
    this._document = window.document
    this.debug = true
    this._uiUtils = new UIUtils(window)
    this.speed = TestSpeed.NORMAL
    this.status = TestPlayStatus.STOPPED
    this.runMode = RunMode.NORMAL
  }

  public get document() {
    return this._document
  }

  public get uiUtils() {
    return this._uiUtils
  }

  public get isStepByStepMode() {
    return this.runMode == RunMode.STEPBYSTEP
  }

  public get isStopped() {
    return this.status == TestPlayStatus.STOPPED
  }

  public get isPlaying() {
    return this.status == TestPlayStatus.PLAYING
  }


  public get isPaused() {
    return this.status == TestPlayStatus.PAUSED
  }

  public pause() {
    logger.log('Pause Test')
    this.status = TestPlayStatus.PAUSED
    AutomationEvents.dispatch(EVENT_NAMES.TEST_PAUSE)
  }

  public continue() {
    logger.log('Continue Test')
    this.status = TestPlayStatus.PLAYING
    this.runMode = RunMode.NORMAL
    AutomationEvents.dispatch(EVENT_NAMES.TEST_PLAY)
    if (this.currentActionCallback && this.currentAction) {
      logger.log('Continue: Executing current action callback')
      this.currentActionCallback(this.currentAction)
      this.currentActionCallback = undefined
    }
  }

  public next() {
    logger.log('Continue Test to Next Step...')
    this.status = TestPlayStatus.PLAYING
    this.runMode = RunMode.STEPBYSTEP
    AutomationEvents.dispatch(EVENT_NAMES.TEST_PLAY)
    if (this.currentActionCallback && this.currentAction) {
      logger.log('Next: Executing current action callback')
      this.currentActionCallback(this.currentAction)
      this.currentActionCallback = undefined
    }
  }

  public stop() {
    logger.log('Stop Test')
    this.status = TestPlayStatus.STOPPED
    if (this.currentActionCallback && this.currentAction) {
      logger.log('Stop: Executing current action callback')
      this.currentActionCallback(this.currentAction)
      this.currentActionCallback = undefined
    }
    AutomationEvents.dispatch(EVENT_NAMES.TEST_STOP)
  }

  public retryAction() {
    logger.log('Retry current step')
    this.status = TestPlayStatus.PLAYING
    AutomationEvents.dispatch(EVENT_NAMES.TEST_PLAY)
    if (this.currentActionCallback && this.currentAction) {
      if ((this.currentAction as ActionOnElement).resetTries) {
        logger.log('Retry: Resetting tries for current action');
        (this.currentAction as ActionOnElement).resetTries()
      }
      logger.log('Retry: Executing current action callback')
      this.currentActionCallback(this.currentAction)
      this.currentActionCallback = undefined
    }
  }

  public skipAction() {
    logger.log('Skip current step')
    this.status = TestPlayStatus.PLAYING
    if (this.currentActionCallback && this.currentAction) {
      this.currentAction.status = ACTION_STATUS.SKIPPED
      logger.log('Skip: Marked current action as SKIPPED')
      AbstractAction.notifyActionUpdated(this.currentAction) // Not working
      logger.log('Skip: Executing current action callback')
      this.currentActionCallback(this.currentAction)
      this.currentActionCallback = undefined
    }
  }

  public saveCurrentAction(callback: (action: AbstractAction) => {}, action: AbstractAction) {
    logger.log('Save current action')
    this.currentActionCallback = callback
    this.currentAction = action
  }

  setDebug(value: boolean) {
    setAutomationLogs(value)
  }
}

let AutomationInstance: Automation

const Setup = (window: Window, tests?: Array<any>) => {
  /* if (AutomationInstance) {
    throw new Error('Automation Setup already executed.')
  } */
  AutomationInstance = new Automation(window)
  setDocument(AutomationInstance.document)

  tests?.forEach((installerFn) => installerFn())
  return AutomationInstance
}

interface TomationOptions {
  matches: string | RegExp;
  tests: any[];
  speed?: keyof typeof TestSpeed;
  debug?: boolean;
}

export function tomation(options: TomationOptions) {
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
  Setup,
  AutomationInstance,
  Test,
  RunTest,
  Task,
  Click,
  Assert,
  Select,
  Type,
  TypePassword,
  ClearValue,
  PressEscKey,
  PressDownKey,
  PressTabKey,
  PressKey,
  PressEnterKey,
  KEY_MAP,
  UploadFile,
  SaveValue,
  Wait,
  Pause,
  ManualTask,
  ReloadPage,
  DateUtils,
  AutomationEvents,
  EVENT_NAMES,
  TestSpeed,
  ACTION_STATUS,
  setAutomationLogs,
}
