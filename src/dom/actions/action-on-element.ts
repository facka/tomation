import { UIElement } from '../../dsl/ui-element'
import { AutomationInstance } from '../../engine/runner'
import { AbstractAction } from './abstract-action'
import { waitForElement } from './commons/wait-for-element'

abstract class ActionOnElement extends AbstractAction {
  uiElement: UIElement
  element: HTMLElement | null
  tries: number

  constructor (uiElement: UIElement) {
    super()
    this.uiElement = uiElement
    this.element = null
    this.tries = 0
  }

  getElementName () {
    return this.uiElement?.getElementName()
  }

  updateTries (tries: number) {
    this.tries = tries
  }

  resetTries () {
    this.tries = 0
  }

  getJSON () {
    return {
      id: this.id,
      element: this.getElementName(),
      description: this.getDescription(),
      status: this.status,
      error: this.error,
      context: this.context,
      tries: this.tries
    }
  }

  protected abstract executeActionOnElement() : void

  async executeAction () {
    try {
      this.element = await waitForElement(this, this.uiElement) as HTMLElement
      this.element?.setAttribute('test-id', this.getElementName())
      await AutomationInstance.uiUtils.checkElement(this.element, this.getElementName())
      this.executeActionOnElement()
      await AutomationInstance.uiUtils.hideCheckElementContainer()
    } catch (e: any) {
      throw Error(e.message)
    }
  }

  resetAction () {
    this.element = null
    this.resetTries()
  }
}

export { ActionOnElement }
