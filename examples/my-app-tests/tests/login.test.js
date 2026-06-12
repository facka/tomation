module.exports = [
  {
    name: 'Login with valid credentials',
    steps: [
      task('Login__fillCredentials'),
      task('Login__submit'),
      assertExists('Login__errorMessage'),
    ],
  },
  {
    name: 'Login shows error on empty submit',
    steps: [
      click('Login__submitButton'),
      assertHasText('Login__errorMessage', 'required'),
    ],
  },
];
