import { UIElement } from '../../dsl/ui-element'
import { AutomationInstance } from '../../engine/runner'
import { ActionOnElement } from './action-on-element'
import { waitForElement } from './commons/wait-for-element'

class AssertNotExistsAction extends ActionOnElement {
  constructor (uiElement: UIElement) {
    super(uiElement)
  }

  async executeAction () {
    try {
      this.element = await waitForElement(this, this.uiElement, 1000, 5, true) as HTMLElement
      this.element?.setAttribute('test-id', this.getElementName())
      await AutomationInstance.uiUtils.checkElement(this.element, this.getElementName())
      this.executeActionOnElement()
      await AutomationInstance.uiUtils.hideCheckElementContainer()
    } catch (e: any) {
      throw Error(e.message)
    }
  }

  protected executeActionOnElement () {
    const exists = !!this.element
    if (exists) {
      throw new Error(`Element ${this.getElementName()} was not expected to exist`)
    }
  }

  getDescription () {
    return `Assert that ${this.getElementName()} doesn't exist`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'AssertNotExistsAction',
    }
  }
}

export { AssertNotExistsAction }
