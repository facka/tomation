import { UIElement } from '../../dsl/ui-element'
import { AutomationEvents, EVENT_NAMES } from '../../engine/events'
import { ActionOnElement } from './action-on-element'

class SaveValueAction extends ActionOnElement {
  memorySlotName: string

  constructor (uiElement: UIElement, memorySlotName: string) {
    super(uiElement)
    this.memorySlotName = memorySlotName
  }

  protected executeActionOnElement () {
    let inputElem = this.element as HTMLInputElement
    if (this.element?.tagName !== 'INPUT' && this.element?.tagName !== 'SELECT' && this.element?.tagName !== 'TEXTAREA') {
      inputElem = this.element?.querySelectorAll('input')[0] as HTMLInputElement
      if (!inputElem) {
        throw new Error('Input element not found. Not able to save value from element ' + this.getElementName())
      }
    }
    AutomationEvents.dispatch(EVENT_NAMES.SAVE_VALUE, {
      memorySlotName: this.memorySlotName,
      value: inputElem.value
    })
  }

  getDescription () {
    return `Save value of ${this.getElementName()} in ${this.memorySlotName}`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'SaveValue',
      memorySlotName: this.memorySlotName,
    }
  }
}

export { SaveValueAction }
