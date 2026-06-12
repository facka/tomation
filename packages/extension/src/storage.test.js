'use strict';

/**
 * Tests for storage.js — storage abstraction over browser.storage.local.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 */

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Mock browser.storage.local
// ---------------------------------------------------------------------------

var store = {};

global.browser = {
  storage: {
    local: {
      get: function (keys) {
        if (keys === null) {
          // Return all
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

// Need to require storage AFTER setting up the global mock
const storage = require('./storage.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  store = {};
}

function createSampleSpec(name) {
  return {
    format: 'tomation-spec',
    version: 1,
    meta: { name: name || 'test', url: 'http://localhost' },
    pageElements: {},
    tasks: {},
    tests: []
  };
}

// ---------------------------------------------------------------------------
// generateUUID
// ---------------------------------------------------------------------------

test('generateUUID returns a valid UUID-v4 format string', function () {
  var uuid = storage.generateUUID();
  var pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.ok(pattern.test(uuid), 'UUID should match v4 format: ' + uuid);
});

test('generateUUID produces unique values', function () {
  var uuids = {};
  for (var i = 0; i < 100; i++) {
    var uuid = storage.generateUUID();
    assert.ok(!uuids[uuid], 'UUID collision detected');
    uuids[uuid] = true;
  }
});

// ---------------------------------------------------------------------------
// getProject
// ---------------------------------------------------------------------------

test('getProject returns null for non-existent hostname', async function () {
  resetStore();
  var result = await storage.getProject('example.com');
  assert.equal(result, null);
});

test('getProject returns stored project', async function () {
  resetStore();
  var project = { host: 'example.com', name: 'Example', specs: [], lastUsed: '2024-01-01T00:00:00.000Z' };
  store['example.com'] = project;
  var result = await storage.getProject('example.com');
  assert.deepEqual(result, project);
});

// ---------------------------------------------------------------------------
// saveProject
// ---------------------------------------------------------------------------

test('saveProject persists a project under the hostname key', async function () {
  resetStore();
  var project = { host: 'test.com', name: 'Test', specs: [], lastUsed: '2024-01-01T00:00:00.000Z' };
  await storage.saveProject('test.com', project);
  assert.deepEqual(store['test.com'], project);
});

// ---------------------------------------------------------------------------
// addSpec — new spec
// ---------------------------------------------------------------------------

test('addSpec creates project if it does not exist', async function () {
  resetStore();
  var spec = createSampleSpec('myspec');
  await storage.addSpec('newhost.com', 'spec.json', spec);

  var project = store['newhost.com'];
  assert.ok(project, 'project should be created');
  assert.equal(project.host, 'newhost.com');
  assert.equal(project.name, 'newhost.com');
  assert.equal(project.specs.length, 1);
  assert.equal(project.specs[0].filename, 'spec.json');
  assert.deepEqual(project.specs[0].spec, spec);
});

test('addSpec assigns a UUID-v4 id to new spec entry', async function () {
  resetStore();
  await storage.addSpec('host.com', 'test.json', createSampleSpec());

  var project = store['host.com'];
  var pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.ok(pattern.test(project.specs[0].id), 'spec id should be a valid UUID-v4');
});

test('addSpec assigns an ISO 8601 loadedAt timestamp', async function () {
  resetStore();
  var before = new Date().toISOString();
  await storage.addSpec('host.com', 'test.json', createSampleSpec());
  var after = new Date().toISOString();

  var loadedAt = store['host.com'].specs[0].loadedAt;
  assert.ok(loadedAt >= before && loadedAt <= after, 'loadedAt should be recent ISO timestamp');
});

// ---------------------------------------------------------------------------
// addSpec — replace existing filename
// ---------------------------------------------------------------------------

test('addSpec replaces spec with same filename keeping original UUID', async function () {
  resetStore();
  await storage.addSpec('host.com', 'spec.json', createSampleSpec('v1'));

  var originalId = store['host.com'].specs[0].id;
  var originalLoadedAt = store['host.com'].specs[0].loadedAt;

  // Small delay to ensure timestamp differs
  await new Promise(function (resolve) { setTimeout(resolve, 5); });

  await storage.addSpec('host.com', 'spec.json', createSampleSpec('v2'));

  var project = store['host.com'];
  assert.equal(project.specs.length, 1, 'should still have only 1 spec');
  assert.equal(project.specs[0].id, originalId, 'UUID should be preserved');
  assert.equal(project.specs[0].spec.meta.name, 'v2', 'spec content should be updated');
  assert.ok(project.specs[0].loadedAt >= originalLoadedAt, 'loadedAt should be updated');
});

test('addSpec does not replace specs with different filenames', async function () {
  resetStore();
  await storage.addSpec('host.com', 'a.json', createSampleSpec('A'));
  await storage.addSpec('host.com', 'b.json', createSampleSpec('B'));

  var project = store['host.com'];
  assert.equal(project.specs.length, 2);
  assert.equal(project.specs[0].filename, 'a.json');
  assert.equal(project.specs[1].filename, 'b.json');
});

// ---------------------------------------------------------------------------
// deleteSpec
// ---------------------------------------------------------------------------

test('deleteSpec removes a spec by id', async function () {
  resetStore();
  await storage.addSpec('host.com', 'spec.json', createSampleSpec());
  var specId = store['host.com'].specs[0].id;

  await storage.deleteSpec('host.com', specId);

  var project = store['host.com'];
  assert.equal(project.specs.length, 0);
});

test('deleteSpec does nothing for non-existent project', async function () {
  resetStore();
  // Should not throw
  await storage.deleteSpec('missing.com', 'fake-id');
  assert.equal(store['missing.com'], undefined);
});

test('deleteSpec does not remove other specs', async function () {
  resetStore();
  await storage.addSpec('host.com', 'a.json', createSampleSpec('A'));
  await storage.addSpec('host.com', 'b.json', createSampleSpec('B'));

  var specIdA = store['host.com'].specs[0].id;
  await storage.deleteSpec('host.com', specIdA);

  var project = store['host.com'];
  assert.equal(project.specs.length, 1);
  assert.equal(project.specs[0].filename, 'b.json');
});

// ---------------------------------------------------------------------------
// deleteProject
// ---------------------------------------------------------------------------

test('deleteProject removes entire hostname key', async function () {
  resetStore();
  store['target.com'] = { host: 'target.com', name: 'Target', specs: [], lastUsed: '2024-01-01T00:00:00.000Z' };
  store['other.com'] = { host: 'other.com', name: 'Other', specs: [], lastUsed: '2024-01-01T00:00:00.000Z' };

  await storage.deleteProject('target.com');

  assert.equal(store['target.com'], undefined);
  assert.ok(store['other.com'], 'other project should remain');
});

// ---------------------------------------------------------------------------
// renameProject
// ---------------------------------------------------------------------------

test('renameProject updates the name field', async function () {
  resetStore();
  store['host.com'] = { host: 'host.com', name: 'Old Name', specs: [], lastUsed: '2024-01-01T00:00:00.000Z' };

  await storage.renameProject('host.com', 'New Name');

  assert.equal(store['host.com'].name, 'New Name');
});

test('renameProject does nothing for non-existent project', async function () {
  resetStore();
  await storage.renameProject('missing.com', 'Anything');
  assert.equal(store['missing.com'], undefined);
});

// ---------------------------------------------------------------------------
// getAllProjects
// ---------------------------------------------------------------------------

test('getAllProjects returns empty object when storage is empty', async function () {
  resetStore();
  var result = await storage.getAllProjects();
  assert.deepEqual(result, {});
});

test('getAllProjects returns all stored projects', async function () {
  resetStore();
  store['a.com'] = { host: 'a.com', name: 'A', specs: [], lastUsed: '2024-01-01T00:00:00.000Z' };
  store['b.com'] = { host: 'b.com', name: 'B', specs: [], lastUsed: '2024-01-01T00:00:00.000Z' };

  var result = await storage.getAllProjects();
  assert.ok(result['a.com']);
  assert.ok(result['b.com']);
  assert.equal(Object.keys(result).length, 2);
});

// ---------------------------------------------------------------------------
// exportAll
// ---------------------------------------------------------------------------

test('exportAll returns all storage data', async function () {
  resetStore();
  store['x.com'] = { host: 'x.com', name: 'X', specs: [], lastUsed: '2024-01-01T00:00:00.000Z' };

  var result = await storage.exportAll();
  assert.deepEqual(result, store);
});

test('exportAll result is JSON-serializable', async function () {
  resetStore();
  await storage.addSpec('host.com', 'spec.json', createSampleSpec());

  var result = await storage.exportAll();
  var json = JSON.stringify(result);
  var parsed = JSON.parse(json);
  assert.deepEqual(parsed, result);
});

// ---------------------------------------------------------------------------
// importAll
// ---------------------------------------------------------------------------

test('importAll adds new projects without conflict', async function () {
  resetStore();
  var data = {
    'new.com': { host: 'new.com', name: 'New', specs: [{ id: 'abc', filename: 'a.json', loadedAt: '2024-01-01T00:00:00.000Z', spec: createSampleSpec() }], lastUsed: '2024-01-01T00:00:00.000Z' }
  };

  var callbackCalled = false;
  await storage.importAll(data, function () {
    callbackCalled = true;
    return Promise.resolve('merge');
  });

  assert.equal(callbackCalled, false, 'no conflict callback for new projects');
  assert.deepEqual(store['new.com'], data['new.com']);
});

test('importAll calls conflictCallback on hostname conflict and replaces', async function () {
  resetStore();
  store['existing.com'] = { host: 'existing.com', name: 'Old', specs: [{ id: 'old-id', filename: 'old.json', loadedAt: '2024-01-01T00:00:00.000Z', spec: createSampleSpec('old') }], lastUsed: '2024-01-01T00:00:00.000Z' };

  var importedProject = { host: 'existing.com', name: 'Imported', specs: [{ id: 'new-id', filename: 'new.json', loadedAt: '2024-02-01T00:00:00.000Z', spec: createSampleSpec('new') }], lastUsed: '2024-02-01T00:00:00.000Z' };
  var data = { 'existing.com': importedProject };

  var calledWith = null;
  await storage.importAll(data, function (hostname) {
    calledWith = hostname;
    return Promise.resolve('replace');
  });

  assert.equal(calledWith, 'existing.com');
  assert.equal(store['existing.com'].name, 'Imported');
  assert.equal(store['existing.com'].specs.length, 1);
  assert.equal(store['existing.com'].specs[0].filename, 'new.json');
});

test('importAll merges specs on hostname conflict with merge choice', async function () {
  resetStore();
  store['host.com'] = {
    host: 'host.com',
    name: 'Original',
    specs: [
      { id: 'id-a', filename: 'a.json', loadedAt: '2024-01-01T00:00:00.000Z', spec: createSampleSpec('A') }
    ],
    lastUsed: '2024-01-01T00:00:00.000Z'
  };

  var importedProject = {
    host: 'host.com',
    name: 'Imported',
    specs: [
      { id: 'id-b', filename: 'b.json', loadedAt: '2024-02-01T00:00:00.000Z', spec: createSampleSpec('B') }
    ],
    lastUsed: '2024-02-01T00:00:00.000Z'
  };

  await storage.importAll({ 'host.com': importedProject }, function () {
    return Promise.resolve('merge');
  });

  var project = store['host.com'];
  assert.equal(project.name, 'Original', 'name should be preserved from existing on merge');
  assert.equal(project.specs.length, 2, 'should have both specs after merge');
  assert.equal(project.specs[0].filename, 'a.json');
  assert.equal(project.specs[1].filename, 'b.json');
});

test('importAll merge replaces spec with same filename', async function () {
  resetStore();
  store['host.com'] = {
    host: 'host.com',
    name: 'Original',
    specs: [
      { id: 'id-a', filename: 'shared.json', loadedAt: '2024-01-01T00:00:00.000Z', spec: createSampleSpec('v1') }
    ],
    lastUsed: '2024-01-01T00:00:00.000Z'
  };

  var importedProject = {
    host: 'host.com',
    name: 'Imported',
    specs: [
      { id: 'id-new', filename: 'shared.json', loadedAt: '2024-02-01T00:00:00.000Z', spec: createSampleSpec('v2') }
    ],
    lastUsed: '2024-02-01T00:00:00.000Z'
  };

  await storage.importAll({ 'host.com': importedProject }, function () {
    return Promise.resolve('merge');
  });

  var project = store['host.com'];
  assert.equal(project.specs.length, 1, 'should still have 1 spec after merge with same filename');
  assert.equal(project.specs[0].id, 'id-a', 'should keep original UUID');
  assert.equal(project.specs[0].spec.meta.name, 'v2', 'spec content should be updated');
  assert.equal(project.specs[0].loadedAt, '2024-02-01T00:00:00.000Z', 'loadedAt should be from import');
});

test('importAll handles multiple projects with mixed conflicts', async function () {
  resetStore();
  store['a.com'] = { host: 'a.com', name: 'A', specs: [], lastUsed: '2024-01-01T00:00:00.000Z' };

  var data = {
    'a.com': { host: 'a.com', name: 'A-new', specs: [{ id: 'x', filename: 'x.json', loadedAt: '2024-02-01T00:00:00.000Z', spec: createSampleSpec() }], lastUsed: '2024-02-01T00:00:00.000Z' },
    'b.com': { host: 'b.com', name: 'B', specs: [], lastUsed: '2024-02-01T00:00:00.000Z' }
  };

  await storage.importAll(data, function () {
    return Promise.resolve('replace');
  });

  assert.equal(store['a.com'].name, 'A-new', 'conflicting project replaced');
  assert.ok(store['b.com'], 'new project added');
  assert.equal(store['b.com'].name, 'B');
});
