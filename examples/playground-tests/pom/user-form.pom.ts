import { is, idIs, Task, Type, Select, Click } from '@tomationjs/dsl'
import SeniorityRadio from '~/components/seniority-radio.com'

const nameInput = is.INPUT.where(idIs('full-name')).as('Full Name')
const emailInput = is.INPUT.where(idIs('email')).as('Email')
const phoneInput = is.INPUT.where(idIs('phone')).as('Phone')
const dobInput = is.INPUT.where(idIs('dob')).as('Date of Birth')
const roleSelect = is.SELECT.where(idIs('role')).as('Role')
const skillsSelect = is.SELECT.where(idIs('skills')).as('Tech Skills')
const addressInput = is.INPUT.where(idIs('address')).as('Address')
// Root element for the SeniorityRadio Component instance. Passing this to
// `SeniorityRadio.in(root)` scopes that instance's `.childOf(el)` radio
// locators to this fieldset's subtree.
const seniorityField = is.FIELDSET.where(idIs('seniority')).as('Seniority Field')
const registerButton = is.BUTTON.where(idIs('register-btn')).as('Register')
const message = is.DIV.where(idIs('message')).as('Message')

// The Seniority radio group is modeled as a reusable Component, bound to the
// fieldset root. Its `.childOf(el)` locators resolve within that root.
const seniority = SeniorityRadio.in(seniorityField)

const fillForm = Task((params: {
  name: string; email: string; phone: string;
  dob: string; role: string; skills: string; address: string;
  seniority: 'Junior' | 'Semisenior' | 'Senior';
}) => {
  Type(params.name).in(nameInput)
  Type(params.email).in(emailInput)
  Type(params.phone).in(phoneInput)
  Type(params.dob).in(dobInput)
  Select(params.role).in(roleSelect)
  Select(params.skills).in(skillsSelect)
  Type(params.address).in(addressInput)
  seniority.select({ option: params.seniority })
}).as('Fill Registration Form')

const submit = Task(() => {
  Click(registerButton)
}).as('Submit Registration')

export default {
  nameInput, emailInput, phoneInput, dobInput,
  roleSelect, skillsSelect, addressInput,
  seniorityField,
  registerButton, message,
  fillForm, submit,
}
