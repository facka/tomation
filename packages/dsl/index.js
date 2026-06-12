// @tomation/dsl — runtime stubs

/**
 * Defines a Page Object Model.
 * @param {string} name - The page name used for namespacing.
 * @param {object} definition - The page definition containing elements and tasks.
 * @returns {{ __pom: true, name: string, definition: object }}
 */
function Page(name, definition) {
  return { __pom: true, name: name, definition: definition };
}

/**
 * Defines a reusable task.
 * @param {Array} steps - The ordered list of steps.
 * @returns {{ __task: true, steps: Array }}
 */
function Task(steps) {
  return { __task: true, steps: steps };
}

/**
 * Defines an element descriptor.
 * @param {object} descriptor - The element descriptor object.
 * @returns {{ __el: true, [key: string]: any }}
 */
function el(descriptor) {
  return Object.assign({ __el: true }, descriptor);
}

module.exports = { Page: Page, Task: Task, el: el };
