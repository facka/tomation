import { Action } from "~/dom/actions"
import { AutomationEvents, EVENT_NAMES } from "~/engine/events"
import { AutomationInstance } from '~/engine/runner'
import { logger } from '../feedback/logger';

const Test = (testId: string, steps: () => void) => {
  logger.log(`Registering Test: ${testId}...`)
  const action = new Action(testId, steps)
  // AutomationCompiler.init(action)
  // logger.log(`Compiled Test: ${testId}`)
  // AutomationEvents.dispatch(EVENT_NAMES.REGISTER_TEST, { id: testId, action: action.getJSON() }) // Comment 
  AutomationEvents.dispatch(EVENT_NAMES.REGISTER_TEST, { id: testId }) // Send only id to simplify test registration
  logger.log(`Registered Test: ${testId}`)
  if (!AutomationInstance) {
    throw new Error('[tomation] Automation Setup not executed. Unable to register test.')
  }
  AutomationInstance.setInitialAction(testId, action)
}

export { Test }
