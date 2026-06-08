import { AbstractAction, Action, ACTION_STATUS, ActionOnElement } from "~/dom/actions"
import { AutomationEvents, EVENT_NAMES } from "./events"
import { AutomationCompiler } from './compiler'
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

type TestInstaller = () => void
type ActionResumeCallback = (action: AbstractAction) => void

class Automation {
  private _document: Document
  debug: boolean
  private _uiUtils: UIUtils
  private _running: boolean
  speed: TestSpeed
  status: TestPlayStatus
  runMode: RunMode
  currentActionCallback: ActionResumeCallback | undefined
  currentAction: AbstractAction | undefined
  tests: Array<TestInstaller>
  initialActionByTestId: Record<string, Action>

  constructor(window: Window, tests: Array<TestInstaller>) {
    this._document = window.document
    this.debug = true
    this._uiUtils = new UIUtils(window)
    this._running = false
    this.speed = TestSpeed.NORMAL
    this.status = TestPlayStatus.STOPPED
    this.tests = tests
    this.runMode = RunMode.NORMAL
    this.initialActionByTestId = {}
  }

  public get document() {
    return this._document
  }

  public get uiUtils() {
    return this._uiUtils
  }

  public get running() {
    return this._running
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

  private executeCurrentActionCallback() {
    if (this.currentActionCallback && this.currentAction) {
      this.currentActionCallback(this.currentAction)
      this.currentActionCallback = undefined
    }
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
    logger.log('Continue: Executing current action callback')
    this.executeCurrentActionCallback()
  }

  public next() {
    logger.log('Continue Test to Next Step...')
    this.status = TestPlayStatus.PLAYING
    this.runMode = RunMode.STEPBYSTEP
    AutomationEvents.dispatch(EVENT_NAMES.TEST_PLAY)
    logger.log('Next: Executing current action callback')
    this.executeCurrentActionCallback()
  }

  public stop() {
    logger.log('Stop Test')
    this.status = TestPlayStatus.STOPPED
    logger.log('Stop: Executing current action callback')
    this.executeCurrentActionCallback()
    AutomationEvents.dispatch(EVENT_NAMES.TEST_STOP)
  }

  public retryAction() {
    logger.log('Retry current step')
    this.status = TestPlayStatus.PLAYING
    AutomationEvents.dispatch(EVENT_NAMES.TEST_PLAY)
    if (this.currentActionCallback && this.currentAction) {
      const currentElementAction = this.currentAction as ActionOnElement
      if (currentElementAction.resetTries) {
        logger.log('Retry: Resetting tries for current action')
        currentElementAction.resetTries()
      }
      logger.log('Retry: Executing current action callback')
      this.executeCurrentActionCallback()
    }
  }

  public skipAction() {
    logger.log('Skip current step')
    this.status = TestPlayStatus.PLAYING
    if (this.currentActionCallback && this.currentAction) {
      this.currentAction.status = ACTION_STATUS.SKIPPED
      logger.log('Skip: Marked current action as SKIPPED')
      void AbstractAction.notifyActionUpdated(this.currentAction)
      logger.log('Skip: Executing current action callback')
      this.executeCurrentActionCallback()
    }
  }

  public saveCurrentAction(callback: ActionResumeCallback, action: AbstractAction): void {
    logger.log('Save current action')
    this.currentActionCallback = callback
    this.currentAction = action
  }

  setDebug(value: boolean): void {
    logger.setEnabled(value)
  }

  public setupTests(): void {
    console.log('[tomation] Setting up tests...')
    // AutomationEvents.dispatch(EVENT_NAMES.CLEAR_TESTS) no need to send event, tests are supposed to be removed before compilation
    this.tests?.forEach((installerFn) => installerFn())
    AutomationEvents.dispatch(EVENT_NAMES.TESTS_LOADED)
  }

  public getTests(): Array<TestInstaller> {
    return this.tests
  }

  public setInitialAction(testId: string, action: Action): void {
    this.initialActionByTestId[testId] = action
  }

  public getInitialAction(testId: string): Action | undefined {
    return this.initialActionByTestId[testId]
  }

  public getRegisteredTestIds(): string[] {
    return Object.keys(this.initialActionByTestId)
  }

  public runTest(testId: string): void {
    const action = this.getInitialAction(testId)
    if (!action) {
      logger.log('Available Tests:', this.getRegisteredTestIds())
      throw new Error(`[tomation] Test with id ${testId} not found.`)
    }

    AutomationCompiler.init(action)
    logger.log(`Compiled Test: ${testId}`)
    void this.start(action)
  }

  public compileTest(testId: string) {
    const action = this.getInitialAction(testId)
    if (!action) {
      logger.log('Available Tests:', this.getRegisteredTestIds())
      throw new Error(`[tomation] Test with id ${testId} not found for compilation.`)
    }

    AutomationCompiler.init(action)
    return action.getJSON()
  }

  public async start(startAction: Action): Promise<void> {
    if (this._running) {
      logger.error('Not able to run test while other test is running.')
      throw new Error('Not able to run test while other test is running.')
    }

    this._running = true
    this.status = TestPlayStatus.PLAYING
    this.runMode = RunMode.NORMAL
    logger.groupCollapsed('Start Action: ', startAction.getDescription())
    AutomationEvents.dispatch(EVENT_NAMES.TEST_STARTED, {
      action: startAction?.getJSON(),
    })

    try {
      await startAction?.execute()
      AutomationEvents.dispatch(EVENT_NAMES.TEST_PASSED, { id: startAction.name })
    } catch (e: any) {
      AutomationEvents.dispatch(EVENT_NAMES.TEST_FAILED, { id: startAction.name })
      this.uiUtils.hideCheckElementContainer()
      logger.error(`🤖 Error running task ${startAction.getDescription()}. Reason: ${e.message}`)
      throw e
    } finally {
      logger.groupEnd()
      this._running = false
      AutomationEvents.dispatch(EVENT_NAMES.TEST_END, {
        action: startAction?.getJSON()
      })
    }
  }

}

let AutomationInstance: Automation

const Setup = (window: Window, tests?: Array<TestInstaller>) => {
  if (AutomationInstance) {
    throw new Error('Automation Setup already executed.')
  }
  AutomationInstance = new Automation(window, tests || [])
  setDocument(AutomationInstance.document)

  return AutomationInstance
}

export { TestPlayStatus, TestSpeed, RunMode, Setup, AutomationInstance }
