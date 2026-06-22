import { Test, Click, Type, AssertExists, AssertNotExists, AssertHasText } from '@tomationjs/dsl'
import Todo from '~/pom/todo.pom'

Test('Add a todo item and verify it exists', () => {
  Todo.addItem({ text: 'Buy groceries' })
  AssertExists(Todo.firstItem)
  AssertHasText(Todo.firstItemText, 'Buy groceries')
})

Test('Delete a todo item and verify it is removed', () => {
  Type('Walk the dog').in(Todo.input)
  Click(Todo.addButton)
  AssertExists(Todo.firstItem)
  Click(Todo.deleteButton)
  AssertNotExists(Todo.firstItem)
})

Test('Add multiple items and verify text content', () => {
  Todo.addItem({ text: 'Read a book' })
  Todo.addItem({ text: 'Write code' })
  AssertExists(Todo.firstItem)
  AssertHasText(Todo.list, 'Read a book')
  AssertHasText(Todo.list, 'Write code')
})
