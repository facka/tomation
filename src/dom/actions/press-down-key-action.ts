import { UIElement } from '../../dsl/ui-element'
import { ActionOnElement } from './action-on-element'

class PressDownKeyAction extends ActionOnElement {
  constructor (uiElement: UIElement) {
    super(uiElement)
  }

  protected executeActionOnElement () {
    this.element?.dispatchEvent(
      new KeyboardEvent('keyup', {
        altKey: false,
        code: 'Down',
        ctrlKey: false,
        isComposing: false,
        key: 'Down',
        location: 0,
        metaKey: false,
        repeat: false,
        shiftKey: false,
        which: 40,
        charCode: 0,
        keyCode: 40,
      })
    )
  }

  getDescription () {
    return `Press Down key in ${this.getElementName()}`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'PressDownKey',
    }
  }
}

export { PressDownKeyAction }
