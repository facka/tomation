'use strict';

/**
 * Unit tests for deriveNamespace().
 *
 * Validates: Requirements 8.1, 8.2, 8.3
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deriveNamespace } = require('./pom.js');

// ---------------------------------------------------------------------------
// Requirement 8.1 — kebab-case to PascalCase conversion
// ---------------------------------------------------------------------------

test('deriveNamespace: single-segment name becomes PascalCase', () => {
  assert.equal(deriveNamespace('/project/pom/login.pom.ts'), 'Login');
});

test('deriveNamespace: multi-segment kebab-case name becomes PascalCase', () => {
  assert.equal(deriveNamespace('/project/pom/user-profile.pom.ts'), 'UserProfile');
});

test('deriveNamespace: three-segment kebab-case name', () => {
  assert.equal(deriveNamespace('/project/pom/my-cool-page.page.ts'), 'MyCoolPage');
});

// ---------------------------------------------------------------------------
// Requirement 8.3 — suffix stripping
// ---------------------------------------------------------------------------

test('deriveNamespace: strips .pom.ts suffix', () => {
  assert.equal(deriveNamespace('/src/login-page.pom.ts'), 'LoginPage');
});

test('deriveNamespace: strips .pom.js suffix', () => {
  assert.equal(deriveNamespace('/src/login-page.pom.js'), 'LoginPage');
});

test('deriveNamespace: strips .page.ts suffix', () => {
  assert.equal(deriveNamespace('/src/login-page.page.ts'), 'LoginPage');
});

test('deriveNamespace: strips .page.js suffix', () => {
  assert.equal(deriveNamespace('/src/login-page.page.js'), 'LoginPage');
});

test('deriveNamespace: strips plain .ts suffix when no compound suffix', () => {
  assert.equal(deriveNamespace('/src/login-page.ts'), 'LoginPage');
});

test('deriveNamespace: strips plain .tsx suffix', () => {
  assert.equal(deriveNamespace('/src/login-page.tsx'), 'LoginPage');
});

test('deriveNamespace: strips plain .js suffix', () => {
  assert.equal(deriveNamespace('/src/login-page.js'), 'LoginPage');
});

// ---------------------------------------------------------------------------
// Requirement 8.2 — underscore rejection
// ---------------------------------------------------------------------------

test('deriveNamespace: throws error for file name with underscores', () => {
  assert.throws(
    () => deriveNamespace('/src/login_page.pom.ts'),
    (err) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes("contains underscores"));
      assert.ok(err.message.includes("login-page"));
      return true;
    }
  );
});

test('deriveNamespace: error message suggests kebab-case equivalent', () => {
  assert.throws(
    () => deriveNamespace('/src/my_cool_page.page.js'),
    (err) => {
      assert.ok(err.message.includes('my-cool-page'));
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('deriveNamespace: works with just a filename (no directory)', () => {
  assert.equal(deriveNamespace('checkout-flow.pom.ts'), 'CheckoutFlow');
});

test('deriveNamespace: handles deeply nested paths', () => {
  assert.equal(deriveNamespace('/a/b/c/d/payment-form.page.ts'), 'PaymentForm');
});
