## Tomation - Framework for automating tasks in browsers

Tomation is an innovative framework designed for streamlining the automation of tasks within a web browser environment.

The core concept behind Tomation is its seamless integration as a browser extension, offering an efficient solution for test management and execution log handling.

## Installation

Clone project locally and link it to your project.

At `tomation` run
```bash
npm link 
```

In your project run
```bash
npm link tomation
```

## Usage

It's recommended to use Page Object Model (POM) to implement automated tests. Create a file to automate a login page for example.
login-page.ts

```typescript
import { Task, Click, Type, TypePassword } from 'tomation'

// --- UI Elements ---
const loginButton = is.BUTTON
  .where(innerTextIs('Login'))
  .as('Login Button')

const usernameInput = is.INPUT
  .where((elem: HTMLElement) => elem?.parentElement?.parentElement?.children[1]?.textContent?.trim() === 'Username')
  .as('Username Input')

const passwordInput = is.INPUT
  .where((elem: HTMLElement) => elem?.parentElement?.parentElement?.children[1]?.textContent?.trim() === 'Password')
  .as('Password Input')

// --- UI Actions ---
const login = Task('Login task', (params: { username: string, password: string }) => {
  Type(params.username).in(usernameInput)
  TypePassword(params.password).in(passwordInput)
  Click(loginButton)
})

export default {
  // UI Elements
  loginButton,
  usernameInput,
  passwordInput,
  // Actions
  login,
}
```

```typescript
import LoginPage from '~/login-page'

function LoginTest() {
  Test('Login', () => {
    LoginPage.login({
      username: 'admin',
      password: '12345',
    })
  })
}

export {
  LoginTest
}

```

## Contributing

Pull requests are welcome. For major changes, please open an issue first
to discuss what you would like to change.

