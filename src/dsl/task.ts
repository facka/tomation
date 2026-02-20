import { Action } from '~/dom/actions';
import { logger } from '../feedback/logger';
import { AutomationRunner } from '~/engine/runner';
import { AutomationCompiler } from '~/engine/compiler';

const Task = <T>(id: string, steps: (params: T) => void) => {
  return async (params?: T): Promise<void> => {
    const action = new Action(id, steps)
    action.setParams(params)
    if (!AutomationRunner.running && !AutomationCompiler.getIsCompiling()) {
      try {
        logger.log(`Compilation of Task ${id} starts...`)
        AutomationCompiler.init(action)
        logger.log(`Compilation of Task ${id} Finished.`)
        logger.log(`Start running Task ${id}...`)
        await AutomationRunner.start(action)
        logger.log(`End of Task ${id}: SUCCESS`)
      } catch (e: any) {
        logger.error('Error running task ' + id + '. ' + e.message)
      }
    } else {
      logger.log(`Adding action ${id} to compilation stack`)
      AutomationCompiler.addAction(action)
      AutomationCompiler.compileAction(action)
    }
  }
}

export { Task }