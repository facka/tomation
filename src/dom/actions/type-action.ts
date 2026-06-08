import { UIElement } from '../../dsl/ui-element'
import { ActionOnElement } from './action-on-element'

class TypeAction extends ActionOnElement {
  value: string

  constructor (uiElement: UIElement, value: string) {
    super(uiElement)
    this.value = value
  }

  protected executeActionOnElement () {
    let inputElem = this.element as HTMLInputElement | HTMLTextAreaElement
    if (this.element?.tagName !== 'INPUT' && this.element?.tagName !== 'SELECT' && this.element?.tagName !== 'TEXTAREA') {
      inputElem = this.element?.querySelectorAll('input')[0] as HTMLInputElement
      if (!inputElem) {
        throw new Error('Input element not found. Not able to type value in element ' + this.getElementName())
      }
    }
    inputElem.value = this.value
    inputElem.dispatchEvent(new Event('change'))
    inputElem.dispatchEvent(new Event('keyup', { bubbles: true }))
    inputElem.dispatchEvent(new Event('input', { bubbles: true }))
  }

  getDescription () {
    return `Type value '${this.value}' in ${this.getElementName()}`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'Type',
      value: this.value,
    }
  }
}

export { TypeAction }
