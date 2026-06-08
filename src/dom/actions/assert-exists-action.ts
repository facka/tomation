import { UIElement } from '../../dsl/ui-element'
import { ActionOnElement } from './action-on-element'

class AssertExistsAction extends ActionOnElement {
  constructor (uiElement: UIElement) {
    super(uiElement)
  }

  protected executeActionOnElement () {
    const exists = !!this.element
    if (!exists) {
      throw new Error(`Element ${this.getElementName()} doesn't exist`)
    }
  }

  getDescription () {
    return `Assert that ${this.getElementName()} exists`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'AssertExistsAction',
    }
  }
}

export { AssertExistsAction }
