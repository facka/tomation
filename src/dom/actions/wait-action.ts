import { wait } from '../../feedback/ui-utils'
import { AbstractAction } from './abstract-action'

class WaitAction extends AbstractAction {
  miliseconds: number

  constructor (miliseconds: number) {
    super()
    this.miliseconds = miliseconds
  }

  getDescription () {
    return 'Wait ' + this.miliseconds + ' miliseconds'
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'Wait',
    }
  }

  async executeAction () {
    await wait(this.miliseconds)
  }

  resetAction () {}
}

export { WaitAction }
