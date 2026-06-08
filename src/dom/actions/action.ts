import { wait } from '../../feedback/ui-utils'
import { AutomationInstance } from '../../engine/runner'
import { AbstractAction } from './abstract-action'
import { ACTION_STATUS } from './commons/action-status'

class Action extends AbstractAction {
  static useImprovedContinue = true
  name: string
  stepsFn: (params?: any) => void
  steps: Array<AbstractAction>
  params: any
  index: number

  constructor (name: string, steps: (params?: any) => void) {
    super()
    this.name = name
    this.stepsFn = steps
    this.steps = []
    this.index = 0
  }

  getDescription () {
    return this.name
  }

  compileSteps () {
    super.reset()
    this.stepsFn(this.params)
  }

  stepsToJSON () {
    return this.steps.reduce((acc: Array<Object>, curr: AbstractAction) => {
      acc.push(curr.getJSON())
      return acc
    }, [])
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'Action',
      params: this.params,
      steps: this.stepsToJSON(),
    }
  }

  resetAction () {
    this.steps.length = 0
    this.index = 0
  }

  async continue () {
    if (AutomationInstance.isPaused) {
      return new Promise<void>((resolve, reject) => {
        AutomationInstance.saveCurrentAction(async (action: AbstractAction) => {
          if (action.status == ACTION_STATUS.SKIPPED) {
            return resolve()
          }
          try {
            await (action as Action).continue()
            resolve()
          } catch (error: any) {
            reject(error)
          }
        }, this)
      })
    }
    if (AutomationInstance.isStopped) {
      throw new Error('Test stopped manually')
    }
    if (this.index < this.steps.length) {
      const step = this.steps[this.index]
      await wait(AutomationInstance.speed)
      await step.execute()
      if (!AutomationInstance.isPaused) {
        this.index++
        await this.continue()
      } else {
        return new Promise<void>((resolve, reject) => {
          AutomationInstance.saveCurrentAction(async (action: AbstractAction) => {
            if (action.status == ACTION_STATUS.SKIPPED) {
              this.index++
              await AbstractAction.notifyActionUpdated(step)
              await this.continue()
              return resolve()
            }
            try {
              await (action as Action).continue()
              resolve()
            } catch (error: any) {
              reject(error)
            }
          }, step)
        })
      }
    }
  }

  async continueImproved () {
    if (AutomationInstance.isPaused) {
      return new Promise<void>((resolve, reject) => {
        AutomationInstance.saveCurrentAction(async (action: AbstractAction) => {
          if (action.status == ACTION_STATUS.SKIPPED) {
            return resolve()
          }
          try {
            await (action as Action).continueImproved()
            resolve()
          } catch (error: any) {
            reject(error)
          }
        }, this)
      })
    }
    if (AutomationInstance.isStopped) {
      throw new Error('Test stopped manually')
    }

    console.warn('[tomation] continueImproved is still experimental, not fully working in all scenarios. Use with caution.')
    while (this.index < this.steps.length) {
      const step = this.steps[this.index]
      await wait(AutomationInstance.speed)
      await step.execute()
      if (!AutomationInstance.isPaused) {
        this.index++
        continue
      }

      let shouldContinueCurrentAction = false
      await new Promise<void>((resolve, reject) => {
        AutomationInstance.saveCurrentAction(async (action: AbstractAction) => {
          if (action.status == ACTION_STATUS.SKIPPED) {
            this.index++
            shouldContinueCurrentAction = true
            await AbstractAction.notifyActionUpdated(step)
            return resolve()
          }
          try {
            await (action as Action).continueImproved()
            resolve()
          } catch (error: any) {
            reject(error)
          }
        }, step)
      })

      if (shouldContinueCurrentAction) {
        continue
      }

      return
    }
  }

  async executeAction () {
    this.index = 0
    if (Action.useImprovedContinue) {
      await this.continueImproved()
    } else {
      await this.continue()
    }
  }

  setParams (params?: any) {
    this.params = params
  }

  addStep (action: AbstractAction) {
    this.steps.push(action)
  }
}

export { Action }
