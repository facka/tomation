import { UIElement } from '../../dsl/ui-element'
import { ActionOnElement } from './action-on-element'

class UploadFileAction extends ActionOnElement {
  file: File

  constructor (uiElement: UIElement, file: File) {
    super(uiElement)
    this.file = file
  }

  protected executeActionOnElement(): void {
    const fileInput = this.element as HTMLInputElement

    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(this.file)
    const fileList = dataTransfer.files

    fileInput.files = fileList
    fileInput.dispatchEvent(new Event('change'))

    function getParentForm (elem: HTMLElement): HTMLFormElement | null {
      if (elem?.parentElement) {
        if (elem.parentElement?.tagName.toLowerCase() === 'form') {
          return elem.parentElement as HTMLFormElement
        }
        return getParentForm(elem.parentElement)
      }
      return null
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

export { UploadFileAction }
