import { is, idIs, Task, Type, TypePassword, Click } from '@tomation/dsl'

// Elements
const usernameInput = is.INPUT.where(idIs('username')).as('Username Input')
const passwordInput = is.INPUT.where(idIs('password')).as('Password Input')
const submitButton = is.BUTTON.where(idIs('login-btn')).as('Submit Button')
const errorMessage = is.DIV.where(idIs('error-msg')).as('Error Message')

// Tasks
const fillCredentials = Task('fillCredentials', () => {
  Type('testuser').in(usernameInput)
  TypePassword('secret123').in(passwordInput)
})

const submit = Task('submit', () => {
  Click(submitButton)
})

export default {
  // UI Elements
  usernameInput,
  passwordInput,
  submitButton,
  errorMessage,
  // Actions
  fillCredentials,
  submit,
} 