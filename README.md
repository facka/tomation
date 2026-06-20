# Tomation

A TypeScript-first browser automation framework that lets you write readable, maintainable UI tests using a declarative DSL — then run them directly in the browser via a lightweight extension.

Tomation separates **what** you're testing from **how** elements are found on the page. You declare elements using a tag-based builder pattern, compose reusable tasks, and write tests that read like plain English. The compiler transforms your TypeScript source into a portable `.tomation.json` file that the browser extension executes step-by-step.

## Demo

![Tomation Demo](./docs/demo.gif)

## Installation

### Browser Extension

<!-- TODO: Update with store links once published -->
- **Chrome**: Coming soon
- **Firefox**: Coming soon

For development, load the extension from `packages/extension/dist` as an unpacked extension.

### Compiler

```bash
npm install @tomation/compiler @tomation/dsl
```

## Quick Start

### 1. Create a config file

```typescript
// tomation.config.ts
export default {
  meta: {
    name: 'My App Tests',
    urls: ['http://localhost:3000'],
  },
  pom: './pom',
  tests: './tests',
  baseUrl: './',
}
```

### 2. Define page elements (POM)

```typescript
// pom/login.pom.ts
import { is, idIs, Task, Type, TypePassword, Click } from '@tomation/dsl'

const usernameInput = is.INPUT.where(idIs('username')).as('Username')
const passwordInput = is.INPUT.where(idIs('password')).as('Password')
const submitButton = is.BUTTON.where(idIs('login-btn')).as('Submit')
const errorMessage = is.DIV.where(idIs('error-msg')).as('Error Message')

Task('fillCredentials', (params) => {
  const { username, password } = params
  Type(username).in(usernameInput)
  TypePassword(password).in(passwordInput)
})

Task('submit', () => {
  Click(submitButton)
})
```

### 3. Write tests

```typescript
// tests/login.test.ts
import { Test, Click, AssertExists, AssertHasText } from '@tomation/dsl'
import Login from '~/pom/login.pom'

Test('Login with valid credentials', () => {
  Login.fillCredentials({ username: 'admin', password: 'secret' })
  Login.submit()
  AssertExists(Login.errorMessage)
})

Test('Login shows error on empty submit', () => {
  Click(Login.submitButton)
  AssertHasText(Login.errorMessage, 'required')
})
```

### 4. Compile

```bash
npx tomation compile
```

This produces a `.tomation.json` file (named from your `meta.name`) that the browser extension uses to execute your tests.

### 5. Run

Open the Tomation browser extension panel, load your `.tomation.json`, and run tests interactively with step-by-step execution, pause/resume, and retry controls.

## Key Features

- **TypeScript-first** — Full editor autocomplete, type safety, and go-to-definition
- **Declarative element selectors** — `is.BUTTON.where(idIs('login')).as('Login Button')`
- **XPath support** — `Element('//div[@role="alert"]').as('Alert')`
- **Reusable tasks** — Compose multi-step workflows with parameters and conditionals
- **Folder-based namespacing** — Organize POM files in folders without naming conflicts
- **Browser extension runtime** — Execute tests directly in the browser with visual feedback
- **Watch mode** — `npx tomation watch` for live recompilation during development

## Project Structure

```
packages/
  compiler/    # CLI that compiles .ts POM/test files → .tomation.json
  dsl/         # Runtime stubs + TypeScript types for authoring
  extension/   # Browser extension (Chrome/Firefox) for test execution
examples/
  playground/         # Static HTML apps for testing (deployed to GitHub Pages)
  playground-tests/   # Tomation test scripts for the playground apps
  my-app-tests/       # Example project with login flow tests
```
