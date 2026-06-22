import { is, idIs, Task, Type, TypePassword, Click } from '@tomation/dsl'

const usernameInput = is.INPUT.where(idIs('username')).as('Username')
const passwordInput = is.INPUT.where(idIs('password')).as('Password')
const submitButton = is.BUTTON.where(idIs('login-btn')).as('Submit')
const message = is.DIV.where(idIs('message')).as('Message')

const fillCredentials = Task((params) => {
  const { username, password } = params
  Type(username).in(usernameInput)
  TypePassword(password).in(passwordInput)
}).as('Fill Credentials')

const fillInvalidCredentials = Task(() => {
  Type('wronguser').in(usernameInput)
  TypePassword('wrongpass').in(passwordInput)
}).as('Fill Invalid Credentials')

const submit = Task(() => {
  Click(submitButton)
}).as('Submit Form')

export default { usernameInput, passwordInput, submitButton, message, fillCredentials, fillInvalidCredentials, submit }
