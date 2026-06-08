import { UIElement } from '../../dsl/ui-element'
import { AbstractAction } from './abstract-action'
import { waitForElement } from './commons/wait-for-element'

class WaitUntilElementRemovedAction extends AbstractAction {
  uiElement: UIElement
  tries: number

  constructor (uiElement: UIElement) {
    super()
    this.uiElement = uiElement
    this.tries = 0
  }

  updateTries (tries: number) {
    this.tries = tries
  }

  resetAction () {
    this.tries = 0
  }

  getElementName () {
    return this.uiElement?.getElementName()
  }

  protected async executeAction () {
    await waitForElement(this, this.uiElement, 1000, 10, true)
  }

  getDescription () {
    return 'Wait until ' + this.getElementName() + ' is removed'
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'WaitUntilElementRemoved',
    }
  }
}

export { WaitUntilElementRemovedAction }
