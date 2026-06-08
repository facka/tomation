import { Action } from '~/dom/actions';
import { logger } from '../feedback/logger';
import { AutomationInstance } from '~/engine/runner';
import { AutomationCompiler } from '~/engine/compiler';

const Task = <T>(id: string, steps: (params: T) => void) => {
  return async (params?: T): Promise<void> => {
    const action = new Action(id, steps)
    action.setParams(params)
    // A task is a root task when no other task is currently running or being compiled.
    // If either is true, this task is being called from inside another task's steps,
    // so it should register itself as a nested action in the compilation stack instead
    // of starting a new execution cycle.
    const isRootTask = !AutomationInstance?.running && !AutomationCompiler.getIsCompiling()
    if (isRootTask) {
      if (!AutomationInstance) {
        throw new Error('Automation Setup not executed.')
      }
      try {
        logger.log(`Compilation of Task ${id} starts...`)
        AutomationCompiler.init(action)
        logger.log(`Compilation of Task ${id} Finished.`)
        logger.log(`Start running Task ${id}...`)
        await AutomationInstance.start(action)
        logger.log(`End of Task ${id}: SUCCESS`)
      } catch (e: any) {
        logger.error(`Error running task ${id}. ${e.message}`)
        throw e
      }
    } else {
      logger.log(`Adding action ${id} to compilation stack`)
      AutomationCompiler.addAction(action)
      AutomationCompiler.compileAction(action)
    }
  }
}

export { Task }