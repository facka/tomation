import { Component, Task, Click, is, idIs, When } from '@tomationjs/dsl'

/**
 * SeniorityRadio — a reusable radio-group Component for the Seniority field.
 *
 * The three seniority radios are distinguished by id (seniority-junior /
 * seniority-semisenior / seniority-senior). Each locator chains `.childOf(el)`,
 * so an instance resolves only within the root it is bound to via `.in(root)` —
 * the same group can be reused on any page that nests these radios under a root.
 *
 * The exposed `select` action takes the chosen option as a single string param
 * and clicks the matching radio.
 */
const SeniorityRadio = Component(({ el }) => {
  const juniorRadio = is.INPUT.where(idIs('seniority-junior')).childOf(el).as('Junior')
  const semiseniorRadio = is.INPUT.where(idIs('seniority-semisenior')).childOf(el).as('Semisenior')
  const seniorRadio = is.INPUT.where(idIs('seniority-senior')).childOf(el).as('Senior')

  const select = Task((params: { option: string }) => {
    When(params.option === 'Junior', () => Click(juniorRadio))
    When(params.option === 'Semisenior', () => Click(semiseniorRadio))
    When(params.option === 'Senior', () => Click(seniorRadio))
  }).as('Select Seniority')

  return { juniorRadio, semiseniorRadio, seniorRadio, select }
})

export default SeniorityRadio
