import {
  Component,
  Task,
  Type,
  Click,
  AssertExists,
  is,
  classIncludes,
  placeholderIs,
  isNthElement,
} from '@tomationjs/dsl'

/**
 * SearchSelect — a reusable searchable-select Component.
 *
 * Interaction: open the dropdown, type a search query, click the first result.
 *
 * Scoping:
 *   - `trigger` and `searchBox` chain `.childOf(el)`, so they are resolved
 *     relative to each instance's Root_Element (emitted with a per-instance
 *     `scopeRoot`). This keeps two instances bound to different form fields from
 *     colliding.
 *   - `firstResult` does NOT chain `.childOf(el)` — the dropdown list is rendered
 *     in a document-level portal/overlay outside the field root, so it stays
 *     document-scoped (no `scopeRoot`).
 */
const SearchSelect = Component(({ el }) => {
  const trigger = is.BUTTON.where(classIncludes('select-trigger')).childOf(el).as('Open Select')
  const searchBox = is.INPUT.where(placeholderIs('Search...')).childOf(el).as('Search Field')
  // Portal-rendered dropdown list: document-scoped (no .childOf(el)).
  const firstResult = is.LI.where(isNthElement(1)).as('First Result')

  const choose = Task((params: { query: string }) => {
    Click(trigger)
    Type(params.query).in(searchBox)
    Click(firstResult)
    AssertExists(trigger)
  }).as('Choose Option')

  return { trigger, searchBox, firstResult, choose }
})

export default SearchSelect
