'use strict';

/**
 * Property-based tests for storage.js — configuration storage round-trip.
 *
 * Requirements: 3.11, 3.12
 * // Feature: failure-recovery, Property 6: Configuration Storage Round-Trip
 */

var test = require('node:test');
var assert = require('node:assert/strict');
var fc = require('fast-check');

// ---------------------------------------------------------------------------
// Mock browser.storage.local (same pattern as storage.test.js)
// ---------------------------------------------------------------------------

var store = {};

global.browser = {
  storage: {
    local: {
      get: function (keys) {
        if (keys === null) {
          return Promise.resolve(Object.assign({}, store));
        }
        var result = {};
        if (typeof keys === 'string') {
          if (store[keys] !== undefined) {
            result[keys] = store[keys];
          }
        } else if (Array.isArray(keys)) {
          for (var i = 0; i < keys.length; i++) {
            if (store[keys[i]] !== undefined) {
              result[keys[i]] = store[keys[i]];
            }
          }
        }
        return Promise.resolve(result);
      },
      set: function (data) {
        var keys = Object.keys(data);
        for (var i = 0; i < keys.length; i++) {
          store[keys[i]] = data[keys[i]];
        }
        return Promise.resolve();
      },
      remove: function (key) {
        delete store[key];
        return Promise.resolve();
      }
    }
  }
};

var storage = require('./storage.js');

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a valid execution speed value */
var speedArb = fc.constantFrom('FAST', 'NORMAL', 'SLOW');

/** Generate a valid test plan configuration object */
var configArb = fc.record({
  allowContinueOnFailure: fc.boolean(),
  allowRetryOnFailure: fc.boolean(),
  executionSpeed: speedArb
});

/** Generate a storage key in the expected format */
var keyArb = fc.tuple(
  fc.string({ minLength: 1, maxLength: 20 }).filter(function (s) { return /^[a-zA-Z0-9_-]+$/.test(s); }),
  fc.nat({ max: 99 })
).map(function (pair) {
  return 'config:' + pair[0] + ':' + pair[1];
});

// ---------------------------------------------------------------------------
// Property 6: Configuration Storage Round-Trip
// Feature: failure-recovery, Property 6: Configuration Storage Round-Trip
// ---------------------------------------------------------------------------

test('Property 6a: save then read returns equal config', function () {
  // **Validates: Requirements 3.11, 3.12**
  return fc.assert(
    fc.asyncProperty(keyArb, configArb, function (key, config) {
      // Clear store before each iteration
      store = {};
      return storage.saveTestPlanConfig(key, config).then(function () {
        return storage.getTestPlanConfig(key);
      }).then(function (result) {
        assert.deepEqual(result, config);
      });
    }),
    { numRuns: 100 }
  );
});

test('Property 6b: corrupted or missing storage returns default config', function () {
  // **Validates: Requirements 3.11, 3.12**

  /** Generate corrupted config values (wrong types, missing fields, invalid speed) */
  var corruptedArb = fc.oneof(
    // null or undefined stored
    fc.constant(null),
    fc.constant(undefined),
    // non-object values
    fc.string(),
    fc.integer(),
    fc.boolean(),
    // object with missing fields
    fc.record({
      allowContinueOnFailure: fc.boolean()
    }),
    // object with wrong types
    fc.record({
      allowContinueOnFailure: fc.string(),
      allowRetryOnFailure: fc.string(),
      executionSpeed: fc.string()
    }),
    // object with invalid speed value
    fc.record({
      allowContinueOnFailure: fc.boolean(),
      allowRetryOnFailure: fc.boolean(),
      executionSpeed: fc.constantFrom('INVALID', 'fast', 'slow', '', 'TURBO')
    })
  );

  return fc.assert(
    fc.asyncProperty(keyArb, corruptedArb, function (key, corruptedValue) {
      // Directly inject corrupted value into store
      store = {};
      if (corruptedValue !== undefined) {
        store[key] = corruptedValue;
      }
      return storage.getTestPlanConfig(key).then(function (result) {
        assert.deepEqual(result, storage.DEFAULT_TEST_PLAN_CONFIG);
      });
    }),
    { numRuns: 100 }
  );
});
