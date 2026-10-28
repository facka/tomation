import { Test } from '@tomationjs/dsl'
import user from '~/data/user.data'
import SearchForm from '~/pom/search-form.pom'
import SearchSelect from '~/components/search-select.com'

// Two instances of the same Component bound to two different form-field roots.
// Each instance's `.childOf(el)` locators resolve within its own root subtree.
const country = SearchSelect.in(SearchForm.countryField)
const city = SearchSelect.in(SearchForm.cityField)

Test('Pick country and city via the searchable select', () => {
  // Data token: the query carries a {{data.*}} value from user.data.ts.
  country.choose({ query: user.address })
  // Literal query on the second instance.
  city.choose({ query: 'Springfield' })
})
