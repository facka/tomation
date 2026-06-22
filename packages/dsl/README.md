# @tomationjs/dsl

TypeScript-first DSL for writing browser automation tests with [Tomation](https://github.com/facka/tomation).

## Install

```bash
npm install @tomationjs/dsl
```

## Usage

### Define elements

```typescript
import { is, idIs, classIncludes } from '@tomationjs/dsl'

const usernameInput = is.INPUT.where(idIs('username')).as('Username')
const submitButton = is.BUTTON.where(classIncludes('btn-primary')).as('Submit')
```

### Define tasks

```typescript
import { Task, Type, TypePassword, Click } from '@tomationjs/dsl'

const login = Task((params: { username: string; password: string }) => {
  const { username, password } = params
  Type(username).in(usernameInput)
  TypePassword(password).in(passwordInput)
  Click(submitButton)
}).as('Login')

export default { usernameInput, submitButton, login }
```

### Write tests

```typescript
import { Test, AssertHasText } from '@tomationjs/dsl'
import Login from '~/pom/login.pom'

Test('Login with valid credentials', () => {
  Login.login({ username: 'admin', password: 'secret' })
  AssertHasText(Login.message, 'Welcome')
})
```

## Available Actions

| Action | Description |
|--------|-------------|
| `Click(element)` | Click an element |
| `Type(value).in(element)` | Type text into an input |
| `TypePassword(value).in(element)` | Type password (masked in logs) |
| `Select(value).in(element)` | Select a dropdown option |
| `Upload(file).in(element)` | Upload a file to an input |
| `AssertExists(element)` | Assert element is on the page |
| `AssertNotExists(element)` | Assert element is not on the page |
| `AssertHasText(element, text)` | Assert element contains text |
| `Navigate(url)` | Navigate to a URL |
| `Wait(ms)` | Wait for a duration |
| `WaitFor(element)` | Wait for element to appear |
| `WaitForGone(element)` | Wait for element to disappear |
| `Manual(description)` | Pause for manual verification |
| `PressKey(key, options?)` | Press a keyboard key |
| `Press(key, options?).in(element)` | Press key on a specific element |
| `PressEnter()` / `PressTab()` / `PressEsc()` | Key shortcuts |

## Element Matchers

| Matcher | Matches |
|---------|---------|
| `idIs(id)` | `id` attribute |
| `innerTextIs(text)` | Exact text content |
| `innerTextContains(text)` | Partial text content |
| `classIncludes(cls)` | CSS class name |
| `placeholderIs(ph)` | Placeholder attribute |
| `nameIs(name)` | Name attribute |
| `typeIs(type)` | Input type attribute |

## XPath Elements

```typescript
import { Element } from '@tomationjs/dsl'

const alert = Element('//div[@role="alert"]').as('Alert Banner')
```

## License

MIT
