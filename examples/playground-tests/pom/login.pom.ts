import { is, idIs, Task, Type, TypePassword, Click } from '@tomation/dsl'

const usernameInput = is.INPUT.where(idIs('username')).as('Username')
const passwordInput = is.INPUT.where(idIs('password')).as('Password')
const submitButton = is.BUTTON.where(idIs('login-btn')).as('Submit')
const message = is.DIV.where(idIs('message')).as('Message')

Task('fillCredentials', () => {
  Type('admin').in(usernameInput)
  TypePassword('password123').in(passwordInput)
})

Task('fillInvalidCredentials', () => {
  Type('wronguser').in(usernameInput)
  TypePassword('wrongpass').in(passwordInput)
})

Task('submit', () => {
  Click(submitButton)
})
