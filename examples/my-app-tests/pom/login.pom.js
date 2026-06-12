const { Page, Task, el } = require('@tomation/dsl');

module.exports = Page('Login', {
  elements: {
    usernameInput: el({ tag: 'input', where: { id: 'username' } }),
    passwordInput: el({ tag: 'input', where: { id: 'password' } }),
    submitButton: el({ tag: 'button', where: { id: 'login-btn' } }),
    errorMessage: el({ tag: 'div', where: { id: 'error-msg' } }),
  },
  tasks: {
    fillCredentials: Task([
      type('Login__usernameInput', 'testuser'),
      typePassword('Login__passwordInput', 'secret123'),
    ]),
    submit: Task([
      click('Login__submitButton'),
    ]),
  },
});
