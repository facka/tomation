import { Test, Navigate, Wait } from '@tomation/dsl'
import Navigation from '~/pom/navigation.pom'

Test('Full wizard navigation flow', () => {
  Navigate('login/index.html')
  Wait(500)
  Navigation.verifyStep1()
  Navigate('navigation/page2.html')
  Wait(500)
  Navigation.verifyStep2()
  Navigate('navigation/page3.html')
  Wait(500)
  Navigation.verifyStep3()
})

Test('Navigate directly to confirmation page', () => {
  Navigate('navigation/page3.html')
  Wait(300)
  Navigation.verifyStep3()
})
