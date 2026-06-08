import { AbstractAction } from './abstract-action'

class ReloadPageAction extends AbstractAction {
  constructor () {
    super()
  }

  getDescription () {
    return 'Reload page'
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'ReloadPage',
    }
  }

  async executeAction () {
    await location.reload()
  }

  resetAction () {}
}

export { ReloadPageAction }
