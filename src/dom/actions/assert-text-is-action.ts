import { UIElement } from '../../dsl/ui-element'
import { ActionOnElement } from './action-on-element'

class AssertTextIsAction extends ActionOnElement {
  text: string

  constructor (uiElement: UIElement, text: string) {
    super(uiElement)
    this.text = text
  }

  protected executeActionOnElement () {
    const textIsEqual = this.element?.innerText === this.text
    if (!textIsEqual) {
      throw new Error(`Text in element ${this.getElementName()} is not '${this.text}'`)
    }
  }

  getDescription () {
    return `Assert that text in ${this.getElementName()} is '${this.text}'`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'AssertTextIsAction',
      value: this.text,
    }
  }
}

export { AssertTextIsAction }
