'use strict';

/**
 * Property-based tests for panel.js — Home view rendering.
 *
 * Requirements: 8.3, 8.6
 * // Feature: tomation, Property (8.3, 8.6)
 */

var test = require('node:test');
var assert = require('node:assert/strict');
var fc = require('fast-check');
var fs = require('node:fs');
var path = require('node:path');
var JSDOM = require('jsdom').JSDOM;

var panelJsSource = fs.readFileSync(path.join(__dirname, 'panel.js'), 'utf8');
var storageJsSource = fs.readFileSync(path.join(__dirname, 'storage.js'), 'utf8');

// ---------------------------------------------------------------------------
// Test environment setup
// ---------------------------------------------------------------------------

function createTestEnv() {
  var html = '<!DOCTYPE html><html><body>' +
    '<div id="view-home" class="view active"></div>' +
    '<div id="view-test-plan" class="view">' +
    '  <h2 id="test-plan-title"></h2>' +
    '  <ul id="step-checklist" class="step-checklist"></ul>' +
    '  <div><button id="run-btn" class="btn btn-primary">Run</button>' +
    '  <button id="back-home-btn" class="btn">Back</button></div>' +
    '</div>' +
    '<div id="view-run" class="view"></div>' +
    '<div id="view-error" class="view"><div id="error-message"></div><button id="error-back-btn"></button></div>' +
    '<div id="project-content"></div>' +
    '<div id="warning-banner" class="warning-banner"></div>' +
    '<button id="load-spec-btn"></button>' +
    '<input type="file" id="spec-file-input" />' +
    '<button id="back-home-from-run-btn"></button>' +
    '</body></html>';

  var dom = new JSDOM(html, {
    url: 'http://localhost',
    runScripts: 'dangerously',
    resources: 'usable'
  });

  var window = dom.window;

  var sentMessages = [];
  window.eval('var browser = { ' +
    'runtime: { sendMessage: function(msg) { window.__sentMessages.push(msg); return Promise.resolve(); }, onMessage: { addListener: function() {} } }, ' +
    'tabs: { ' +
    '  query: function(opts, cb) { cb([]); }, ' +
    '  onActivated: { addListener: function() {} }, ' +
    '  onUpdated: { addListener: function() {} } ' +
    '}, ' +
    'storage: { local: { get: function() { return Promise.resolve({}); }, set: function() { return Promise.resolve(); } } } ' +
    '};');

  window.__sentMessages = sentMessages;

  // Load storage.js (provides getProject, addSpec, etc.)
  window.eval(storageJsSource);

  // Override getProject to not actually hit storage
  window.eval('getProject = function() { return Promise.resolve(null); };');

  // Load panel.js
  window.eval(panelJsSource);

  return { dom: dom, window: window, document: window.document, sentMessages: sentMessages };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a safe string for filenames (alphanumeric + dash, 1-20 chars) */
var safeStringArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9\-]{0,19}$/);

/** Generate a test name (non-empty alphanumeric string) */
var testNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{0,29}$/);

/** Generate an array of test objects for a spec */
function testsArb(count) {
  return fc.array(
    fc.record({
      name: testNameArb,
      steps: fc.constant([])
    }),
    { minLength: count, maxLength: count }
  );
}

/** Generate a spec entry with a given number of tests */
var specEntryArb = fc.integer({ min: 0, max: 5 }).chain(function (testCount) {
  return fc.record({
    id: fc.uuid(),
    filename: safeStringArb.map(function (s) { return s + '.json'; }),
    loadedAt: fc.constant(new Date().toISOString()),
    spec: testsArb(testCount).map(function (tests) {
      return {
        format: 'tomation-spec',
        version: 1,
        meta: { name: 'Test', url: '' },
        pageElements: {},
        tasks: {},
        tests: tests
      };
    })
  });
});

/** Generate a project with N spec entries */
var projectArb = fc.integer({ min: 1, max: 10 }).chain(function (n) {
  return fc.array(specEntryArb, { minLength: n, maxLength: n }).map(function (specs) {
    return {
      host: 'example.com',
      name: 'Test Project',
      specs: specs,
      lastUsed: new Date().toISOString()
    };
  });
});

/** Generate a hostname (simple alphanumeric domain) */
var hostnameArb = fc.stringMatching(/^[a-z][a-z0-9]{2,10}\.[a-z]{2,4}$/);

// ---------------------------------------------------------------------------
// Property: Project Rendering — N spec sections and M test items
// Validates: Requirements 8.3
// Feature: tomation, Property (8.3, 8.6)
// ---------------------------------------------------------------------------

test('Property (project rendering): For any project with N specs and M total tests, render produces N spec sections and M test items', async function () {
  await fc.assert(
    fc.asyncProperty(projectArb, async function (project) {
      var env = createTestEnv();
      var expectedSpecCount = project.specs.length;
      var expectedTestCount = 0;
      for (var i = 0; i < project.specs.length; i++) {
        if (project.specs[i].spec && project.specs[i].spec.tests) {
          expectedTestCount += project.specs[i].spec.tests.length;
        }
      }

      // Set currentHostname and override getProject to return our generated project
      env.window.eval('currentHostname = "example.com";');
      env.window.eval('getProject = function() { return Promise.resolve(' + JSON.stringify(project) + '); };');

      // Call renderHomeView
      env.window.eval('renderHomeView();');

      // Wait for the promise chain in renderHomeView to resolve (microtask flush)
      await new Promise(function (resolve) { setTimeout(resolve, 10); });

      var contentEl = env.document.getElementById('project-content');
      var specSections = contentEl.querySelectorAll('.spec-section');
      var testItems = contentEl.querySelectorAll('.test-list li');

      assert.equal(specSections.length, expectedSpecCount,
        'Expected ' + expectedSpecCount + ' spec sections, got ' + specSections.length);
      assert.equal(testItems.length, expectedTestCount,
        'Expected ' + expectedTestCount + ' test items, got ' + testItems.length);
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// Property: meta.url mismatch warning — warning visible when host differs
// Validates: Requirements 8.6
// Feature: tomation, Property (8.3, 8.6)
// ---------------------------------------------------------------------------

test('Property (meta.url mismatch warning): For any spec with meta.url host != currentHostname, warning element is visible', async function () {
  await fc.assert(
    fc.asyncProperty(
      hostnameArb,
      hostnameArb.filter(function (h) { return h.length > 3; }),
      safeStringArb,
      async function (currentHost, specHost, filename) {
        // Ensure the two hostnames are different
        fc.pre(currentHost !== specHost);

        var env = createTestEnv();

        var project = {
          host: currentHost,
          name: 'Test',
          specs: [{
            id: '00000000-0000-4000-8000-000000000001',
            filename: filename + '.json',
            loadedAt: new Date().toISOString(),
            spec: {
              format: 'tomation-spec',
              version: 1,
              meta: { name: 'Test', url: 'https://' + specHost + '/page' },
              pageElements: {},
              tasks: {},
              tests: [{ name: 'Test 1', steps: [] }]
            }
          }],
          lastUsed: new Date().toISOString()
        };

        // Set currentHostname and override getProject
        env.window.eval('currentHostname = ' + JSON.stringify(currentHost) + ';');
        env.window.eval('getProject = function() { return Promise.resolve(' + JSON.stringify(project) + '); };');

        // Call renderHomeView
        env.window.eval('renderHomeView();');

        // Wait for promise chain resolution
        await new Promise(function (resolve) { setTimeout(resolve, 10); });

        var warningEl = env.document.getElementById('warning-banner');
        var hasVisible = warningEl.classList.contains('visible');

        assert.equal(hasVisible, true,
          'Warning banner should be visible when spec host "' + specHost +
          '" differs from current hostname "' + currentHost + '"');
      }
    ),
    { numRuns: 100 }
  );
});
