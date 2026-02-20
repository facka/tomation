import { innerTextIs, is, isFirstElement, AutomationEvents, Click, EVENT_NAMES, Task, Setup, AutomationInstance, Type, Assert } from '../src/main'
import { beforeAll, expect, test } from 'vitest'
import { JSDOM } from 'jsdom'
import { Action } from '../src/dom/actions'

const TestUtils = {
  waitForActionUpdate: ():Promise<Action> => {
    return new Promise((resolve, reject) => {
      AutomationEvents.on(EVENT_NAMES.ACTION_UPDATE, (data: any) => {
        if (data.action.status === 'success') {
          resolve(data.action)
        } else if (data.action.status === 'error') {
          reject('Error running task')
        }
      })
    })
  }
}

const UIElements = {
  button: is.BUTTON.where(innerTextIs('Click me!')).as('Click Me button'),
  input: is.INPUT.where(isFirstElement()).as('Input field')
}

const actions = {
  clickButtonTest: Task('Click Button Test', () => {
    Click(UIElements.button)
  }),
  typeInInput: Task('Type in Input', (params: {
    value: string
  }
  ) => {
    const { value } = params
    Type(value).in(UIElements.input)
    Assert(UIElements.input).valueIs(value)
  })
}

beforeAll(async () => {
  const { window } = (new JSDOM(`
    <div>
      <button>Click me!</button>
    </div>
    <div>
      <input type="text"/>
    </div>
  `));
  Event = window.Event
  await Setup(window as unknown as Window)
})

test('Test click button', async () => {
  actions.clickButtonTest()
  const actionData = await TestUtils.waitForActionUpdate()
  expect(actionData.status).toBe('success')
})

test('Test type in input with parameterized Task', async () => {
  actions.typeInInput({ value: 'Some value' })
  const actionData = await TestUtils.waitForActionUpdate()
  expect(actionData.status).toBe('success')
})

