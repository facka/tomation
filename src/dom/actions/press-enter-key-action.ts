import { UIElement } from '../../dsl/ui-element'
import { ActionOnElement } from './action-on-element'

class PressEnterKeyAction extends ActionOnElement {
  constructor (uiElement: UIElement) {
    super(uiElement)
  }

  protected executeActionOnElement () {
    this.element?.dispatchEvent(
      new KeyboardEvent('keydown', {
        altKey: false,
        code: 'Enter',
        ctrlKey: false,
        isComposing: false,
        key: 'Enter',
        location: 0,
        metaKey: false,
        repeat: false,
        shiftKey: false,
        which: 13,
        charCode: 0,
        keyCode: 13,
      })
    )
  }

  getDescription () {
    return `Press Enter key in ${this.getElementName()}`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'PressEnterKey',
    }
  }
}

export { PressEnterKeyAction }
