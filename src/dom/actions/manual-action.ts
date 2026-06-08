import { AutomationEvents, EVENT_NAMES } from '../../engine/events'
import { AutomationInstance } from '../../engine/runner'
import { AbstractAction } from './abstract-action'

class ManualAction extends AbstractAction {
  description: string

  constructor (description: string) {
    super()
    this.description = description
  }

  getDescription () {
    return 'Manual Step: ' + this.description
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'ManualStep',
    }
  }

  async executeAction () {
    await AutomationInstance.uiUtils.showAlert('Waiting manual step...')
    return new Promise((resolve, reject) => {
      AutomationEvents.once(EVENT_NAMES.USER_ACCEPT, async () => {
        await AutomationInstance.uiUtils.hideAlert()
        return resolve(true)
      })
      AutomationEvents.once(EVENT_NAMES.USER_REJECT, async () => {
        await AutomationInstance.uiUtils.hideAlert()
        return reject()
      })
    })
  }

  resetAction () {}
}

export { ManualAction }
