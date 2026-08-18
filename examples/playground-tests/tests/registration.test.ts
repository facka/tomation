import { Test, Type, Click, AssertHasText } from '@tomationjs/dsl'
import patient from '~/data/patient.data'
import Login from '~/pom/login.pom'

Test('Register a new patient with generated data', () => {
  Type(patient.name).in(Login.usernameInput)
  Type(patient.email).in(Login.passwordInput)
  Click(Login.submitButton)
  AssertHasText(Login.message, 'Login successful')
})

Test('Verify patient data fields are populated', () => {
  Type(patient.name).in(Login.usernameInput)
  Type(patient.phone).in(Login.passwordInput)
  Type(patient.dob).in(Login.usernameInput)
  Type(patient.address).in(Login.passwordInput)
  Click(Login.submitButton)
})
