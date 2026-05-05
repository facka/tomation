import { Action } from "~/dom/actions"
import { AutomationCompiler } from "~/engine/compiler"
import { AutomationEvents, EVENT_NAMES } from "~/engine/events"
import { AutomationRunner } from "~/engine/runner"
import { logger } from '../feedback/logger';

const TestsMap: any = {}

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
  AutomationCompiler.init(action)
  logger.log(`Compiled Test: ${id}`)
  AutomationEvents.dispatch(EVENT_NAMES.REGISTER_TEST, { id, action: action.getJSON() })
  logger.log(`Registered Test: ${id} in TestsMap`)
  TestsMap[id] = () => {
    AutomationRunner.start(action)
  }
}

export { Test, RunTest, TestsMap }
