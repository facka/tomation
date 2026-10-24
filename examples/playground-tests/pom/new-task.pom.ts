import { is, idIs } from '@tomationjs/dsl'

export enum TaskTypes {
  AUTHORIZATION_REQUEST = 'Authorization Request',
}

const taskTypeInput = is.INPUT.where(idIs('task-type')).as('Task Type Input')

// Re-export the enum through the default-export object so a default import
// resolves it three levels deep (NewTaskPage.TaskTypes.AUTHORIZATION_REQUEST).
export default { taskTypeInput, TaskTypes }
