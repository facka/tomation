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

export {
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
  setFilterLogs,
}