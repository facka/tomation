import { is, idIs } from '@tomationjs/dsl'

/**
 * Root element descriptors for the demo form fields that host a SearchSelect
 * Component instance. Each is an ordinary element descriptor; passing one to
 * `SearchSelect.in(root)` binds that instance's `.childOf(el)` locators to this
 * field's subtree.
 */
const countryField = is.DIV.where(idIs('country-field')).as('Country Field')
const cityField = is.DIV.where(idIs('city-field')).as('City Field')

export default {
  countryField,
  cityField,
}
