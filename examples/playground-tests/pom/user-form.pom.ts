import { is, idIs, Task, Type, Select, Click, When } from '@tomationjs/dsl'

const nameInput = is.INPUT.where(idIs('full-name')).as('Full Name')
const emailInput = is.INPUT.where(idIs('email')).as('Email')
const phoneInput = is.INPUT.where(idIs('phone')).as('Phone')
const dobInput = is.INPUT.where(idIs('dob')).as('Date of Birth')
const roleSelect = is.SELECT.where(idIs('role')).as('Role')
const skillsSelect = is.SELECT.where(idIs('skills')).as('Tech Skills')
const addressInput = is.INPUT.where(idIs('address')).as('Address')
const juniorRadio = is.INPUT.where(idIs('seniority-junior')).as('Junior Seniority')
const semiseniorRadio = is.INPUT.where(idIs('seniority-semisenior')).as('Semisenior Seniority')
const seniorRadio = is.INPUT.where(idIs('seniority-senior')).as('Senior Seniority')
const registerButton = is.BUTTON.where(idIs('register-btn')).as('Register')
const message = is.DIV.where(idIs('message')).as('Message')

const fillForm = Task((params: {
  name: string; email: string; phone: string;
  dob: string; role: string; skills: string; address: string;
  isJunior?: boolean; isSemisenior?: boolean; isSenior?: boolean;
}) => {
  Type(params.name).in(nameInput)
  Type(params.email).in(emailInput)
  Type(params.phone).in(phoneInput)
  Type(params.dob).in(dobInput)
  Select(params.role).in(roleSelect)
  Select(params.skills).in(skillsSelect)
  Type(params.address).in(addressInput)

  // Only one seniority radio can be selected — pick the one that matches
  When(params.isJunior, () => Click(juniorRadio))
  When(params.isSemisenior, () => Click(semiseniorRadio))
  When(params.isSenior, () => Click(seniorRadio))
}).as('Fill Registration Form')

const submit = Task(() => {
  Click(registerButton)
}).as('Submit Registration')

export default {
  nameInput, emailInput, phoneInput, dobInput,
  roleSelect, skillsSelect, addressInput,
  juniorRadio, semiseniorRadio, seniorRadio,
  registerButton, message,
  fillForm, submit,
}
