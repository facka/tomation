import { AutomationInstance } from "../engine/runner";

const wait = (timeout = 2000) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(null)
    }, timeout)
  })
}

const updateStyle = (elem: HTMLElement, props: any) => {
  const propsList = Object.entries(props).map(([key, value]) => ({
    key,
    value
  }))
  propsList.forEach((styleItem: any) => {
    const {key, value} = styleItem
    elem.style[key] = value
  })
}

type ElementProps = {
    id: string,
    styles?: any,
    parent: HTMLElement
}

type HTMLTags = 'DIV'

class UIUtils {
  window: Window
  document: Document
  devToolsMessageContainer: HTMLElement
  devToolsCheckElementContainer: HTMLElement
  darkLayerLeft: HTMLElement
  darkLayerTop: HTMLElement
  darkLayerRight: HTMLElement
  darkLayerBottom: HTMLElement
  currentCheckElem: HTMLElement
  contextViewerContainer: HTMLElement
  devToolsAlertContainer: HTMLElement

  constructor (window: Window) {
    this.document = window.document
    this.window = window
    this.devToolsMessageContainer = this.createElement('DIV', {
      id: 'dev-tools-message-container',
      styles: {
        width: '500px',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        color: 'white',
        position: 'fixed',
        bottom: '10px',
        right: '10px',
        fontFamily: 'monospace',
        zIndex: '9999',
      },
      parent: this.document.body
    })

    this.devToolsAlertContainer = this.createElement('DIV', {
      id: 'dev-tools-alert-container',
      styles: {
        width: '100%',
        height: '30px',
        backgroundColor: '#b00',
        color: 'white',
        position: 'absolute ',
        top: 0,
        fontFamily: 'monospace',
        zIndex: '9999',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '5px',
      },
      parent: this.document.body
    })

    this.devToolsCheckElementContainer = this.createElement('DIV', {
      id: 'dev-tools-check-element-container',
      styles: {
        width:'100%',
        height: this.document.body.clientHeight+'px',
        position: 'absolute',
        top: '0px',
        left: '0px',
        zIndex: '9990',
        display: 'none',
        opacity: '0',
        transition: 'opacity .2s',
      },
      parent: this.document.body
    })

    const darkLayerStyle = {
      zIndex: '9991',
      backgroundColor: 'rgba(0,0,0,0.3)',
      position: 'absolute',
    }
    
    this.darkLayerLeft = this.createElement('DIV', {
      id: 'dark-layer-left',
      styles: darkLayerStyle,
      parent: this.devToolsCheckElementContainer,
    })
    this.darkLayerTop = this.createElement('DIV', {
      id: 'dark-layer-top',
      styles: darkLayerStyle,
      parent: this.devToolsCheckElementContainer,
    })
    this.darkLayerRight = this.createElement('DIV', {
      id: 'dark-layer-right',
      styles: darkLayerStyle,
      parent: this.devToolsCheckElementContainer,
    })
    this.darkLayerBottom = this.createElement('DIV', {
      id: 'dark-layer-bottom',
      styles: darkLayerStyle,
      parent: this.devToolsCheckElementContainer,
    })
    this.currentCheckElem = this.createElement('DIV', {
      id: 'current-check-elem',
      parent: this.devToolsCheckElementContainer,
    })

    this.contextViewerContainer = this.createElement('DIV', {
      id: 'context-viewer-container',
      styles: {
        width: '100%',
        height: this.document.body.clientHeight+'px',
        position: 'absolute',
        top: '0px',
        left: '0px',
        zIndex: '10000',
        display: 'none',
      },
      parent: this.document.body
    })
  }

  private createElement (tagName: HTMLTags, props?: ElementProps) {
    const elem = this.document.createElement(tagName)
    if (props) {
      if (props.id) elem.id = props?.id
      if (props.styles) updateStyle(elem, props.styles)
      if (props.parent) props.parent.appendChild(elem)
    }
    return elem
  }

  /**
   * 
   * @param message @deprecated
   */
  async logAction (message: string) {
    const messageElem = AutomationInstance.document.createElement('DIV')
    messageElem.innerText = message
    updateStyle(messageElem, {
      padding: '3px 10px',
      opacity: '1',
      transition: 'opacity 1s',
    })
    this.devToolsMessageContainer.appendChild(messageElem)
    await wait(4000)
    messageElem.style.opacity = '0'
    await wait(4000)
    this.devToolsMessageContainer.removeChild(messageElem)
    await wait(1000)
  }

  async checkElement (elem: HTMLElement, name: string) {
    if (!elem) return
    const rect = elem.getBoundingClientRect()
    const bodyBundingRect = this.document.body.getBoundingClientRect()
  
    this.darkLayerLeft.style.left = '0px'
    this.darkLayerLeft.style.top = rect.top+'px'
    this.darkLayerLeft.style.width = (this.window.scrollX+rect.left)+'px'
    this.darkLayerLeft.style.height = rect.height+'px'
  
    this.darkLayerTop.style.left = this.window.scrollX+'px'
    this.darkLayerTop.style.top = '0px'
    this.darkLayerTop.style.width = '100%'
    this.darkLayerTop.style.height = (rect.top)+'px'
  
    this.darkLayerRight.style.left = (this.window.scrollX+rect.left+rect.width)+'px'
    this.darkLayerRight.style.top = rect.top+'px'
    this.darkLayerRight.style.width = (bodyBundingRect.width - (rect.left + rect.width))+'px'
    this.darkLayerRight.style.height = rect.height+'px'
  
    this.darkLayerBottom.style.left = this.window.scrollX+'px'
    this.darkLayerBottom.style.top = (rect.top+rect.height)+'px'
    this.darkLayerBottom.style.width = '100%'
    this.darkLayerBottom.style.height = (bodyBundingRect.height - (rect.top + rect.height))+'px'
  
    this.currentCheckElem.id = `dev-tools-current-check-elem-${name}`
    this.currentCheckElem.style.top = rect.top+'px'
    this.currentCheckElem.style.left = (this.window.scrollX+rect.left)+'px'
    this.currentCheckElem.style.height = rect.height+'px'
    this.currentCheckElem.style.width = rect.width+'px'
    this.currentCheckElem.style.boxShadow = '0px 0px 5px 2px lightgreen'
    this.currentCheckElem.style.position = 'absolute'
    this.currentCheckElem.style.zIndex = '9992'
    
    this.devToolsCheckElementContainer.style.display = 'block'
    this.devToolsCheckElementContainer.style.opacity = '1'
    await wait(200)
  }

  async showAlert (message: string) {
    const messageElem = AutomationInstance.document.createElement('DIV')
    const body = AutomationInstance.document.body
    messageElem.innerText = message
    updateStyle(body, {
      paddingTop: '30px',
    })
    updateStyle(this.devToolsAlertContainer, {
      display: 'flex',
    })
    this.devToolsAlertContainer.appendChild(messageElem)
  }

  async hideAlert () {
    updateStyle(this.devToolsAlertContainer, {
      display: 'none',
    })
    const body = AutomationInstance.document.body
    updateStyle(body, {
      paddingTop: '0',
    })
    if (this.devToolsAlertContainer.firstChild) {
      this.devToolsAlertContainer.removeChild(this.devToolsAlertContainer.firstChild)
    }
  }

  async hideCheckElementContainer () {
    this.devToolsCheckElementContainer.style.opacity = '0'
    await wait(200)
    this.devToolsCheckElementContainer.style.display = 'none'
  }

  displayContext(context: any) {
    updateStyle(this.contextViewerContainer, {
      display: 'flex',
      'background-color': 'white',
      'position': 'absolute',
      'top': '0px',
      'left': '0px',
      'z-index': '9999',
    })
    const contextViewerBefore = this.document.createElement('DIV')
    contextViewerBefore.id = 'context-viewer-before'
    updateStyle(contextViewerBefore, {
      flex: '50%',
      width: '100%',
      height: 'auto',
      border: '2px solid orange',
    })
    const contextViewerAfter = this.document.createElement('DIV')
    contextViewerAfter.id = 'context-viewer-after'
    updateStyle(contextViewerAfter, {
      flex: '50%',
      width: '100%',
      height: 'auto',
      border: '2px solid green'
    })
    const beforeHTML = this.document.createElement('DIV')
    beforeHTML.innerHTML = context.beforeHTML
    setInputValues(beforeHTML, context.beforeInputValues)
    const afterHTML = this.document.createElement('DIV')
    afterHTML.innerHTML = context.afterHTML
    setInputValues(afterHTML, context.afterInputValues)
    this.contextViewerContainer.appendChild(contextViewerBefore)
    contextViewerBefore.appendChild(beforeHTML)
    setTimeout(() => {
      this.contextViewerContainer.removeChild(contextViewerBefore)
      this.contextViewerContainer.appendChild(contextViewerAfter)
      contextViewerAfter.appendChild(afterHTML)
      setTimeout(() => {
        this.contextViewerContainer.removeChild(contextViewerAfter)
        updateStyle(this.contextViewerContainer, {display: 'none'})
      }, 2000)
    }, 2000)
  }
} 


const setInputValues = (html: HTMLElement, valuesMap: any) => {
  html.querySelectorAll('input').forEach((input: HTMLInputElement) => {
    const id = input.getAttribute('input-id') || ''
    input.value = valuesMap[id]
  })
}

export {
  wait,
  UIUtils
}
