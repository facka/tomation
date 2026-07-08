import { Automation, AssertExists, AssertHasText, SaveText } from '@tomationjs/dsl'
import Todo from '~/pom/todo.pom'

Automation((params: { item: string }) => {
  Todo.addItem({ text: params.item })
  AssertExists(Todo.firstItem)
  SaveText(Todo.firstItemText).as('savedItem')
  AssertHasText(Todo.firstItemText, params.item)
}).as('Add Todo Item')
