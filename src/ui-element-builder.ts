class UIElement {
  name: string
  selector: (parent?: HTMLElement | null,  postProcessFn?: (elem: HTMLElement) => (HTMLElement | null)) => HTMLElement | null
  parent: UIElement | null
  postProcess?: ((elem: HTMLElement) => (HTMLElement | null))

  constructor (name: string, selector: () => HTMLElement | null, parent?: UIElement | null, postProcessFn?: (elem: HTMLElement) => (HTMLElement | null)) {
    this.name = name
    this.selector = selector
    this.parent = parent || null
    this.postProcess = postProcessFn
  }

  getElementName (): string {
    let parent = ''
    if (this.parent) {
      parent = ' in ' + this.parent.getElementName()
    }
    return `${this.name}${parent}`
  }
}

let document: Document

const setDocument = (doc: Document) => {
  document = doc
}

const SelectorBuilder = (query: string, filterFn?: (value: HTMLElement, index: number, array: readonly HTMLElement[]) => Boolean) => {
  const selector = (root = document, postProcess?: (elem: HTMLElement) => HTMLElement) => {
    root = root || document
    console.log('Searching elem from Root = ', root)
    const elementsFound: HTMLElement[] = []
    root.querySelectorAll<HTMLElement>(query).forEach((e: HTMLElement) => {
      if (e.style.display !== 'none' ) {
        elementsFound.push(e)
      }
    })
    let elemFound
    if (filterFn) {
      console.log('Applying filter ', filterFn)
      console.log('  -- to ' + elementsFound.length + 'elements: ', elementsFound)
      elemFound = elementsFound.filter((elem: HTMLElement, index: number, array: HTMLElement[]) => {
        console.log('Apply filter to item ' + index + ': ', elem)
        const match = filterFn(elem, index, array)
        console.log(`  -> Item ${index} ${ match ? 'Match' : 'Discarded'}`)
        return match
      })[0]
    } else {
      elemFound = elementsFound[0]
    }
    if (elemFound && postProcess) {
      console.log('Apply post process to = ', elemFound)
      elemFound = postProcess(elemFound)
    }
    console.log('Return elem = ', elemFound)
    return elemFound
  }
  return selector
}

const selectorIdentifier = (selector: any, parent: UIElement | null, postProcessFn?: (elem: HTMLElement) => (HTMLElement | null)) => ({
  /**
   * Sets the UI element identifier
   * @param uiElementId 
   * @returns 
   */
  as: (uiElementId: string) => {
    return new UIElement(uiElementId, selector, parent, postProcessFn)
  }
})

const postProcessResponse = (selector: any, parent: UIElement | null) => ({
  ...selectorIdentifier(selector, parent),
  /**
   * Tansform the UI element that will be returned
   * @param postProcessFn 
   * @returns 
   */
  postProcess: (postProcessFn: (elem: HTMLElement) => (HTMLElement | null)) => ({
    ...selectorIdentifier(selector, parent, postProcessFn)
  })
})

const selectorFilterResponse = (selector: any) => ({
  ...selectorIdentifier(selector, null),
  childOf: (parent: UIElement) => ({
    ...postProcessResponse(selector, parent)
  }),
  /**
   * Tansform the UI element that will be returned
   * @param postProcessFn 
   * @returns 
   */
  postProcess: (postProcessFn: (elem: HTMLElement) => (HTMLElement | null)) => ({
    ...selectorIdentifier(selector, null, postProcessFn)
  })
})

const selectorFilter = (query: string) => {
  return {
    where: (filterFn?: (value: HTMLElement, index: number, array: readonly HTMLElement[]) => Boolean) => {
      return selectorFilterResponse(SelectorBuilder(query, filterFn))
    }
  }
}

const DIV = selectorFilter('div')

const BUTTON = selectorFilter('button')

const INPUT = selectorFilter('input')

const TEXTAREA = selectorFilter('textarea')

const identifiedBy = (id: string) => {
  return selectorFilterResponse(SelectorBuilder('#'+id))
}

const ELEMENT = (htmlTag: string) => {
  return selectorFilter(htmlTag)
}

let enableFilterLogs = false

const setFilterLogs = (enabled: boolean) => {
  enableFilterLogs = enabled
}

const filterLog = (...args: any[]) => {
  if (enableFilterLogs) {
    console.log('[UIElement Filter]', ...args)
  }
}

const classIs = (className: string) => {
  return (elem: HTMLElement) => {
    const result = elem.className == className
    filterLog(`classIs('${className}') on`, elem, '=>', result)
    return result
  }
}

const classIncludes = (className: string) => {
  return (elem: HTMLElement) => {
    const result = elem.className.split(' ').includes(className)
    filterLog(`classIncludes('${className}') on`, elem, '=>', result)
    return result
  }
}

const innerTextIs = (text: string) => {
  return (elem: HTMLElement) => {
    const result = elem.textContent?.trim() == text
    filterLog(`innerTextIs('${text}') on`, elem, '=>', result)
    return result
  }
}

const innerTextContains = (text: string) => {
  return (elem: HTMLElement) => {
    const result = elem.innerText.trim().includes(text)
    filterLog(`innerTextContains('${text}') on`, elem, '=>', result)
    return result
  }
}

const titleIs = (text: string) => {
  return (elem: HTMLElement) => {
    const result = elem.title == text
    filterLog(`titleIs('${text}') on`, elem, '=>', result)
    return result
  }
}

const placeholderIs = (text: string) => {
  return (elem: HTMLElement) => {
    const result = (elem as HTMLInputElement).placeholder === text
    filterLog(`placeholderIs('${text}') on`, elem, '=>', result)
    return result
  }
}

const isFirstElement = () => {
  return (elem: HTMLElement, index: number) => {
    const result = index === 0
    filterLog('isFirstElement on', elem, 'index', index, '=>', result)
    return result
  }
}

const elementIndexIs = (index: number) => {
  return (elem: HTMLElement, elemIndex: number) => {
    const result = elemIndex === index
    filterLog(`elementIndexIs(${index}) on`, elem, 'elemIndex', elemIndex, '=>', result)
    return result
  }
}

const firstChildTextIs = (text: string) => {
  return (elem: HTMLElement) => {
    const result = (elem?.firstChild as HTMLInputElement).innerText.trim() === text
    filterLog(`firstChildTextIs('${text}') on`, elem, '=>', result)
    return result
  }
}

const and = (conditions: any[]) => {
  return (elem: HTMLElement, elemIndex: number) => {
    const response = conditions.every((condition, i) => {
      const condResult = condition(elem, elemIndex)
      filterLog(`and condition[${i}] on`, elem, 'elemIndex', elemIndex, '=>', condResult)
      return condResult
    })
    filterLog('and final result on', elem, 'elemIndex', elemIndex, '=>', response)
    return response
  }
}

const is = {
  DIV,
  BUTTON,
  INPUT,
  TEXTAREA,
  ELEMENT,
  identifiedBy,
}

export {
  setDocument,
  UIElement,
  SelectorBuilder,
  is,
  classIs,
  classIncludes,
  innerTextIs,
  innerTextContains,
  titleIs,
  placeholderIs,
  isFirstElement,
  elementIndexIs,
  firstChildTextIs,
  and,
  setFilterLogs
}