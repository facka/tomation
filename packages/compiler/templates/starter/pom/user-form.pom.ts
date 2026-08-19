import { is, idIs, Task, Type, Select, Click } from '@tomationjs/dsl'

const nameInput = is.INPUT.where(idIs('full-name')).as('Full Name')
const emailInput = is.INPUT.where(idIs('email')).as('Email')
const phoneInput = is.INPUT.where(idIs('phone')).as('Phone')
const dobInput = is.INPUT.where(idIs('dob')).as('Date of Birth')
const roleSelect = is.SELECT.where(idIs('role')).as('Role')
const addressInput = is.INPUT.where(idIs('address')).as('Address')
const registerButton = is.BUTTON.where(idIs('register-btn')).as('Register')
const message = is.DIV.where(idIs('message')).as('Message')

const fillForm = Task((params: {
  name: string; email: string; phone: string;
  dob: string; role: string; address: string;
}) => {
  Type(params.name).in(nameInput)
  Type(params.email).in(emailInput)
  Type(params.phone).in(phoneInput)
  Type(params.dob).in(dobInput)
  Select(params.role).in(roleSelect)
  Type(params.address).in(addressInput)
}).as('Fill Registration Form')

const submit = Task(() => {
  Click(registerButton)
}).as('Submit Registration')

export default {
  nameInput, emailInput, phoneInput, dobInput,
  roleSelect, addressInput, registerButton, message,
  fillForm, submit,
}
