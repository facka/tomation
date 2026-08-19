import { Test, AssertHasText } from '@tomationjs/dsl'
import user from '~/data/user.data'
import UserForm from '~/pom/user-form.pom'

Test('Register user with generated data', () => {
  UserForm.fillForm({
    name: user.name,
    email: user.email,
    phone: user.phone,
    dob: user.dob,
    role: user.role,
    address: user.address,
  })
  UserForm.submit()
  AssertHasText(UserForm.message, 'User registered successfully')
})

Test('Register user shows error on empty submit', () => {
  UserForm.submit()
  AssertHasText(UserForm.message, 'All fields are required')
})
