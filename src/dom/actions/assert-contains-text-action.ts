import { UIElement } from '../../dsl/ui-element'
import { ActionOnElement } from './action-on-element'

class AssertContainsTextAction extends ActionOnElement {
  text: string

  constructor (uiElement: UIElement, text: string) {
    super(uiElement)
    this.text = text
  }

  protected executeActionOnElement () {
    const containsText = this.element?.innerText.includes(this.text)
    if (!containsText) {
      throw new Error(`Text in element ${this.getElementName()} doesn't contain '${this.text}'`)
    }
  }

  getDescription () {
    return `Assert that ${this.getElementName()} contains '${this.text}'`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'AssertContainsText',
      value: this.text,
    }
  }
}

export { AssertContainsTextAction }
