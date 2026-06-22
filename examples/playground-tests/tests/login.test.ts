import { Test, Click, AssertHasText } from '@tomationjs/dsl'
import Login from '~/pom/login.pom'

Test('Login with valid credentials', () => {
  Login.fillCredentials({ username: 'admin', password: 'password123' })
  Login.submit()
  AssertHasText(Login.message, 'Login successful')
})

Test('Login with invalid credentials shows error', () => {
  Login.fillInvalidCredentials()
  Login.submit()
  AssertHasText(Login.message, 'Invalid username or password')
})

Test('Login shows error on empty submit', () => {
  Click(Login.submitButton)
  AssertHasText(Login.message, 'required')
})
