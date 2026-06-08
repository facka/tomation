import { AutomationInstance } from '../../engine/runner'
import { AbstractAction } from './abstract-action'

class PauseAction extends AbstractAction {
  constructor () {
    super()
  }

  getDescription () {
    return 'Paused'
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'Pause',
    }
  }

  async executeAction () {
    await AutomationInstance.pause()
  }

  resetAction () {}
}

export { PauseAction }
