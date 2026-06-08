import { UIElement } from '../../dsl/ui-element'
import { ActionOnElement } from './action-on-element'

class AssertValueIsAction extends ActionOnElement {
  value: string | boolean | number | Date

  constructor (uiElement: UIElement, value: string | boolean | number | Date) {
    super(uiElement)
    this.value = value
  }

  protected executeActionOnElement () {
    const valueIsEqual = (this.element as HTMLInputElement).value === this.value
    if (!valueIsEqual) {
      throw new Error(`Value in element ${this.getElementName()} is not '${this.value}'`)
    }
  }

  getDescription () {
    return `Assert that value in ${this.getElementName()} is '${this.value}'`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'AssertValueIsAction',
      value: this.value,
    }
  }
}

export { AssertValueIsAction }
