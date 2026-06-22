import { is, idIs, classIncludes, Task, Type, Click } from '@tomation/dsl'

const input = is.INPUT.where(idIs('todo-input')).as('Todo Input')
const addButton = is.BUTTON.where(idIs('add-btn')).as('Add Button')
const list = is.UL.where(idIs('todo-list')).as('Todo List')
const firstItem = is.LI.where(classIncludes('todo-item')).as('First Item')
const firstItemText = is.SPAN.where(classIncludes('todo-text')).as('Item Text')
const deleteButton = is.BUTTON.where(classIncludes('delete-btn')).as('Delete Button')

const addItem = Task((params) => {
  const { text } = params
  Type(text).in(input)
  Click(addButton)
}).as('Add Item')

export default { input, addButton, list, firstItem, firstItemText, deleteButton, addItem }
