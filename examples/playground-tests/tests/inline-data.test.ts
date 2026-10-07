import { Test, Type, Click, AssertExists, AssertHasText, Data, Fake } from '@tomationjs/dsl'
import Todo from '~/pom/todo.pom'

// Inline Data() declared WITHOUT .as() — Data_Name defaults to the variable name `task`.
// Uses a nested property (`task.detail.priority`) to exercise nested paths, and a Fake.*
// value (`task.note`) to exercise Fake descriptors in inline data.
const task = Data({
  title: 'Write report',
  detail: { priority: 'high' },
  note: Fake.fullName(),
})

// Inline Data() declared WITH .as() — Data_Name overridden to `groceries`.
const label = Data({ text: 'Buy groceries' }).as('groceries')

// References `task` (value position + nested path) and `label` (value position via task invocation).
Test('Add todo items from inline data', () => {
  // Value position (Req 3.1): compiles to {{data.task.title}}.
  Type(task.title).in(Todo.input)
  Click(Todo.addButton)
  AssertExists(Todo.firstItem)
  // Assertion position (Req 6.1): compiles to {{data.task.title}}.
  AssertHasText(Todo.firstItemText, task.title)

  // Task invocation argument referencing inline data with .as() override:
  // compiles to {{data.groceries.text}}.
  Todo.addItem({ text: label.text })
  AssertHasText(Todo.list, label.text)
})

// Shares the SAME inline vars across more than one Test (Req 4.1) and exercises the
// nested path (Req 3.4) and the Fake.* leaf.
Test('Verify nested and faked inline data', () => {
  // Nested path (Req 3.4): compiles to {{data.task.detail.priority}}.
  Type(task.detail.priority).in(Todo.input)
  Click(Todo.addButton)
  AssertExists(Todo.firstItem)
  AssertHasText(Todo.firstItemText, task.detail.priority)

  // Fake.* leaf referenced as a value: compiles to {{data.task.note}} (token, not inlined).
  Todo.addItem({ text: task.note })
  AssertHasText(Todo.list, task.note)
})
