import { AutomationEvents, EVENT_NAMES, AutomationInstance } from "./automation";
import { UIElement } from "./ui-element-builder";
import { v4 as uuidv4 } from 'uuid';
import { wait } from "./ui-utils";

const HTML_ELEMENT_REMOVED = null

const retry = async (currentAction: ActionOnElement | WaitUntilElementRemovedAction, uiElement: UIElement, parentElement: HTMLElement | null, delay = 1000, index = 0, maxTries = 10, untilRemoved = false): Promise<HTMLElement | null > => {

  console.log('Automation Status: ', AutomationInstance.status)
  if (AutomationInstance.isPaused) {
    return new Promise<HTMLElement | null >((resolve, reject) => {
      AutomationInstance.saveCurrentAction(async (action: AbstractAction) => {
        if (action.status == ACTION_STATUS.SKIPPED) {
          return resolve(null)
        }
        try {
          const response = await retry(action as ActionOnElement | WaitUntilElementRemovedAction, uiElement, parentElement, delay, index, maxTries, untilRemoved)
          resolve(response)
        } catch (error: any) {
          reject(error)
        }
      }, currentAction)
    })
  }
  if (AutomationInstance.isStopped) {
    throw new Error('Test stopped manually')
  }
  console.groupCollapsed(`tries ${index}/${maxTries}`)
  if (currentAction) {
    currentAction.updateTries(index)
    await AbstractAction.notifyActionUpdated(currentAction)
  }
  if (index === maxTries) {
    console.groupEnd()
    if (untilRemoved) {
      throw new Error(`UI Element ${uiElement.getElementName() || 'UNKNOWN'} still present after 10 tries`)
    } else {
      throw new Error(`UI Element ${uiElement.getElementName() || 'UNKNOWN'} not found after 10 tries`)
    }
  } else {
    const elem = uiElement.selector(parentElement, uiElement.postProcess)
    console.groupEnd()
    if (elem) {
      if (untilRemoved) {
        await wait(delay)
        return await retry(currentAction, uiElement, parentElement, delay, ++index, maxTries, untilRemoved)
      } else {
        console.log('Element found = ', elem)
        return elem
      }
    } else {
      if (untilRemoved) {
        console.log('Element removed.')
        return HTML_ELEMENT_REMOVED
      } else {
        await wait(delay)
        return await retry(currentAction, uiElement, parentElement, delay, ++index, maxTries, untilRemoved)
      }
    }
  }
}

/**
   * 
   * @param uiElement
   * @param delay of each try. Defaults to 1 second
   */
const waitForElement = async (currentAction: ActionOnElement | WaitUntilElementRemovedAction, uiElement: UIElement, delay: number = 1000, maxTries = 10, untilRemoved = false): Promise<HTMLElement | null > => {
  const elementName = uiElement?.getElementName()
  console.group('Looking for Element: ' + elementName);

  let parentElement: HTMLElement | null = null
  if (uiElement.parent) {
    try {
      console.groupCollapsed('Look for Parent ', uiElement.parent.getElementName())
      parentElement = await waitForElement(currentAction, uiElement.parent, delay, maxTries, untilRemoved)
      console.groupEnd()
    } catch (e: any) {
      console.groupEnd() // Look for parent
      if (untilRemoved && e.message.includes('not found')) {
        console.log('Parent not found, so element was removed')
        console.groupEnd() // Look for element
        return HTML_ELEMENT_REMOVED // Parent was removed so it's ok to return success
      } else {
        console.groupEnd() // Look for element
        throw e
      }
    }    
  }
  try {
    console.log('Using parent element: ', parentElement)
    const elem = await retry(currentAction, uiElement, parentElement, delay, 0, maxTries, untilRemoved)
    console.groupEnd()
    return elem
  } catch (e: any) {
    if (untilRemoved && e.message.includes('not found')) {
      console.log('Parent not found, so element was removed')
      console.groupEnd() // Look for element
      return HTML_ELEMENT_REMOVED // Parent was removed so it's ok to return success
    } else {
      console.groupEnd() // Look for element
      throw e
    }
  }
}

interface ActionContext {
  url: string,
  beforeHTML: string,
  beforeInputValues: Object,
  afterHTML: string,
  afterInputValues: Object,
  startTimestamp: string,
  endTimestamp: string
}

enum ACTION_STATUS {
  WAITING = 'waiting',
  RUNNING = 'running',
  STOPPED = 'stopped',
  PAUSED = 'paused',
  SUCCESS = 'success',
  ERROR = 'error',
  SKIPPED = 'skipped',
}

abstract class AbstractAction {
  status: ACTION_STATUS
  error: string
  id: string
  context: ActionContext

  constructor () {
    this.status = ACTION_STATUS.WAITING
    this.error = ''
    this.id = uuidv4()
    this.context = {
      beforeHTML: '',
      beforeInputValues: {},
      afterInputValues: {},
      afterHTML: '',
      url: '',
      startTimestamp: '',
      endTimestamp: ''
    }
  }

  abstract getDescription() : string

  getJSON () {
    return {
      id: this.id,
      description: this.getDescription(),
      context: this.context,
      status: this.status,
      error: this.error
    }
  }

  protected abstract executeAction() : Promise<any>
  protected abstract resetAction() : void

  reset () {
    this.status = ACTION_STATUS.WAITING
    this.error = ''
    this.resetAction()
  }

  private getInputValuesFromPage() {
    const inputsMap: any = {}
    const inputs = AutomationInstance.document.querySelectorAll('input')
    inputs.forEach((input, index) => {
      const id = `value-id-${index}`
      input.setAttribute('input-id', id);
      inputsMap[id] = input.value
    })
    return inputsMap
  } 

  async execute () {
    try {
      this.status = ACTION_STATUS.RUNNING
      this.context.beforeInputValues = this.getInputValuesFromPage()
      this.context.beforeHTML = AutomationInstance.document.body.innerHTML
      await AbstractAction.notifyActionUpdated(this)
      console.log('Action: ', this.getDescription())
      await this.executeAction()
      this.status = ACTION_STATUS.SUCCESS
      this.error = ''
      if ( AutomationInstance.isStepByStepMode) {
        AutomationInstance.pause()
      }
    } catch (e: any) {
      this.status = ACTION_STATUS.ERROR
      this.error = e.message
      if (e.message == 'Test stopped manually') {
        throw Error('Error in Action ' + this.getDescription() + '. Message: ' + e.message)
      } else {
        this.status = ACTION_STATUS.PAUSED
        AutomationInstance.pause()
      }
    } finally {
      this.context.afterInputValues = this.getInputValuesFromPage()
      this.context.afterHTML = AutomationInstance.document.body.innerHTML
      await AbstractAction.notifyActionUpdated(this)
    }
  }

  static async notifyActionUpdated (action: AbstractAction) {
    AutomationEvents.dispatch(EVENT_NAMES.ACTION_UPDATE, {
      action: action.getJSON(),
    })
  }
}

class Action extends AbstractAction {
  name: string
  stepsFn: (params?: any) => void
  steps: Array<AbstractAction>
  params: any
  index: number

  constructor (name: string, steps: (params?: any) => void) {
    super()
    this.name = name
    this.stepsFn = steps
    this.steps = []
    this.index = 0
  }

  getDescription () {
    return this.name 
  }

  compileSteps () {
    super.reset()
    this.stepsFn(this.params)
  }

  stepsToJSON () {
    return this.steps.reduce((acc: Array<Object>, curr: AbstractAction) => {
      acc.push(curr.getJSON())
      return acc
    }, [])
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'Action',
      params: this.params,
      steps: this.stepsToJSON(),
    }
  }

  resetAction () {
    this.steps.length = 0
    this.index = 0
  }

  async continue () {
    if (AutomationInstance.isPaused) {
      return new Promise<void>((resolve, reject) => {
        AutomationInstance.saveCurrentAction(async (action: AbstractAction) => {
          if (action.status == ACTION_STATUS.SKIPPED) {
            return resolve()
          }
          try {
            await (action as Action).continue()
            resolve()
          } catch (error: any) {
            reject(error)
          }
        }, this)
      })
    }
    if (AutomationInstance.isStopped) {
      throw new Error('Test stopped manually')
    }
    if (this.index < this.steps.length) {
      const step = this.steps[this.index]
      try {
        await wait(AutomationInstance.speed)
        await step.execute()
        if (!AutomationInstance.isPaused) {
          this.index++
          await this.continue()
        } else {
          return new Promise<void>((resolve, reject) => {
            AutomationInstance.saveCurrentAction(async (action: AbstractAction) => {
              if (action.status == ACTION_STATUS.SKIPPED) {
                this.index++
                await AbstractAction.notifyActionUpdated(step)
                await this.continue()
                return resolve()
              }
              try {
                await (action as Action).continue()
                resolve()
              } catch (error: any) {
                reject(error)
              }
            }, step)
          })
        }
      } catch (e) {
        throw e
      }
    }
  }

  async executeAction () {
    this.index = 0
    await this.continue()
  }

  setParams (params?: any) {
    this.params = params
  }

  addStep (action: AbstractAction) {
    this.steps.push(action)
  }

}

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

  /**
   * 
   * @param uiElement
   * @param delay of each try. Defaults to 1 second
   */
  static waitForElement (currentAction: ActionOnElement, uiElement: UIElement, delay: number = 1000, maxTries = 10, untilRemoved = false): Promise<HTMLElement | null > {
    const elementName = uiElement.getElementName()
    return new Promise(async (resolve, reject) => {
      
      // retry function 
      const retry = async (parentElement: HTMLElement | null, delay = 1000, index = 0, untilRemoved = false): Promise<HTMLElement | null > => {
        console.groupCollapsed(`tries ${index}/${maxTries}`)
        currentAction.updateTries(index)
        await AbstractAction.notifyActionUpdated(currentAction)
        if (index === maxTries) {
          console.groupEnd()
          if (untilRemoved) {
            throw new Error(`UI Element ${elementName || 'UNKNOWN'} still present after 10 tries`)
          } else {
            throw new Error(`UI Element ${elementName || 'UNKNOWN'} not found after 10 tries`)
          }
        } else {
          const elem = uiElement.selector(parentElement, uiElement.postProcess)
          console.groupEnd()
          if (elem) {
            if (untilRemoved) {
              await wait(delay)
              return await retry(parentElement, delay, ++index, untilRemoved)
            } else {
              console.log('Element found = ', elem)
              return elem
            }
          } else {
            if (untilRemoved) {
              console.log('Element removed.')
              return null
            } else {
              await wait(delay)
              return await retry(parentElement, delay, ++index, untilRemoved)
            }
          }
        }
      }

      console.group('[Action On Element] Looking for Element: ' + elementName);

      let parentElement: HTMLElement | null = null
      let parentSuccess = true
      if (uiElement.parent) {
        console.groupCollapsed('Look for Parent ', uiElement.parent.getElementName())
        try {
          parentElement = await ActionOnElement.waitForElement(currentAction, uiElement.parent, delay, maxTries, untilRemoved)
        } catch (e) {
          parentSuccess = false
        } finally {
          console.groupEnd()
        }
      }
      if (parentSuccess) {
        console.log('using parent element: ', parentElement)
        try {
          const elem = await retry(parentElement, delay, 0, untilRemoved)
          console.groupEnd()
          resolve(elem)
        } catch (e: any) {
          console.groupEnd()
          reject(new Error(e.message))
        }
      } else {
        console.groupEnd()
        reject(new Error(`Parent ${uiElement.parent?.getElementName()} of UI Element ${uiElement.name || 'UNKNOWN'} not found`))
      }
    })
  }

  async executeAction () {
    try {
      this.element = await waitForElement(this, this.uiElement) as HTMLElement
      this.element?.setAttribute("test-id", this.getElementName());
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

class AssertNotExistsAction extends ActionOnElement {

  constructor (uiElement: UIElement) {
    super(uiElement)
  }

  async executeAction () {
    try {
      this.element = await waitForElement(this, this.uiElement, 1000, 5, true) as HTMLElement
      this.element?.setAttribute("test-id", this.getElementName());
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

class SelectAction extends ActionOnElement {
  value: string

  constructor (uiElement: UIElement, value: string) {
    super(uiElement)
    this.value = value
  }

  protected executeActionOnElement () {
    let inputElem = this.element as HTMLInputElement
    if (this.element?.tagName !== 'INPUT' && this.element?.tagName !== 'SELECT' && this.element?.tagName !== 'TEXTAREA') {
      inputElem = this.element?.querySelectorAll('input')[0] as HTMLInputElement
      if (!inputElem) {
        throw new Error('Input element not found. Not able to type value in element ' + this.getElementName())
      }
    } // allows to type in wrapper elements which contain input elem
    inputElem.value = this.value
    inputElem.dispatchEvent(new Event('change'));
  }

  getDescription () {
    return `Select value '${this.value}' in ${this.getElementName()}`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'Select',
      value: this.value,
    }
  }
}

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
    } // allows to type in wrapper elements which contain input elem
    inputElem.value = this.value

    inputElem.dispatchEvent(new Event('change'));
    inputElem.dispatchEvent(new Event('keyup', { bubbles: true }));
    inputElem.dispatchEvent(new Event('input', { bubbles: true }));
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

class TypePasswordAction extends ActionOnElement {
  value: string

  constructor (uiElement: UIElement, value: string) {
    super(uiElement)
    this.value = value
  }

  protected executeActionOnElement () {
    let inputElem = this.element as HTMLInputElement
    if (this.element?.tagName !== 'INPUT' && this.element?.tagName !== 'SELECT' && this.element?.tagName !== 'TEXTAREA') {
      inputElem = this.element?.querySelectorAll('input')[0] as HTMLInputElement
      if (!inputElem) {
        throw new Error('Input element not found. Not able to type value in element ' + this.getElementName())
      }
    } // allows to type in wrapper elements which contain input elem
    inputElem.value = this.value
    inputElem.dispatchEvent(new Event('change'));
    inputElem.dispatchEvent(new Event('keyup', { bubbles: true }));
    inputElem.dispatchEvent(new Event('input', { bubbles: true }));
  }

  getDescription () {
    return `Type a password in ${this.getElementName()}`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'TypePassword',
      value: this.value,
    }
  }
}

class PressEscKeyAction extends ActionOnElement {
  constructor (uiElement: UIElement) {
    super(uiElement)
  }

  protected executeActionOnElement () {
    this.element?.dispatchEvent(
      new KeyboardEvent("keydown", {
        altKey: false,
        code: "Escape",
        ctrlKey: false,
        isComposing: false,
        key: "Escape",
        location: 0,
        metaKey: false,
        repeat: false,
        shiftKey: false,
        which: 27,
        charCode: 0,
        keyCode: 27,
      })
    )
  }

  getDescription () {
    return `Press Esc key in ${this.getElementName()}`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'PressEscKey',
    }
  }
}

class PressDownKeyAction extends ActionOnElement {
  constructor (uiElement: UIElement) {
    super(uiElement)
  }

  protected executeActionOnElement () {
    this.element?.dispatchEvent(
      new KeyboardEvent("keyup", {
        altKey: false,
        code: "Down",
        ctrlKey: false,
        isComposing: false,
        key: "Down",
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

class PressTabKeyAction extends ActionOnElement {
  constructor (uiElement: UIElement) {
    super(uiElement)
  }

  protected executeActionOnElement () {
    this.element?.dispatchEvent(
      new KeyboardEvent("keydown", {
        altKey: false,
        code: "Tab",
        ctrlKey: false,
        isComposing: false,
        key: "Tab",
        location: 0,
        metaKey: false,
        repeat: false,
        shiftKey: false,
        which: 9,
        charCode: 0,
        keyCode: 9,
      })
    )
  }

  getDescription () {
    return `Press Tab key in ${this.getElementName()}`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'PressTabKey',
    }
  }
}

class PressEnterKeyAction extends ActionOnElement {
  constructor (uiElement: UIElement) {
    super(uiElement)
  }

  protected executeActionOnElement () {
    this.element?.dispatchEvent(
      new KeyboardEvent("keydown", {
        altKey: false,
        code: "Enter",
        ctrlKey: false,
        isComposing: false,
        key: "Enter",
        location: 0,
        metaKey: false,
        repeat: false,
        shiftKey: false,
        which: 13,
        charCode: 0,
        keyCode: 13,
      })
    )
  }

  getDescription () {
    return `Press Enter key in ${this.getElementName()}`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'PressEnterKey',
    }
  }
}

enum KEY_MAP {
  ESCAPE = 'Escape',
  ENTER = 'Enter',
  TAB = 'Tab',
  ARROW_DOWN = 'ArrowDown',
  ARROW_UP = 'ArrowUp',
  ARROW_LEFT = 'ArrowLeft',
  ARROW_RIGHT = 'ArrowRight',
  BACKSPACE = 'Backspace',
  DELETE = 'Delete',
  SHIFT = 'Shift',
  CONTROL = 'Control',
  ALT = 'Alt',
  META = 'Meta',
}

const KEY_CODES: Record<KEY_MAP, number> = {
  [KEY_MAP.ESCAPE]: 27,
  [KEY_MAP.ENTER]: 13,
  [KEY_MAP.TAB]: 9,
  [KEY_MAP.ARROW_DOWN]: 40,
  [KEY_MAP.ARROW_UP]: 38,
  [KEY_MAP.ARROW_LEFT]: 37,
  [KEY_MAP.ARROW_RIGHT]: 39,
  [KEY_MAP.BACKSPACE]: 8,
  [KEY_MAP.DELETE]: 46,
  [KEY_MAP.SHIFT]: 16,
  [KEY_MAP.CONTROL]: 17,
  [KEY_MAP.ALT]: 18,
  [KEY_MAP.META]: 91,
}

class PressKeyAction extends ActionOnElement {
  key: KEY_MAP

  constructor (uiElement: UIElement, key: KEY_MAP) {
    super(uiElement)
    this.key = key
  }

  protected executeActionOnElement () {
    this.element?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: this.key,
        code: this.key,
        keyCode: KEY_CODES[this.key],
        charCode: 0,
        which: KEY_CODES[this.key],
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        isComposing: false,
        location: 0,
        repeat: false,
      })
    )
  }

  getDescription () {
    return `Press ${this.key} key in ${this.getElementName()}`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'PressKey',
      key: this.key,
    }
  }
}

class UploadFileAction extends ActionOnElement {
  file: File

  constructor (uiElement: UIElement, file: File) {
    super(uiElement)
    this.file = file
  }

  protected executeActionOnElement(): void {
    const fileInput = this.element as HTMLInputElement

    
    // Create a data transfer object. Similar to what you get from a `drop` event as `event.dataTransfer`
    const dataTransfer = new DataTransfer();
    
    // Add your file to the file list of the object
    dataTransfer.items.add(this.file);
    
    // Save the file list to a new variable
    const fileList = dataTransfer.files;
    
    // Set your input `files` to the file list
    fileInput.files = fileList;
    fileInput.dispatchEvent(new Event('change'));

    function getParentForm (elem: HTMLElement): HTMLFormElement | null {
      if (elem?.parentElement) {
        if (elem.parentElement?.tagName.toLowerCase() === 'form') {
          return elem.parentElement as HTMLFormElement
        } else {
          return getParentForm(elem.parentElement)
        }
      } else {
        return null
      }
    }
    const form = getParentForm(fileInput)
    if (form) {
      form.dispatchEvent(new Event('change'))
    }
  }

  getDescription () {
    return `Upload file in ${this.getElementName()}`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'UploadFile',
    }
  }
}

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
    } // allows to type in wrapper elements which contain input elem
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

class WaitAction extends AbstractAction {
  miliseconds: number

  constructor (miliseconds: number) {
    super()
    this.miliseconds = miliseconds
  }

  getDescription () {
    return 'Wait ' + this.miliseconds + ' miliseconds'
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'Wait',
    }
  }

  async executeAction () {
    await wait(this.miliseconds)
  }

  resetAction () {
    // nothing to do
  }
}

class WaitUntilElementRemovedAction extends AbstractAction {
  uiElement: UIElement
  tries: number

  constructor (uiElement: UIElement) {
    super()
    this.uiElement = uiElement
    this.tries = 0
  }

  updateTries (tries: number) {
    this.tries = tries
  }
  
  resetAction () {
    this.tries = 0
  }

  getElementName () {
    return this.uiElement?.getElementName()
  }

  protected async executeAction () {
    await waitForElement(this, this.uiElement, 1000, 10, true) as HTMLElement
  }

  getDescription () {
    return 'Wait until ' + this.getElementName() + ' is removed'
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'WaitUntilElementRemoved',
    }
  }
}

class PauseAction extends AbstractAction {

  constructor () {
    super()
  }

  getDescription () {
    return 'Paused'
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'Pause',
    }
  }

  async executeAction () {
    await AutomationInstance.pause()
  }

  resetAction () {
    // nothing to do
  }
}

class ManualAction extends AbstractAction {
  description: string

  constructor (description: string) {
    super()
    this.description = description
  }

  getDescription () {
    return 'Manual Step: ' + this.description
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'ManualStep',
    }
  }

  async executeAction () {
    await AutomationInstance.uiUtils.showAlert('Waiting manual step...')
    return new Promise((resolve, reject) => {
      AutomationEvents.on(EVENT_NAMES.USER_ACCEPT, async () => {
        await AutomationInstance.uiUtils.hideAlert()
        return resolve(true)
      })
      AutomationEvents.on(EVENT_NAMES.USER_REJECT, async () => {
        await AutomationInstance.uiUtils.hideAlert()
        return reject()
      })
    })
  }
  
  resetAction () {
    // nothing to do
  }
}

class ReloadPageAction extends AbstractAction {

  constructor () {
    super()
  }

  getDescription () {
    return 'Reload page'
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'ReloadPage',
    }
  }

  async executeAction () {
    await location.reload()
  }

  resetAction () {
    // nothing to do
  }
}

export {
  AbstractAction,
  Action,
  ActionOnElement,
  ClickAction,
  SelectAction,
  TypeAction,
  TypePasswordAction,
  PressEscKeyAction,
  PressDownKeyAction,
  PressTabKeyAction,
  PressKeyAction,
  KEY_MAP,
  PressEnterKeyAction,
  UploadFileAction,
  AssertTextIsAction,
  AssertContainsTextAction,
  AssertValueIsAction,
  AssertExistsAction,
  AssertNotExistsAction,
  SaveValueAction,
  WaitAction,
  WaitUntilElementRemovedAction,
  PauseAction,
  ManualAction,
  ReloadPageAction,
  ACTION_STATUS,
}