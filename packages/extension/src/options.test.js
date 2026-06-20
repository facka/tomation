'use strict';

/**
 * Tests for options.js — Options Page (Task 20.1)
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 */

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var JSDOM = require('jsdom').JSDOM;

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

var optionsJsSource = fs.readFileSync(path.join(__dirname, 'options.js'), 'utf8');
var storageJsSource = fs.readFileSync(path.join(__dirname, 'storage.js'), 'utf8');

function createTestEnv(mockProjects) {
  var html = '<!DOCTYPE html><html><body>' +
    '<h1>Tomation — Options</h1>' +
    '<div class="toolbar">' +
    '  <button id="export-btn" class="btn btn-primary">Export All</button>' +
    '  <button id="import-btn" class="btn">Import</button>' +
    '  <input type="file" id="import-file-input" class="file-input-hidden" accept=".json" />' +
    '</div>' +
    '<div id="projects-container"></div>' +
    '<div id="conflict-modal" class="modal-overlay">' +
    '  <div class="modal-dialog">' +
    '    <h3>Import Conflict</h3>' +
    '    <p id="conflict-message"></p>' +
    '    <div class="modal-actions">' +
    '      <button id="conflict-merge-btn" class="btn btn-primary">Merge Specs</button>' +
    '      <button id="conflict-replace-btn" class="btn btn-danger">Replace</button>' +
    '    </div>' +
    '  </div>' +
    '</div>' +
    '</body></html>';

  var dom = new JSDOM(html, {
    url: 'http://localhost',
    runScripts: 'dangerously',
    resources: 'usable'
  });

  var window = dom.window;

  // Mock the browser storage API
  var storageData = mockProjects || {};
  window.eval('var browser = { ' +
    'storage: { local: { ' +
    '  get: function(key) { ' +
    '    if (key === null) return Promise.resolve(window.__storageData); ' +
    '    var result = {}; result[key] = window.__storageData[key] || null; return Promise.resolve(result); ' +
    '  }, ' +
    '  set: function(data) { ' +
    '    var keys = Object.keys(data); ' +
    '    for (var i = 0; i < keys.length; i++) { window.__storageData[keys[i]] = data[keys[i]]; } ' +
    '    return Promise.resolve(); ' +
    '  }, ' +
    '  remove: function(key) { delete window.__storageData[key]; return Promise.resolve(); } ' +
    '} } };');

  window.__storageData = storageData;

  // Load storage.js
  window.eval(storageJsSource);

  // Load options.js
  window.eval(optionsJsSource);

  return { dom: dom, window: window, document: window.document };
}

function sampleProjects() {
  return {
    'example.com': {
      host: 'example.com',
      name: 'Example App',
      specs: [
        { id: 'spec-1', filename: 'login.json', loadedAt: '2024-01-15T10:00:00Z', spec: {} },
        { id: 'spec-2', filename: 'signup.json', loadedAt: '2024-01-16T12:00:00Z', spec: {} }
      ],
      lastUsed: '2024-01-16T12:00:00Z'
    },
    'test.org': {
      host: 'test.org',
      name: 'Test Site',
      specs: [
        { id: 'spec-3', filename: 'dashboard.json', loadedAt: '2024-02-01T08:00:00Z', spec: {} }
      ],
      lastUsed: '2024-02-01T08:00:00Z'
    }
  };
}

// Helper to wait for promises to resolve
function flush() {
  return new Promise(function (resolve) {
    setTimeout(resolve, 0);
  });
}

// ---------------------------------------------------------------------------
// Tests: Display projects grouped by hostname (Req 9.1)
// ---------------------------------------------------------------------------

test('renderProjects displays projects grouped by hostname (Req 9.1)', function () {
  var env = createTestEnv(sampleProjects());
  env.window.renderProjects();

  return flush().then(function () {
    var cards = env.document.querySelectorAll('.project-card');
    assert.equal(cards.length, 2);

    var firstHostname = cards[0].getAttribute('data-hostname');
    var secondHostname = cards[1].getAttribute('data-hostname');
    var hostnames = [firstHostname, secondHostname].sort();
    assert.deepEqual(hostnames, ['example.com', 'test.org']);
  });
});

test('renderProjects shows empty state when no projects (Req 9.1)', function () {
  var env = createTestEnv({});
  env.window.renderProjects();

  return flush().then(function () {
    var container = env.document.getElementById('projects-container');
    assert.ok(container.innerHTML.indexOf('No projects found') !== -1);
  });
});

test('renderProjects shows project name and hostname (Req 9.1)', function () {
  var env = createTestEnv(sampleProjects());
  env.window.renderProjects();

  return flush().then(function () {
    var container = env.document.getElementById('projects-container');
    assert.ok(container.innerHTML.indexOf('Example App') !== -1);
    assert.ok(container.innerHTML.indexOf('example.com') !== -1);
  });
});

// ---------------------------------------------------------------------------
// Tests: Rename project (Req 9.2)
// ---------------------------------------------------------------------------

test('rename button exists for each project (Req 9.2)', function () {
  var env = createTestEnv(sampleProjects());
  env.window.renderProjects();

  return flush().then(function () {
    var renameBtns = env.document.querySelectorAll('.rename-project-btn');
    assert.equal(renameBtns.length, 2);
  });
});

test('clicking rename shows inline input with current name (Req 9.2)', function () {
  var env = createTestEnv(sampleProjects());
  env.window.renderProjects();

  return flush().then(function () {
    var renameBtn = env.document.querySelector('.rename-project-btn[data-hostname="example.com"]');
    var event = env.document.createEvent('Event');
    event.initEvent('click', true, true);
    renameBtn.dispatchEvent(event);

    var input = env.document.querySelector('.rename-input');
    assert.ok(input, 'Rename input should appear');
    assert.equal(input.value, 'Example App');
  });
});

// ---------------------------------------------------------------------------
// Tests: Delete project (Req 9.3)
// ---------------------------------------------------------------------------

test('delete project button exists for each project (Req 9.3)', function () {
  var env = createTestEnv(sampleProjects());
  env.window.renderProjects();

  return flush().then(function () {
    var deleteBtns = env.document.querySelectorAll('.delete-project-btn');
    assert.equal(deleteBtns.length, 2);
  });
});

test('delete project calls deleteProject after confirmation (Req 9.3)', function () {
  var env = createTestEnv(sampleProjects());
  env.window.renderProjects();

  // Mock confirm to return true
  env.window.confirm = function () { return true; };

  return flush().then(function () {
    var deleteBtn = env.document.querySelector('.delete-project-btn[data-hostname="test.org"]');
    var event = env.document.createEvent('Event');
    event.initEvent('click', true, true);
    deleteBtn.dispatchEvent(event);

    return flush();
  }).then(function () {
    // test.org should be removed from storage
    assert.equal(env.window.__storageData['test.org'], undefined);
  });
});

test('delete project does not delete when confirmation is cancelled (Req 9.3)', function () {
  var env = createTestEnv(sampleProjects());
  env.window.renderProjects();

  // Mock confirm to return false
  env.window.confirm = function () { return false; };

  return flush().then(function () {
    var deleteBtn = env.document.querySelector('.delete-project-btn[data-hostname="test.org"]');
    var event = env.document.createEvent('Event');
    event.initEvent('click', true, true);
    deleteBtn.dispatchEvent(event);

    return flush();
  }).then(function () {
    // test.org should still be in storage
    assert.ok(env.window.__storageData['test.org']);
  });
});

// ---------------------------------------------------------------------------
// Tests: Delete spec (Req 9.4)
// ---------------------------------------------------------------------------

test('delete spec button exists for each spec (Req 9.4)', function () {
  var env = createTestEnv(sampleProjects());
  env.window.renderProjects();

  return flush().then(function () {
    var specDeleteBtns = env.document.querySelectorAll('.delete-spec-btn');
    // 2 specs in example.com + 1 in test.org = 3
    assert.equal(specDeleteBtns.length, 3);
  });
});

test('delete spec removes spec after confirmation (Req 9.4)', function () {
  var env = createTestEnv(sampleProjects());
  env.window.renderProjects();

  env.window.confirm = function () { return true; };

  return flush().then(function () {
    var specBtn = env.document.querySelector('.delete-spec-btn[data-spec-id="spec-1"]');
    var event = env.document.createEvent('Event');
    event.initEvent('click', true, true);
    specBtn.dispatchEvent(event);

    return flush();
  }).then(function () {
    return flush();
  }).then(function () {
    var project = env.window.__storageData['example.com'];
    assert.equal(project.specs.length, 1);
    assert.equal(project.specs[0].id, 'spec-2');
  });
});

// ---------------------------------------------------------------------------
// Tests: Export All (Req 9.5)
// ---------------------------------------------------------------------------

test('export button triggers JSON download (Req 9.5)', function () {
  var env = createTestEnv(sampleProjects());

  var downloadTriggered = false;
  var downloadFilename = '';

  // Mock URL and click behavior
  env.window.URL.createObjectURL = function () { return 'blob:mock'; };
  env.window.URL.revokeObjectURL = function () {};

  // Override createElement to capture the download
  var origCreate = env.document.createElement.bind(env.document);
  env.document.createElement = function (tag) {
    var el = origCreate(tag);
    if (tag === 'a') {
      el.click = function () {
        downloadTriggered = true;
        downloadFilename = el.download;
      };
    }
    return el;
  };

  env.window.handleExportAll();

  return flush().then(function () {
    assert.ok(downloadTriggered, 'Download should be triggered');
    assert.equal(downloadFilename, 'tomation-export.json');
  });
});

// ---------------------------------------------------------------------------
// Tests: Conflict modal (Req 9.7)
// ---------------------------------------------------------------------------

test('showConflictModal displays modal with hostname (Req 9.7)', function () {
  var env = createTestEnv({});

  var promise = env.window.showConflictModal('example.com');
  var modal = env.document.getElementById('conflict-modal');
  var message = env.document.getElementById('conflict-message');

  assert.ok(modal.classList.contains('visible'), 'Modal should be visible');
  assert.ok(message.textContent.indexOf('example.com') !== -1);

  // Resolve by clicking merge
  var mergeBtn = env.document.getElementById('conflict-merge-btn');
  var event = env.document.createEvent('Event');
  event.initEvent('click', true, true);
  mergeBtn.dispatchEvent(event);

  return promise.then(function (result) {
    assert.equal(result, 'merge');
    assert.ok(!modal.classList.contains('visible'), 'Modal should be hidden after choice');
  });
});

test('showConflictModal resolves with replace when replace is clicked (Req 9.7)', function () {
  var env = createTestEnv({});

  var promise = env.window.showConflictModal('test.org');

  var replaceBtn = env.document.getElementById('conflict-replace-btn');
  var event = env.document.createEvent('Event');
  event.initEvent('click', true, true);
  replaceBtn.dispatchEvent(event);

  return promise.then(function (result) {
    assert.equal(result, 'replace');
  });
});

// ---------------------------------------------------------------------------
// Tests: Utility functions
// ---------------------------------------------------------------------------

test('escapeHtml escapes HTML characters', function () {
  var env = createTestEnv({});
  assert.equal(env.window.escapeHtml('<script>'), '&lt;script&gt;');
  assert.equal(env.window.escapeHtml('"hello"'), '&quot;hello&quot;');
  assert.equal(env.window.escapeHtml('a & b'), 'a &amp; b');
});

test('escapeAttr escapes attribute characters', function () {
  var env = createTestEnv({});
  assert.equal(env.window.escapeAttr("it's"), "it&#39;s");
  assert.equal(env.window.escapeAttr('<b>'), '&lt;b&gt;');
});

test('formatDate formats ISO date string', function () {
  var env = createTestEnv({});
  var result = env.window.formatDate('2024-01-15T10:30:00Z');
  // Just verify it returns a non-empty string (locale-dependent format)
  assert.ok(result.length > 0);
});

test('formatDate returns empty for null input', function () {
  var env = createTestEnv({});
  assert.equal(env.window.formatDate(null), '');
  assert.equal(env.window.formatDate(''), '');
});
