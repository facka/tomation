# Tomation

A TypeScript-first browser automation framework that lets you write readable, maintainable UI tests using a declarative DSL — then run them directly in the browser via a lightweight extension.

Tomation separates **what** you're testing from **how** elements are found on the page. You declare elements using a tag-based builder pattern, compose reusable tasks, and write tests that read like plain English. The compiler transforms your TypeScript source into a portable `.tomation.json` file that the browser extension executes step-by-step.

## Demo

![Tomation Demo](./docs/tomation-demo-todo-list.gif)

## Installation

### Browser Extension

<!-- TODO: Update with store links once published -->
- **Chrome**: Coming soon
- **Firefox**: Coming soon

For development, load the extension from `packages/extension/dist` as an unpacked extension.

### Compiler

```bash
npm install @tomationjs/compiler @tomationjs/dsl
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
import { is, idIs, Task, Type, TypePassword, Click } from '@tomationjs/dsl'

const usernameInput = is.INPUT.where(idIs('username')).as('Username')
const passwordInput = is.INPUT.where(idIs('password')).as('Password')
const submitButton = is.BUTTON.where(idIs('login-btn')).as('Submit')
const errorMessage = is.DIV.where(idIs('error-msg')).as('Error Message')

const fillCredentials = Task((params) => {
  const { username, password } = params
  Type(username).in(usernameInput)
  TypePassword(password).in(passwordInput)
}).as('Fill Credentials')

const submit = Task(() => {
  Click(submitButton)
}).as('Submit')

export default { usernameInput, passwordInput, submitButton, errorMessage, fillCredentials, submit }
```

### 3. Write tests

```typescript
// tests/login.test.ts
import { Test, Click, AssertExists, AssertHasText } from '@tomationjs/dsl'
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

## DSL Reference

### Date Helpers

Date helpers resolve to formatted date strings at test execution time, so your tests stay valid regardless of when they run.

#### Day-offset helpers

```typescript
Type(today()).in(dateInput)           // today's date: 2025-07-06
Type(tomorrow()).in(dateInput)        // +1 day
Type(yesterday()).in(dateInput)       // -1 day
Type(nextWeek()).in(dateInput)        // +7 days
Type(lastWeek()).in(dateInput)        // -7 days
Type(nextMonth()).in(dateInput)       // +30 days
Type(lastMonth()).in(dateInput)       // -30 days
```

#### Month-boundary helpers

```typescript
Type(firstDateOfMonth(0)).in(dateInput)    // 1st of current month
Type(lastDateOfMonth(0)).in(dateInput)     // last day of current month
Type(firstDateOfMonth(-1)).in(dateInput)   // 1st of previous month
Type(lastDateOfMonth(1)).in(dateInput)     // last day of next month
```

#### Custom format strings

All date helpers accept an optional format string. The default is `YYYY-MM-DD`.

```typescript
Type(today('MM/DD/YYYY')).in(dateInput)              // 07/06/2025
Type(tomorrow('DD-MM-YYYY')).in(dateInput)           // 07-07-2025
Type(firstDateOfMonth(0, 'M/D/YYYY')).in(dateInput)  // 7/1/2025
```

Supported tokens: `YYYY` (4-digit year), `MM` (zero-padded month), `DD` (zero-padded day), `M` (month), `D` (day). Separators (`/`, `-`, `.`) are preserved as-is.

### Runtime Template Strings

Template literals with `${}` expressions are evaluated at runtime, enabling dynamic value construction.

#### Parameter references

```typescript
Type(`Hello ${username}`).in(greetingInput)
```

#### Date helpers inside templates

```typescript
Type(`Appointment on ${tomorrow()} at ${time}`).in(noteInput)
```

#### Arithmetic expressions

```typescript
Type(`Item ${count + 1}`).in(itemInput)
Type(`Total: ${price * quantity}`).in(totalInput)
```

#### Combined example

```typescript
const bookAppointment = Task((params) => {
  const { doctor, slot } = params
  Type(`Dr. ${doctor} - ${tomorrow('MM/DD')} at ${slot}`).in(appointmentField)
}).as('Book Appointment')
```

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
