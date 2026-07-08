// storage.js — storage abstraction over browser.storage.local
// Implementation: Task 10
var api = typeof browser !== 'undefined' ? browser : chrome;

/**
 * Generate a UUID-v4 string using Math.random().
 * ES5-compatible, no external dependencies.
 * @returns {string}
 */
function generateUUID() {
  var template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0;
    var v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get a project by hostname.
 * @param {string} hostname
 * @returns {Promise<object|null>}
 */
function getProject(hostname) {
  return api.storage.local.get(hostname).then(function (result) {
    return result[hostname] || null;
  });
}

/**
 * Save a project object under the given hostname key.
 * @param {string} hostname
 * @param {object} project
 * @returns {Promise<void>}
 */
function saveProject(hostname, project) {
  var data = {};
  data[hostname] = project;
  return api.storage.local.set(data);
}

/**
 * Add a spec to a project. If a spec with the same filename already exists,
 * replace it keeping the original UUID and updating loadedAt.
 * @param {string} hostname
 * @param {string} filename
 * @param {object} spec
 * @returns {Promise<void>}
 */
function addSpec(hostname, filename, spec) {
  return getProject(hostname).then(function (project) {
    if (!project) {
      project = {
        host: hostname,
        name: hostname,
        specs: [],
        lastUsed: new Date().toISOString()
      };
    }

    var existingIndex = -1;
    for (var i = 0; i < project.specs.length; i++) {
      if (project.specs[i].filename === filename) {
        existingIndex = i;
        break;
      }
    }

    if (existingIndex >= 0) {
      // Replace entry keeping original UUID, update loadedAt
      project.specs[existingIndex].loadedAt = new Date().toISOString();
      project.specs[existingIndex].spec = spec;
    } else {
      // New entry with fresh UUID
      project.specs.push({
        id: generateUUID(),
        filename: filename,
        loadedAt: new Date().toISOString(),
        spec: spec
      });
    }

    project.lastUsed = new Date().toISOString();
    return saveProject(hostname, project);
  });
}

/**
 * Delete a spec from a project by spec ID.
 * @param {string} hostname
 * @param {string} specId
 * @returns {Promise<void>}
 */
function deleteSpec(hostname, specId) {
  return getProject(hostname).then(function (project) {
    if (!project) {
      return;
    }

    var filtered = [];
    for (var i = 0; i < project.specs.length; i++) {
      if (project.specs[i].id !== specId) {
        filtered.push(project.specs[i]);
      }
    }
    project.specs = filtered;
    return saveProject(hostname, project);
  });
}

/**
 * Delete an entire project by hostname.
 * @param {string} hostname
 * @returns {Promise<void>}
 */
function deleteProject(hostname) {
  return api.storage.local.remove(hostname);
}

/**
 * Rename a project (update its name field).
 * @param {string} hostname
 * @param {string} newName
 * @returns {Promise<void>}
 */
function renameProject(hostname, newName) {
  return getProject(hostname).then(function (project) {
    if (!project) {
      return;
    }
    project.name = newName;
    return saveProject(hostname, project);
  });
}

/**
 * Get all projects from storage.
 * Returns an object keyed by hostname.
 * @returns {Promise<object>}
 */
function getAllProjects() {
  return api.storage.local.get(null).then(function (result) {
    return result || {};
  });
}

/**
 * Export all storage data as a JSON-serializable object.
 * @returns {Promise<object>}
 */
function exportAll() {
  return api.storage.local.get(null).then(function (result) {
    return result || {};
  });
}

/**
 * Import projects from a previously exported data dump.
 * On hostname conflict, calls conflictCallback(hostname) which should
 * return a Promise resolving to 'merge' or 'replace'.
 * @param {object} data - The imported data object keyed by hostname
 * @param {function} conflictCallback - async callback: (hostname) => Promise<'merge'|'replace'>
 * @returns {Promise<void>}
 */
function importAll(data, conflictCallback) {
  return getAllProjects().then(function (existing) {
    var hostnames = Object.keys(data);
    var index = 0;

    function processNext() {
      if (index >= hostnames.length) {
        return Promise.resolve();
      }

      var hostname = hostnames[index];
      index++;
      var importedProject = data[hostname];

      if (!existing[hostname]) {
        // No conflict — just save directly
        return saveProject(hostname, importedProject).then(processNext);
      }

      // Conflict — ask user via callback
      return conflictCallback(hostname).then(function (choice) {
        if (choice === 'replace') {
          return saveProject(hostname, importedProject).then(processNext);
        }

        // merge: combine specs from both, avoiding duplicate filenames
        var existingProject = existing[hostname];
        var mergedSpecs = existingProject.specs.slice();

        for (var i = 0; i < importedProject.specs.length; i++) {
          var importedSpec = importedProject.specs[i];
          var found = false;
          for (var j = 0; j < mergedSpecs.length; j++) {
            if (mergedSpecs[j].filename === importedSpec.filename) {
              // Replace existing spec keeping original UUID, update loadedAt
              mergedSpecs[j].loadedAt = importedSpec.loadedAt;
              mergedSpecs[j].spec = importedSpec.spec;
              found = true;
              break;
            }
          }
          if (!found) {
            mergedSpecs.push(importedSpec);
          }
        }

        existingProject.specs = mergedSpecs;
        existingProject.lastUsed = new Date().toISOString();
        return saveProject(hostname, existingProject).then(processNext);
      });
    }

    return processNext();
  });
}

/**
 * Default test plan configuration values.
 */
var DEFAULT_TEST_PLAN_CONFIG = {
  allowContinueOnFailure: false,
  allowRetryOnFailure: false,
  executionSpeed: 'NORMAL'
};

/**
 * Valid execution speed values.
 */
var VALID_SPEEDS = ['FAST', 'NORMAL', 'SLOW'];

/**
 * Retrieve a test plan configuration from storage.
 * If the stored value is missing or has an invalid shape (missing fields, wrong types),
 * returns the default configuration.
 * @param {string} key - Storage key in format "config:<specId>:<testIndex>"
 * @returns {Promise<object>}
 */
function getTestPlanConfig(key) {
  return api.storage.local.get(key).then(function (result) {
    var stored = result[key];
    if (!stored || typeof stored !== 'object') {
      return {
        allowContinueOnFailure: DEFAULT_TEST_PLAN_CONFIG.allowContinueOnFailure,
        allowRetryOnFailure: DEFAULT_TEST_PLAN_CONFIG.allowRetryOnFailure,
        executionSpeed: DEFAULT_TEST_PLAN_CONFIG.executionSpeed
      };
    }

    // Validate shape: check each field type
    if (typeof stored.allowContinueOnFailure !== 'boolean' ||
        typeof stored.allowRetryOnFailure !== 'boolean' ||
        typeof stored.executionSpeed !== 'string' ||
        VALID_SPEEDS.indexOf(stored.executionSpeed) === -1) {
      console.warn('getTestPlanConfig: stored config has invalid shape for key "' + key + '", returning defaults');
      return {
        allowContinueOnFailure: DEFAULT_TEST_PLAN_CONFIG.allowContinueOnFailure,
        allowRetryOnFailure: DEFAULT_TEST_PLAN_CONFIG.allowRetryOnFailure,
        executionSpeed: DEFAULT_TEST_PLAN_CONFIG.executionSpeed
      };
    }

    return {
      allowContinueOnFailure: stored.allowContinueOnFailure,
      allowRetryOnFailure: stored.allowRetryOnFailure,
      executionSpeed: stored.executionSpeed
    };
  });
}

/**
 * Persist a test plan configuration to storage.
 * Catches and logs write failures without throwing.
 * @param {string} key - Storage key in format "config:<specId>:<testIndex>"
 * @param {object} config - Configuration object to persist
 * @returns {Promise<void>}
 */
function saveTestPlanConfig(key, config) {
  var data = {};
  data[key] = config;
  return api.storage.local.set(data).catch(function (err) {
    console.error('saveTestPlanConfig: failed to write config for key "' + key + '":', err);
  });
}

/**
 * Persist the last-used parameter values for an Automation.
 * Catches and logs write failures without throwing (silent fail).
 * @param {string} automationName - The Automation label/name
 * @param {object} params - Key-value map of param values
 * @returns {Promise<void>}
 */
function saveParamValues(automationName, params) {
  var key = 'automation_params_' + automationName;
  var data = {};
  data[key] = params;
  return api.storage.local.set(data).catch(function (err) {
    console.error('saveParamValues: failed to write params for "' + automationName + '":', err);
  });
}

/**
 * Retrieve previously stored parameter values for an Automation.
 * Returns null if no stored values exist or on read failure (silent fail).
 * @param {string} automationName - The Automation label/name
 * @returns {Promise<object|null>}
 */
function loadParamValues(automationName) {
  var key = 'automation_params_' + automationName;
  return api.storage.local.get(key).then(function (result) {
    return result[key] || null;
  }).catch(function (err) {
    console.error('loadParamValues: failed to read params for "' + automationName + '":', err);
    return null;
  });
}

// Export for use by other extension scripts and for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateUUID: generateUUID,
    getProject: getProject,
    saveProject: saveProject,
    addSpec: addSpec,
    deleteSpec: deleteSpec,
    deleteProject: deleteProject,
    renameProject: renameProject,
    getAllProjects: getAllProjects,
    exportAll: exportAll,
    importAll: importAll,
    getTestPlanConfig: getTestPlanConfig,
    saveTestPlanConfig: saveTestPlanConfig,
    saveParamValues: saveParamValues,
    loadParamValues: loadParamValues,
    DEFAULT_TEST_PLAN_CONFIG: DEFAULT_TEST_PLAN_CONFIG
  };
}
