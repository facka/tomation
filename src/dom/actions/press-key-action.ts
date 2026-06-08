import { UIElement } from '../../dsl/ui-element'
import { ActionOnElement } from './action-on-element'
import { KEY_CODES, KEY_MAP, KEY_OPTIONS, KEY_OPTION_LABELS, getCharCodeFromKey } from './commons/keyboard'

class PressKeyAction extends ActionOnElement {
  key: KEY_MAP
  options: KEY_OPTIONS[]

  constructor (uiElement: UIElement, key: KEY_MAP, options: KEY_OPTIONS[] = []) {
    super(uiElement)
    this.key = key
    this.options = options
  }

  protected executeActionOnElement () {
    const hasOption = (option: KEY_OPTIONS) => this.options.includes(option)
    const charCode = getCharCodeFromKey(this.key)
    this.element?.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: this.key,
        code: this.key,
        keyCode: KEY_CODES[this.key],
        charCode,
        which: KEY_CODES[this.key],
        altKey: hasOption(KEY_OPTIONS.ALT),
        ctrlKey: hasOption(KEY_OPTIONS.CTRL),
        metaKey: hasOption(KEY_OPTIONS.META),
        shiftKey: hasOption(KEY_OPTIONS.SHIFT),
        isComposing: false,
        location: 0,
        repeat: false,
      })
    )
  }

  getDescription () {
    const pressedOptions = this.options
      .map((option: KEY_OPTIONS) => KEY_OPTION_LABELS[option])
      .join(' + ')
    const optionsDescription = pressedOptions ? ` + ${pressedOptions}` : ''
    return `Press ${this.key} key${optionsDescription} in ${this.getElementName()}`
  }

  getJSON () {
    return {
      ...super.getJSON(),
      type: 'PressKey',
      key: this.key,
      options: this.options,
    }
  }
}

export { PressKeyAction }
