import { UIElement } from '../../dsl/ui-element'
import { ActionOnElement } from './action-on-element'

class PressTabKeyAction extends ActionOnElement {
  constructor (uiElement: UIElement) {
    super(uiElement)
  }

  protected executeActionOnElement () {
    this.element?.dispatchEvent(
      new KeyboardEvent('keydown', {
        altKey: false,
        code: 'Tab',
        ctrlKey: false,
        isComposing: false,
        key: 'Tab',
        location: 0,
        metaKey: false,
        repeat: false,
        shiftKey: false,
        which: 9,
        charCode: 0,
        keyCode: 9,
      })
    )
  }

  getDescription () {
    return `Press Tab key in ${this.getElementName()}`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'PressTabKey',
    }
  }
}

export { PressTabKeyAction }
