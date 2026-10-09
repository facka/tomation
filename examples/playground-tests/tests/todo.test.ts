import { Test, Click, Type, AssertExists, AssertNotExists, AssertHasText, Data, Fake } from '@tomationjs/dsl'
import Todo from '~/pom/todo.pom'

// Inline Data() without .as() — the data name defaults to the variable name `todo`.
// Models a single todo item: a label to type, nested metadata, and a Fake.* owner.
const todo = Data({
  item: 'Buy groceries',
  details: { followUp: 'Pick up dry cleaning' },
  owner: Fake.fullName(),
})

// Inline Data() with .as() — a second item whose data name is overridden to `chore`.
const dogWalk = Data({ item: 'Walk the dog' }).as('chore')

Test('Add a todo item and verify it exists', () => {
  // todo.item → {{data.todo.item}}
  Todo.addItem({ text: todo.item })
  AssertExists(Todo.firstItem)
  AssertHasText(Todo.firstItemText, todo.item)
})

Test('Delete a todo item and verify it is removed', () => {
  // dogWalk.item → {{data.chore.item}} (name overridden via .as())
  Type(dogWalk.item).in(Todo.input)
  Click(Todo.addButton)
  AssertExists(Todo.firstItem)
  Click(Todo.deleteButton)
  AssertNotExists(Todo.firstItem)
})

Test('Add multiple items and verify text content', () => {
  // Nested path → {{data.todo.details.followUp}}; Fake.* leaf → {{data.todo.owner}}
  Todo.addItem({ text: todo.details.followUp })
  Todo.addItem({ text: todo.owner })
  AssertExists(Todo.firstItem)
  AssertHasText(Todo.list, todo.details.followUp)
  AssertHasText(Todo.list, todo.owner)
})
