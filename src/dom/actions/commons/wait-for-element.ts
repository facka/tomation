import { UIElement } from '../../../dsl/ui-element'
import { wait } from '../../../feedback/ui-utils'
import { logger } from '../../../feedback/logger'
import { AutomationInstance } from '../../../engine/runner'
import { ACTION_STATUS } from './action-status'
import { AbstractAction } from '../abstract-action'

const HTML_ELEMENT_REMOVED = null

type RetriableAction = AbstractAction & {
  updateTries: (tries: number) => void
}

const retry = async (
  currentAction: RetriableAction,
  uiElement: UIElement,
  parentElement: HTMLElement | null,
  delay = 1000,
  index = 0,
  maxTries = 10,
  untilRemoved = false
): Promise<HTMLElement | null> => {
  logger.log('Automation Status: ', AutomationInstance.status)
  if (AutomationInstance.isPaused) {
    return new Promise<HTMLElement | null>((resolve, reject) => {
      AutomationInstance.saveCurrentAction(async (action: AbstractAction) => {
        if (action.status == ACTION_STATUS.SKIPPED) {
          return resolve(null)
        }
        try {
          const response = await retry(action as RetriableAction, uiElement, parentElement, delay, index, maxTries, untilRemoved)
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

  logger.groupCollapsed(`tries ${index}/${maxTries}`)
  currentAction.updateTries(index)
  await AbstractAction.notifyActionUpdated(currentAction)

  if (index === maxTries) {
    logger.groupEnd()
    if (untilRemoved) {
      throw new Error(`[tomation] UI Element ${uiElement.getElementName() || 'UNKNOWN'} still present after 10 tries`)
    } else {
      throw new Error(`[tomation] UI Element ${uiElement.getElementName() || 'UNKNOWN'} not found after 10 tries`)
    }
  }

  const elem = uiElement.selector(parentElement, uiElement.postProcess)
  logger.groupEnd()

  if (elem) {
    if (untilRemoved) {
      await wait(delay)
      return await retry(currentAction, uiElement, parentElement, delay, ++index, maxTries, untilRemoved)
    }
    logger.log('Element found = ', elem)
    return elem
  }

  if (untilRemoved) {
    logger.log('Element removed.')
    return HTML_ELEMENT_REMOVED
  }

  await wait(delay)
  return await retry(currentAction, uiElement, parentElement, delay, ++index, maxTries, untilRemoved)
}

const waitForElement = async (
  currentAction: RetriableAction,
  uiElement: UIElement,
  delay: number = 1000,
  maxTries = 10,
  untilRemoved = false
): Promise<HTMLElement | null> => {
  const elementName = uiElement?.getElementName()
  logger.group('Looking for Element: ' + elementName)

  let parentElement: HTMLElement | null = null
  if (uiElement.parent) {
    try {
      logger.groupCollapsed('Look for Parent ', uiElement.parent.getElementName())
      parentElement = await waitForElement(currentAction, uiElement.parent, delay, maxTries, untilRemoved)
      logger.groupEnd()
    } catch (e: any) {
      logger.groupEnd()
      if (untilRemoved && e.message.includes('not found')) {
        logger.log('Parent not found, so element was removed')
        logger.groupEnd()
        return HTML_ELEMENT_REMOVED
      }
      logger.groupEnd()
      throw e
    }
  }

  try {
    logger.log('Using parent element: ', parentElement)
    const elem = await retry(currentAction, uiElement, parentElement, delay, 0, maxTries, untilRemoved)
    logger.groupEnd()
    return elem
  } catch (e: any) {
    if (untilRemoved && e.message.includes('not found')) {
      logger.log('Parent not found, so element was removed')
      logger.groupEnd()
      return HTML_ELEMENT_REMOVED
    }
    logger.groupEnd()
    throw e
  }
}

export { HTML_ELEMENT_REMOVED, waitForElement }
export type { RetriableAction }
