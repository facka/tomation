import { is, idIs, Task, AssertHasText } from '@tomationjs/dsl'

const pageTitle = is.H1.where(idIs('page-title')).as('Page Title')
const stepIndicator = is.DIV.where(idIs('step-indicator')).as('Step Indicator')
const successMessage = is.DIV.where(idIs('success-message')).as('Success Message')

const verifyStep1 = Task(() => {
  AssertHasText(pageTitle, 'Welcome to the Wizard')
  AssertHasText(stepIndicator, 'Step 1 of 3')
}).as('Verify Step 1')

const verifyStep2 = Task(() => {
  AssertHasText(pageTitle, 'Provide Your Information')
  AssertHasText(stepIndicator, 'Step 2 of 3')
}).as('Verify Step 2')

const verifyStep3 = Task(() => {
  AssertHasText(pageTitle, 'Confirmation')
  AssertHasText(successMessage, 'Wizard completed successfully')
  AssertHasText(stepIndicator, 'Step 3 of 3')
}).as('Verify Step 3')

export default { pageTitle, stepIndicator, successMessage, verifyStep1, verifyStep2, verifyStep3 }
