import { Automation, AssertExists, AssertHasText, SaveText } from '@tomationjs/dsl'
import Todo from '~/pom/todo.pom'

Automation('Add Todo Item', (params: { item: string }) => {
  Todo.addItem({ text: params.item })
  AssertExists(Todo.firstItem)
  SaveText(Todo.firstItemText).as('savedItem')
  AssertHasText(Todo.firstItemText, params.item)
  AssertHasText(Todo.firstItemText, '{{ctx.savedItem}}')
})
