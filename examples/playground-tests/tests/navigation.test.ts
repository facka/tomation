import { Test, Navigate, Wait } from '@tomation/dsl'
import Navigation from '~/pom/navigation.pom'

Test('Full wizard navigation flow', () => {
  Navigate('navigation/index.html')
  Wait(500)
  Navigation.verifyStep1()
  Navigate('page2.html')
  Wait(500)
  Navigation.verifyStep2()
  Navigate('page3.html')
  Wait(500)
  Navigation.verifyStep3()
})

Test('Navigate directly to confirmation page', () => {
  Navigate('./navigation/page3.html')
  Wait(300)
  Navigation.verifyStep3()
})
