import { Action } from "~/dom/actions"
import { AutomationCompiler } from "~/engine/compiler"
import { AutomationEvents, EVENT_NAMES } from "~/engine/events"
import { AutomationRunner } from "~/engine/runner"

const TestsMap: any = {}

const RunTest = (id: string) => {
  if (!TestsMap[id]) {
    console.log('Available Tests:', Object.keys(TestsMap))
    throw new Error(`Test with id ${id} not found.`)
  } else {
    TestsMap[id]()
  }
}

const Test = (id: string, steps: () => void) => {
  console.log(`Registering Test: ${id}...`)
  const action = new Action(id, steps)
  AutomationCompiler.init(action)
  console.log(`Compiled Test: ${id}`)
  AutomationEvents.dispatch(EVENT_NAMES.REGISTER_TEST, { id, action: action.getJSON() })
  console.log(`Registered Test: ${id} in TestsMap`)
  TestsMap[id] = () => {
    AutomationRunner.start(action)
  }
}

export { Test, RunTest, TestsMap }
