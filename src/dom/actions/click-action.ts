import { UIElement } from '../../dsl/ui-element'
import { ActionOnElement } from './action-on-element'

class ClickAction extends ActionOnElement {
  constructor (uiElement: UIElement) {
    super(uiElement)
  }

  protected executeActionOnElement () {
    return this.element?.click()
  }

  getDescription () {
    return 'Click in ' + this.getElementName()
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'Click',
    }
  }
}

export { ClickAction }
