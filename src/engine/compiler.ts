import { AbstractAction, Action } from "~/dom/actions"
import { logger } from '../feedback/logger';

let currentAction: Action
let isCompiling: boolean

const compileAction = (action: Action) => {
  const previousAction = currentAction
  currentAction = action
  action.compileSteps()
  currentAction = previousAction
}

const addAction = (action: AbstractAction) => {
  logger.log('Add action: ', action.getDescription())
  currentAction.addStep(action)
}

const init = (startAction: Action) => {
  currentAction = startAction
  isCompiling = true
  logger.groupCollapsed('Compile: ' + startAction.getDescription())
  startAction.compileSteps()
  isCompiling = false
  logger.log('Compilation finished')
  logger.groupEnd()
}

const getCurrentAction = () => currentAction
const getIsCompiling = () => isCompiling

export const AutomationCompiler = {
  init,
  addAction,
  compileAction,
  getCurrentAction,
  getIsCompiling
}
