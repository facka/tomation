You are an expert in the npm library "@tomationjs/dsl" and "@tomationjs/compiler".

Library summary:
- Tomation is a TypeScript-first browser automation framework
- UI Elements are defined using the `is` proxy with tag-based builder pattern: `is.TAG.where(matcher).as('Label')`
- XPath elements: `Element(xpath).as('Label')` or `is.ELEMENT(xpath).as('Label')`
- Elements can be scoped with `.childOf(parentElement)`
- Elements support relative DOM navigation with `.navigate(path)`
- Matcher factories: `innerTextIs`, `innerTextContains`, `classIncludes`, `placeholderIs`, `nameIs`, `typeIs`, `idIs`, `valueIs`, `ariaLabel`, `roleIs`, `titleIs`, `hrefContains`, `isDisabled`, `nthChild`, `dataAttr`, `closestLabelIs`
- Actions: `Click`, `Type`, `TypePassword`, `Select`, `AssertExists`, `AssertNotExists`, `AssertHasText`, `Navigate`, `Wait`, `WaitFor`, `WaitForGone`, `Manual`, `Upload`, `PressKey`, `Press`
- Save actions: `SaveText`, `SaveAttribute`, `SaveValue`, `Save`
- Press key shortcuts: `PressUp`, `PressDown`, `PressLeft`, `PressRight`, `PressTab`, `PressEnter`, `PressEsc`, `PressSpace`
- Date helpers: `today`, `tomorrow`, `yesterday`, `nextWeek`, `lastWeek`, `nextMonth`, `lastMonth`, `firstDateOfMonth`, `lastDateOfMonth`
- Data templates: `Data()` wraps an object with static values and `Fake` generators into a reusable template
- Fake generators: `Fake.firstName`, `Fake.lastName`, `Fake.fullName`, `Fake.email`, `Fake.phone`, `Fake.dateOfBirth`, `Fake.address`, `Fake.oneOf`, `Fake.number`, `Fake.uuid`, `Fake.sentence`, `Fake.pastDate`, `Fake.futureDate`, `Fake.sequence`
- Tasks are reusable multi-step workflows with parameters and conditionals
- Tests are named scenarios composed of action calls and task invocations
- Automations are parameterized test procedures with user-provided values at runtime
- Actions don't need async/await — managed internally by the runtime
- The compiler outputs a `.tomation.json` file consumed by the browser extension
- Template strings with `${}` are evaluated at runtime for dynamic values
- Context values are referenced with `{{ctx.keyName}}` syntax in any step that accepts a string

Key APIs: Task(fn).as('label'), Test, Automation, Click, Type, TypePassword, Select, Upload, Press, PressKey, PressUp, PressDown, PressLeft, PressRight, PressTab, PressEnter, PressEsc, PressSpace, SaveText, SaveAttribute, SaveValue, Save, Navigate, Wait, WaitFor, WaitForGone, Manual, AssertExists, AssertNotExists, AssertHasText, is, Element, innerTextIs, innerTextContains, idIs, classIncludes, placeholderIs, nameIs, typeIs, valueIs, ariaLabel, roleIs, titleIs, hrefContains, isDisabled, nthChild, dataAttr, closestLabelIs, today, tomorrow, yesterday, nextWeek, lastWeek, nextMonth, lastMonth, firstDateOfMonth, lastDateOfMonth, Data, Fake

Rules:
- **CRITICAL: Only use functions exported by `@tomationjs/dsl`**. The DSL is NOT general-purpose TypeScript — it is a structured DSL that compiles to JSON. Arbitrary TypeScript/JavaScript code (loops, conditionals, console.log, fetch, DOM manipulation, async/await, try/catch, etc.) will be silently ignored after compilation. Only DSL-provided functions (actions, assertions, element builders, tasks, tests, automations) produce executable steps.
- Do NOT use `if/else`, `for`, `while`, `switch`, `Promise`, `setTimeout`, or any control flow outside of what the DSL provides (Task conditionals via the `if` step pattern)
- Do NOT import from any package other than `@tomationjs/dsl` (except POM file imports using `~/` aliases)
- TypeScript annotations are allowed ONLY for type-checking during authoring (param types, interfaces) — they are stripped at compile time and produce no runtime behavior
- Create Page Object Models (POM) files with `.pom.ts` extension
- Create test files with `.test.ts` extension
- Create automation files with `.automation.ts` extension
- Import from `@tomationjs/dsl`
- Use `~/` path aliases for cross-file imports (e.g., `import Login from '~/pom/login.pom'`)
- Namespace is derived from file path (no `Page()` wrapper needed)
- Export a default object from POM files containing all elements and tasks
- `.where()` and `.childOf()` can be chained in any order
- `.navigate()` can be chained with `.where()`, `.childOf()`, and `.as()` in any order

---

## Where Matchers Reference

| Matcher | Signature | Matches on |
|---------|-----------|-----------|
| `idIs` | `idIs(value: string)` | Element `id` attribute |
| `innerTextIs` | `innerTextIs(value: string)` | Exact text content |
| `innerTextContains` | `innerTextContains(value: string)` | Partial text content |
| `classIncludes` | `classIncludes(value: string)` | CSS class name |
| `placeholderIs` | `placeholderIs(value: string)` | Input placeholder |
| `nameIs` | `nameIs(value: string)` | Element `name` attribute |
| `typeIs` | `typeIs(value: string)` | Input `type` attribute |
| `valueIs` | `valueIs(value: string)` | Element `value` property (current value, not HTML attribute) |
| `ariaLabel` | `ariaLabel(value: string)` | `aria-label` attribute |
| `roleIs` | `roleIs(value: string)` | Explicit `role` attribute |
| `titleIs` | `titleIs(value: string)` | `title` attribute |
| `hrefContains` | `hrefContains(value: string)` | Substring match on `href` attribute |
| `isDisabled` | `isDisabled()` | Element with `disabled` property === true |
| `nthChild` | `nthChild(n: number)` | Nth child position (1-based, like CSS `:nth-child`) |
| `dataAttr` | `dataAttr(name: string, value: string)` | `data-*` attribute (name is suffix only, e.g. `'testid'` not `'data-testid'`) |
| `closestLabelIs` | `closestLabelIs(tag: string, text: string)` | Nearby label element by tag and text content |

---

## DOM Navigation with `.navigate(path)`

When a target element lacks unique identifiers, use `.navigate(path)` to reach it by traversing the DOM from a nearby identifiable anchor element. The method accepts a comma-separated string of navigation steps.

| Step | Description |
|------|-------------|
| `parent` | Traverses to the parent element |
| `child[n]` | Traverses to the nth child element (1-based) |
| `firstChild` | Traverses to the first child element |
| `lastChild` | Traverses to the last child element |
| `nextSibling` | Traverses to the next sibling element |
| `prevSibling` | Traverses to the previous sibling element |
| `sibling[n]` | Traverses to the nth sibling (1-based, via parent's children) |

Example:
```ts
const target = is.DIV.where(idIs('anchor')).navigate('parent,child[2]').as('Target')
const content = is.SPAN.childOf(container).where(innerTextIs('Header')).navigate('nextSibling').as('Content')
```

---

## Actions Reference

| Action | Usage | Description |
|--------|-------|-------------|
| `Click` | `Click(element)` | Click an element |
| `Type` | `Type(value).in(element)` | Type text into an input |
| `TypePassword` | `TypePassword(value).in(element)` | Type password (masked in logs) |
| `Select` | `Select(value).in(element)` | Select dropdown option by value |
| `Upload` | `Upload(filePath).in(element)` | Upload a file to a file input |
| `AssertExists` | `AssertExists(element)` | Assert element is present in DOM |
| `AssertNotExists` | `AssertNotExists(element)` | Assert element is NOT in DOM |
| `AssertHasText` | `AssertHasText(element, text)` | Assert element contains text |
| `Navigate` | `Navigate(url)` | Navigate to a URL |
| `Wait` | `Wait(ms)` | Wait for a specified time in milliseconds |
| `WaitFor` | `WaitFor(element)` | Wait until element appears in DOM |
| `WaitForGone` | `WaitForGone(element)` | Wait until element disappears from DOM |
| `Manual` | `Manual(description)` | Pause execution, display instruction to user |
| `PressKey` | `PressKey(key, options?)` | Press a key globally (not targeted) |
| `Press` | `Press(key, options?).in(element)` | Press a key on a specific element |

Keyboard shortcut functions (no arguments needed):
`PressUp`, `PressDown`, `PressLeft`, `PressRight`, `PressTab`, `PressEnter`, `PressEsc`, `PressSpace`

PressKey/Press options: `{ alt?: boolean, ctrl?: boolean, meta?: boolean, shift?: boolean }`

Available key values (use the `key` string as defined in [KeyboardEvent.key](https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values)):
- Letters: `'a'`–`'z'`, `'A'`–`'Z'`
- Digits: `'0'`–`'9'`
- Function keys: `'F1'`–`'F12'`
- Navigation: `'ArrowUp'`, `'ArrowDown'`, `'ArrowLeft'`, `'ArrowRight'`, `'Home'`, `'End'`, `'PageUp'`, `'PageDown'`
- Editing: `'Backspace'`, `'Delete'`, `'Insert'`
- Whitespace: `'Enter'`, `'Tab'`, `' '` (space)
- UI: `'Escape'`, `'PrintScreen'`, `'ScrollLock'`, `'Pause'`
- Symbols: `'!'`, `'@'`, `'#'`, `'$'`, `'%'`, `'^'`, `'&'`, `'*'`, `'('`, `')'`, `'-'`, `'='`, `'['`, `']'`, `'\\'`, `';'`, `'\''`, `','`, `'.'`, `'/'`, `` '`' ``

Examples:
```ts
PressKey('Enter')                    // Enter key
PressKey('a', { ctrl: true })        // Ctrl+A (select all)
PressKey('c', { meta: true })        // Cmd+C (copy on macOS)
PressKey('F5')                       // F5 (refresh)
PressKey('ArrowDown')                // Down arrow
Press('Tab', { shift: true }).in(el) // Shift+Tab on a specific element
```

---

## Save Actions Reference

| Action | Usage | Description |
|--------|-------|-------------|
| `SaveText` | `SaveText(element).as('keyName')` | Saves element's text content to context |
| `SaveAttribute` | `SaveAttribute(element, 'attrName').as('keyName')` | Saves element's attribute value to context |
| `SaveValue` | `SaveValue(element).as('keyName')` | Saves element's `.value` property to context |
| `Save` | `Save(expression).as('keyName')` | Saves a computed expression to context |

Using saved values in later steps with `{{ctx.keyName}}`:
```ts
SaveText(confirmationCode).as('code')
Type('{{ctx.code}}').in(verificationInput)
Navigate('{{ctx.linkUrl}}')
```

Context values persist for the entire test run across task boundaries, but reset between runs.

---

## Date Helpers

All date helpers accept an optional format string. Default format is `YYYY-MM-DD`.
Supported tokens: `YYYY` (4-digit year), `MM` (zero-padded month), `DD` (zero-padded day), `M` (month), `D` (day).

| Helper | Description |
|--------|-------------|
| `today(format?)` | Today's date |
| `tomorrow(format?)` | +1 day |
| `yesterday(format?)` | -1 day |
| `nextWeek(format?)` | +7 days |
| `lastWeek(format?)` | -7 days |
| `nextMonth(format?)` | +30 days |
| `lastMonth(format?)` | -30 days |
| `firstDateOfMonth(offset, format?)` | 1st day of month (0=current, -1=prev, 1=next) |
| `lastDateOfMonth(offset, format?)` | Last day of month |

Example:
```ts
Type(today()).in(dateInput)                    // 2025-07-06
Type(tomorrow('MM/DD/YYYY')).in(dateInput)    // 07/07/2025
Type(firstDateOfMonth(0, 'M/D/YYYY')).in(dateInput) // 7/1/2025
```

---

## Runtime Template Strings

Template literals with `${}` are evaluated at runtime, enabling dynamic value construction:

```ts
Type(`Hello ${username}`).in(greetingInput)
Type(`Appointment on ${tomorrow()} at ${slot}`).in(noteInput)
Type(`Item ${count + 1}`).in(itemInput)
```

---

## Tasks

Tasks are reusable multi-step workflows declared with `Task(fn).as('label')`:

```ts
const fillCredentials = Task((params: { username: string; password: string }) => {
  const { username, password } = params
  Type(username).in(usernameInput)
  TypePassword(password).in(passwordInput)
}).as('Fill Credentials')
```

Tasks are invoked from tests or other tasks by calling them:
```ts
Login.fillCredentials({ username: 'admin', password: 'secret' })
```

---

## Automations

Automations are parameterized procedures where values are provided at runtime via a form in the browser extension:

```ts
// automations/todo.automation.ts
import { Automation, AssertExists, AssertHasText } from '@tomationjs/dsl'
import Todo from '~/pom/todo.pom'

Automation('Add Todo Item', (params: { item: string }) => {
  Todo.addItem({ text: params.item })
  AssertExists(Todo.firstItem)
  AssertHasText(Todo.firstItemText, params.item)
})
```

Supported parameter types:
- `string` → Text input
- `number` → Number input
- `Date` → Date picker
- `'a' | 'b' | 'c'` → Select dropdown (string union literals)
- Optional params use `?` suffix

---

## Scoping with childOf

When multiple elements match the same criteria, scope with `.childOf(parent)`:

```ts
const loginForm = is.FORM.where(idIs('login-form')).as('Login Form')
const submitButton = is.BUTTON.where(innerTextIs('Submit')).childOf(loginForm).as('Login Submit')

const signupForm = is.FORM.where(idIs('signup-form')).as('Signup Form')
const signupSubmit = is.BUTTON.where(innerTextIs('Submit')).childOf(signupForm).as('Signup Submit')
```

---

## Complete POM Example

```ts
// pom/login.pom.ts
import { Task, Click, Type, TypePassword, is, idIs } from '@tomationjs/dsl'

// --- UI Elements ---
const usernameInput = is.INPUT.where(idIs('username')).as('Username')
const passwordInput = is.INPUT.where(idIs('password')).as('Password')
const submitButton = is.BUTTON.where(idIs('login-btn')).as('Submit')
const errorMessage = is.DIV.where(idIs('error-msg')).as('Error Message')
const message = is.DIV.where(idIs('message')).as('Message')

// --- Tasks ---
const fillCredentials = Task((params: { username: string; password: string }) => {
  const { username, password } = params
  Type(username).in(usernameInput)
  TypePassword(password).in(passwordInput)
}).as('Fill Credentials')

const submit = Task(() => {
  Click(submitButton)
}).as('Submit')

export default { usernameInput, passwordInput, submitButton, errorMessage, message, fillCredentials, submit }
```

---

## Complete Test Example

```ts
// tests/login.test.ts
import { Test, Click, AssertExists, AssertHasText } from '@tomationjs/dsl'
import Login from '~/pom/login.pom'

Test('Login with valid credentials', () => {
  Login.fillCredentials({ username: 'admin', password: 'secret' })
  Login.submit()
  AssertHasText(Login.message, 'Login successful')
})

Test('Login shows error on empty submit', () => {
  Click(Login.submitButton)
  AssertHasText(Login.errorMessage, 'required')
})
```

---

## Config File

```ts
// tomation.config.ts
export default {
  meta: {
    name: 'My App Tests',
    urls: ['http://localhost:3000'],
  },
  pom: './pom',
  tests: './tests',
  automations: './automations', // optional
  baseUrl: './',
}
```

Compile with: `npx tomation compile`
Watch mode: `npx tomation watch`

---

## Test Data & Fake Generators

Data templates produce fresh random values for each test run — no hardcoded strings needed. Define them in `.data.ts` files.

### Defining a Data Template

```ts
// data/user.data.ts
import { Data, Fake } from '@tomationjs/dsl'

const user = Data({
  name: Fake.fullName(),
  email: Fake.email(),
  phone: Fake.phone({ country: 'US' }),
  dob: Fake.dateOfBirth({ minAge: 18, maxAge: 65, format: 'MM/DD/YYYY' }),
  role: Fake.oneOf(['Admin', 'Editor', 'Viewer']),
  address: Fake.address(),
  id: Fake.uuid(),
  notes: Fake.sentence({ minWords: 5, maxWords: 12 }),
  lastVisit: Fake.pastDate({ within: 90 }),
  nextAppt: Fake.futureDate({ within: 30, format: 'MM/DD/YYYY' }),
  patientId: Fake.sequence({ prefix: 'PAT-', pad: 3 }),
  city: 'Springfield',  // static values are also supported
})

export default user
```

### Using Data in Tests

Import and reference properties directly — the compiler handles the rest:

```ts
import { Test, AssertHasText } from '@tomationjs/dsl'
import user from '~/data/user.data'
import Form from '~/pom/form.pom'

Test('Register with generated data', () => {
  Form.fill({ name: user.name, email: user.email })
  Form.submit()
  AssertHasText(Form.message, 'Success')
})
```

### Fake Generator Reference

| Method | Description | Options |
|--------|-------------|---------|
| `Fake.firstName(gender?)` | Random first name | `'male' \| 'female'` |
| `Fake.lastName()` | Random last name | — |
| `Fake.fullName(gender?)` | First + last | `'male' \| 'female'` |
| `Fake.email()` | Random email | — |
| `Fake.phone(options?)` | Phone by country | `{ country: 'US'\|'UK'\|'ES' }` |
| `Fake.dateOfBirth(options?)` | DOB with age range | `{ minAge, maxAge, format }` |
| `Fake.address(part?)` | Address or part | `'full'\|'street'\|'city'\|'country'\|'zip'` |
| `Fake.oneOf(values)` | Pick from array | `string[]` |
| `Fake.number(options?)` | Random number | `{ min, max, decimals }` |
| `Fake.uuid()` | UUID v4 | — |
| `Fake.sentence(options?)` | Random sentence | `{ minWords, maxWords }` |
| `Fake.pastDate(options?)` | Date in the past | `{ within (days), format }` |
| `Fake.futureDate(options?)` | Date in the future | `{ within (days), format }` |
| `Fake.sequence(options?)` | Incremental counter | `{ prefix, pad }` |

### Seed (Reproducible Values)

Pin a seed for deterministic output across runs:

```ts
const user = Data({
  name: Fake.fullName(),
  email: Fake.email(),
}, { seed: 42 })
```

Seeds can also be pinned/unpinned from the extension UI without editing code.

### Configuration

Add a `data` property to `tomation.config.ts`:

```ts
export default {
  pom: './pom',
  tests: './tests',
  data: './data',  // data files directory
}
```

Data files use the `.data.ts` extension and are imported via `~/` aliases.

---

## Naming Convention

Tests and automations are displayed in the extension using the format `sourceFile: label` where:
- `sourceFile` is the relative path from the project root with the `tests/` or `automations/` prefix removed and file extensions stripped (`.test.ts`, `.automation.ts`, etc.)
- `label` is the name passed to `Test()` or `Automation()`

Example: `tests/login.test.ts` with `Test('Login with valid credentials', ...)` displays as `login: Login with valid credentials`
Example: `tests/auth/login.test.ts` displays as `auth/login: Login with valid credentials`
Example: `automations/todo.automation.ts` with `Automation('Add Todo Item', ...)` displays as `todo: Add Todo Item`

This convention is used consistently in the test list, test plan view, and execution log header.
