import { is, idIs, Task, AssertHasText } from '@tomation/dsl'

const pageTitle = is.H1.where(idIs('page-title')).as('Page Title')
const stepIndicator = is.DIV.where(idIs('step-indicator')).as('Step Indicator')
const successMessage = is.DIV.where(idIs('success-message')).as('Success Message')

Task('verifyStep1', () => {
  AssertHasText(pageTitle, 'Welcome to the Wizard')
  AssertHasText(stepIndicator, 'Step 1 of 3')
})

Task('verifyStep2', () => {
  AssertHasText(pageTitle, 'Provide Your Information')
  AssertHasText(stepIndicator, 'Step 2 of 3')
})

Task('verifyStep3', () => {
  AssertHasText(pageTitle, 'Confirmation')
  AssertHasText(successMessage, 'Wizard completed successfully')
  AssertHasText(stepIndicator, 'Step 3 of 3')
})
