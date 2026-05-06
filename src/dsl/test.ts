import { Action } from "~/dom/actions"
import { AutomationCompiler } from "~/engine/compiler"
import { AutomationEvents, EVENT_NAMES } from "~/engine/events"
import { AutomationRunner } from "~/engine/runner"
import { logger } from '../feedback/logger';

const TestsMap: any = {}

const InitialActionByTestId: any = {}

const RunTest = (id: string) => {
  if (!TestsMap[id]) {
    logger.log('Available Tests:', Object.keys(TestsMap))
    throw new Error(`[tomation] Test with id ${id} not found.`)
  } else {
    TestsMap[id]()
  }
}

const Test = (id: string, steps: () => void) => {
  logger.log(`Registering Test: ${id}...`)
  const action = new Action(id, steps)
  // AutomationCompiler.init(action)
  // logger.log(`Compiled Test: ${id}`)
  // AutomationEvents.dispatch(EVENT_NAMES.REGISTER_TEST, { id, action: action.getJSON() }) // Comment 
  AutomationEvents.dispatch(EVENT_NAMES.REGISTER_TEST, { id }) // Send only id to simplify test registration
  logger.log(`Registered Test: ${id} in TestsMap`)
  TestsMap[id] = () => {
    const action = InitialActionByTestId[id]
    AutomationCompiler.init(action)
    logger.log(`Compiled Test: ${id}`)
    AutomationRunner.start(action)
  }
  InitialActionByTestId[id] = action
}

const compileTest = (id: string): any => {
  const action = InitialActionByTestId[id]
  if (!action) {
    logger.log('Available Tests:', Object.keys(InitialActionByTestId))
    throw new Error(`[tomation] Test with id ${id} not found for compilation.`)
  }
  AutomationCompiler.init(action)
  return action.getJSON()
}

export { Test, RunTest, TestsMap, InitialActionByTestId, compileTest }
