import { nextWeek, Test, Type, AssertHasText, Data } from '@tomationjs/dsl'
import NewTask from '~/pom/new-task.pom'
import UserForm from '~/pom/user-form.pom'
import TaskTypes from '~/data/task-types.data'

const newTaskDefault = Data({
  taskType: TaskTypes.Type1,
  provider: 'Provider1',
  dueDate: nextWeek('MM/DD/YYYY'),
})

Test('Create a task using the default-import (three-level enum) template', () => {
  // newTaskDefault.taskType → {{data.newTaskDefault.taskType}} (3-level enum → 'Authorization Request')
  Type(newTaskDefault.taskType).in(NewTask.taskTypeInput)
  // newTaskDefault.provider → {{data.newTaskDefault.provider}} (literal → 'Provider1')
  Type(newTaskDefault.provider).in(UserForm.nameInput)
  // newTaskDefault.dueDate → {{data.newTaskDefault.dueDate}} (date helper descriptor)
  Type(newTaskDefault.dueDate).in(UserForm.dobInput)
  AssertHasText(UserForm.message, newTaskDefault.provider)
})

// (a) LOCAL-const value-source case.
// LocalTypes is a locally-declared Data() template whose primitive-literal leaf
// members are registered in constBindings at compile time.
const LocalTypes = Data({ A: 'a', B: 'b' })

// localSourced.x references LocalTypes.A as a VALUE SOURCE at the member level.
// This two-level member expression (T.M) is resolved at compile time via
// constBindings — it must become the literal 'a' after the fix.
const localSourced = Data({ x: LocalTypes.A, label: 'local' })

Test('Create a task using a local-const Data() value source', () => {
  // localSourced.x → {{data.localSourced.x}} resolves to the literal 'a'
  // (LocalTypes.A is a local Data() value source resolved via constBindings)
  Type(localSourced.x).in(UserForm.nameInput)
  // localSourced.label → {{data.localSourced.label}} (literal → 'local')
  AssertHasText(UserForm.message, localSourced.label)
})

// (b) DUAL-ROLE case.
// DualTypes plays BOTH roles: (1) a T.M value source inside another Data()
// template AND (2) a {{data.*}} step token used directly in a step. The two
// resolution paths coexist independently:
//   - constBindings resolves DualTypes.P as a compile-time value source
//   - dataVars emits {{data.DualTypes.P}} when DualTypes.P is a step value
const DualTypes = Data({ P: 'p-value', Q: 'q-value' })

// dualSourced.picked references DualTypes.P as a two-level value source;
// compile-time constBindings resolution turns it into the literal 'p-value'.
const dualSourced = Data({ picked: DualTypes.P, note: 'dual' })

Test('Create a task using a dual-role Data() template', () => {
  // DualTypes.P used DIRECTLY as a step value → {{data.DualTypes.P}} token
  // via the separate dataVars mechanism (role 2)
  Type(DualTypes.P).in(UserForm.nameInput)
  // dualSourced.picked → {{data.dualSourced.picked}} resolves to 'p-value'
  // (DualTypes.P as a value source via constBindings — role 1)
  AssertHasText(UserForm.message, dualSourced.picked)
})

