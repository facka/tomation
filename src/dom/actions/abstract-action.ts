import { v4 as uuidv4 } from 'uuid'
import { AutomationEvents, EVENT_NAMES } from '../../engine/events'
import { AutomationInstance } from '../../engine/runner'
import { logger } from '../../feedback/logger'
import { ACTION_STATUS } from './commons/action-status'

interface ActionContext {
  url: string,
  beforeHTML: string,
  beforeInputValues: Object,
  afterHTML: string,
  afterInputValues: Object,
  startTimestamp: string,
  endTimestamp: string
}

abstract class AbstractAction {
  status: ACTION_STATUS
  error: string
  id: string
  context: ActionContext

  constructor () {
    this.status = ACTION_STATUS.WAITING
    this.error = ''
    this.id = uuidv4()
    this.context = {
      beforeHTML: '',
      beforeInputValues: {},
      afterInputValues: {},
      afterHTML: '',
      url: '',
      startTimestamp: '',
      endTimestamp: ''
    }
  }

  abstract getDescription() : string

  getJSON () {
    return {
      id: this.id,
      description: this.getDescription(),
      context: this.context,
      status: this.status,
      error: this.error
    }
  }

  protected abstract executeAction() : Promise<any>
  protected abstract resetAction() : void

  reset () {
    this.status = ACTION_STATUS.WAITING
    this.error = ''
    this.resetAction()
  }

  private getInputValuesFromPage() {
    const inputsMap: any = {}
    const inputs = AutomationInstance.document.querySelectorAll<HTMLInputElement>('input')
    inputs.forEach((input, index) => {
      const id = `value-id-${index}`
      input.setAttribute('input-id', id)
      inputsMap[id] = input.value
    })
    return inputsMap
  }

  async execute () {
    try {
      this.status = ACTION_STATUS.RUNNING
      this.context.beforeInputValues = this.getInputValuesFromPage()
      this.context.beforeHTML = AutomationInstance.document.body.innerHTML
      await AbstractAction.notifyActionUpdated(this)
      logger.log('Action: ', this.getDescription())
      await this.executeAction()
      this.status = ACTION_STATUS.SUCCESS
      this.error = ''
      if (AutomationInstance.isStepByStepMode) {
        AutomationInstance.pause()
      }
    } catch (e: any) {
      this.status = ACTION_STATUS.ERROR
      this.error = e.message
      if (e.message == 'Test stopped manually') {
        throw Error('[tomation] Error in Action ' + this.getDescription() + '. Message: ' + e.message)
      } else {
        this.status = ACTION_STATUS.PAUSED
        AutomationInstance.pause()
      }
    } finally {
      this.context.afterInputValues = this.getInputValuesFromPage()
      this.context.afterHTML = AutomationInstance.document.body.innerHTML
      await AbstractAction.notifyActionUpdated(this)
    }
  }

  static async notifyActionUpdated (action: AbstractAction) {
    AutomationEvents.dispatch(EVENT_NAMES.ACTION_UPDATE, {
      action: action.getJSON(),
    })
  }
}

export { AbstractAction }
export type { ActionContext }
