import { AbstractAction, Action, ACTION_STATUS, ActionOnElement } from "~/dom/actions"
import { AutomationEvents, EVENT_NAMES } from "./events"
import { logger } from "~/feedback/logger"
import { UIUtils } from "~/feedback/ui-utils"
import { setDocument } from '../dsl/ui-element'

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
    logger.setEnabled(value);
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

let running = false

async function start(startAction: Action) {
  if (running) {
    logger.error('Not able to run test while other test is running.')
    throw new Error('Not able to run test while other test is running.')
  }
  running = true
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
    running = false
    AutomationEvents.dispatch(EVENT_NAMES.TEST_END, {
      action: startAction?.getJSON()
    })
  }
}

const AutomationRunner = {
  start,
  get running() {
    return running
  }
}

export { AutomationRunner, TestPlayStatus, TestSpeed, RunMode, Setup, AutomationInstance }
