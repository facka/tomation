// panel.js — sidebar UI
// Implementation: Tasks 17, 18, 19
var api = typeof browser !== 'undefined' ? browser : chrome;

// --- State ---
var currentHostname = null;
var currentProject = null;
var currentSpec = null;
var currentTest = null;
var currentTestIndex = -1;
var currentRunnable = null; // { type: 'test'|'automation', index: number, data: object }
var isRunning = false;
var currentRunConfig = null;
var currentRunAutomationParams = null; // params used in the current automation run (for persistence)
var currentFavourites = {};

// --- Search Filter ---

/**
 * Pure function: filter test/automation names by case-insensitive substring match.
 * @param {string[]} names - Test or automation names
 * @param {string} query
 * @returns {string[]}
 */
function filterTests(names, query) {
  if (!query) return names;
  var lowerQuery = query.toLowerCase();
  return names.filter(function(name) {
    return name.toLowerCase().indexOf(lowerQuery) !== -1;
  });
}

/**
 * Apply search filter to the rendered items in the currently active tab.
 * Hides/shows items, spec section headers, and empty state within the active tab only.
 */
function applySearchFilter() {
  var activeTab = document.querySelector('.tab-content.active');
  if (!activeTab) return;

  var searchInput = activeTab.querySelector('.tab-search-input');
  var query = searchInput ? searchInput.value : '';
  var lowerQuery = query ? query.toLowerCase() : '';

  var sections = activeTab.querySelectorAll('.spec-section');
  var totalVisible = 0;

  for (var i = 0; i < sections.length; i++) {
    var section = sections[i];
    var items = section.querySelectorAll('.test-list li');
    var sectionVisible = 0;

    for (var j = 0; j < items.length; j++) {
      var li = items[j];
      var name = li.textContent || '';
      if (!lowerQuery || name.toLowerCase().indexOf(lowerQuery) !== -1) {
        li.style.display = '';
        sectionVisible++;
      } else {
        li.style.display = 'none';
      }
    }

    if (sectionVisible > 0 || !lowerQuery) {
      section.style.display = '';
    } else {
      section.style.display = 'none';
    }

    totalVisible += sectionVisible;
  }

  // Show/hide empty state within the active tab
  var emptyState = activeTab.querySelector('.search-empty-state');
  if (emptyState) {
    if (lowerQuery && totalVisible === 0) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
    }
  }
}

// --- View Navigation ---

/**
 * Show a specific view container and hide all others.
 * @param {string} viewName - One of: 'home', 'test-plan', 'run', 'error'
 */
function showView(viewName) {
  var views = document.querySelectorAll('.view');
  for (var i = 0; i < views.length; i++) {
    views[i].classList.remove('active');
  }
  var target = document.getElementById('view-' + viewName);
  if (target) {
    target.classList.add('active');
  }
}

// --- Tab Switching ---

/**
 * Switch the active tab in the home view.
 * Toggles .active class on tab buttons and content containers,
 * and persists the selection to storage.
 * @param {string} tabName - 'tests' or 'automations'
 */
function switchTab(tabName) {
  var tabButtons = document.querySelectorAll('.tab-btn');
  for (var i = 0; i < tabButtons.length; i++) {
    if (tabButtons[i].getAttribute('data-tab') === tabName) {
      tabButtons[i].classList.add('active');
    } else {
      tabButtons[i].classList.remove('active');
    }
  }

  var testsContent = document.getElementById('tab-content-tests');
  var automationsContent = document.getElementById('tab-content-automations');

  if (testsContent) {
    if (tabName === 'tests') {
      testsContent.classList.add('active');
    } else {
      testsContent.classList.remove('active');
    }
  }

  if (automationsContent) {
    if (tabName === 'automations') {
      automationsContent.classList.add('active');
    } else {
      automationsContent.classList.remove('active');
    }
  }

  saveActiveTab(tabName);

  // Re-apply search filter from the newly active tab's search input
  applySearchFilter();
}

// --- Inline Spec Validator (lightweight UI-level guard) ---

/**
 * Validate a parsed spec object. Checks format, version, required fields,
 * and basic structural integrity.
 * @param {object} obj
 * @returns {{ ok: boolean, spec?: object, error?: string }}
 */
function validateSpec(obj) {
  if (!obj || typeof obj !== 'object') {
    return { ok: false, error: 'Spec must be a JSON object' };
  }
  if (obj.format !== 'tomation-spec') {
    return { ok: false, error: 'Invalid or missing format field (expected "tomation-spec")' };
  }
  if (obj.version !== 1) {
    return { ok: false, error: 'Unsupported spec version (expected 1)' };
  }
  if (!obj.pageElements || typeof obj.pageElements !== 'object') {
    return { ok: false, error: 'Missing required field: pageElements' };
  }
  if (!obj.tasks || typeof obj.tasks !== 'object') {
    return { ok: false, error: 'Missing required field: tasks' };
  }
  if (!Array.isArray(obj.tests)) {
    return { ok: false, error: 'Missing required field: tests' };
  }

  // Validate pageElements entries
  var peKeys = Object.keys(obj.pageElements);
  for (var i = 0; i < peKeys.length; i++) {
    var entry = obj.pageElements[peKeys[i]];
    if (!entry || !entry.tag) {
      return { ok: false, error: 'pageElements entry "' + peKeys[i] + '" missing tag field' };
    }
    if (!entry.where || typeof entry.where !== 'object' || Object.keys(entry.where).length === 0) {
      return { ok: false, error: 'pageElements entry "' + peKeys[i] + '" missing or empty where object' };
    }
  }

  // Validate tasks entries
  var taskKeys = Object.keys(obj.tasks);
  for (var j = 0; j < taskKeys.length; j++) {
    var taskEntry = obj.tasks[taskKeys[j]];
    if (!taskEntry || !Array.isArray(taskEntry.steps)) {
      return { ok: false, error: 'tasks entry "' + taskKeys[j] + '" missing steps array' };
    }
  }

  // Validate tests entries
  for (var k = 0; k < obj.tests.length; k++) {
    var testEntry = obj.tests[k];
    if (!testEntry || typeof testEntry.name !== 'string') {
      return { ok: false, error: 'tests entry at index ' + k + ' missing name field' };
    }
    if (!Array.isArray(testEntry.steps)) {
      return { ok: false, error: 'tests entry "' + testEntry.name + '" missing steps array' };
    }
  }

  // Validate automations entries (if present)
  if (obj.automations !== undefined) {
    if (!Array.isArray(obj.automations)) {
      return { ok: false, error: 'automations field must be an array' };
    }
    var validParamTypes = ['string', 'number', 'date', 'enum'];
    for (var a = 0; a < obj.automations.length; a++) {
      var autoEntry = obj.automations[a];
      if (!autoEntry || typeof autoEntry.name !== 'string') {
        return { ok: false, error: 'automations entry at index ' + a + ' missing name field' };
      }
      if (!Array.isArray(autoEntry.params)) {
        return { ok: false, error: 'automations entry "' + autoEntry.name + '" missing params array' };
      }
      if (!Array.isArray(autoEntry.steps)) {
        return { ok: false, error: 'automations entry "' + autoEntry.name + '" missing steps array' };
      }
      // Validate each param entry
      for (var p = 0; p < autoEntry.params.length; p++) {
        var param = autoEntry.params[p];
        if (!param || typeof param.name !== 'string') {
          return { ok: false, error: 'automations entry "' + autoEntry.name + '" param at index ' + p + ' missing name field' };
        }
        if (validParamTypes.indexOf(param.type) === -1) {
          return { ok: false, error: 'automations entry "' + autoEntry.name + '" param "' + param.name + '" has invalid type "' + param.type + '" (expected one of: string, number, date, enum)' };
        }
        // Validate enum params have a non-empty options array of strings
        if (param.type === 'enum') {
          if (!Array.isArray(param.options) || param.options.length === 0) {
            return { ok: false, error: 'automations entry "' + autoEntry.name + '" param "' + param.name + '" with type "enum" must have a non-empty options array' };
          }
          for (var o = 0; o < param.options.length; o++) {
            if (typeof param.options[o] !== 'string') {
              return { ok: false, error: 'automations entry "' + autoEntry.name + '" param "' + param.name + '" options must all be strings' };
            }
          }
        }
        // Validate optional fields only when present
        if (param.optional !== undefined && typeof param.optional !== 'boolean') {
          return { ok: false, error: 'automations entry "' + autoEntry.name + '" param "' + param.name + '" optional field must be a boolean' };
        }
        if (param.defaultValue !== undefined && typeof param.defaultValue !== 'string') {
          return { ok: false, error: 'automations entry "' + autoEntry.name + '" param "' + param.name + '" defaultValue field must be a string' };
        }
        if (param.options !== undefined && param.type !== 'enum') {
          // options field present but type is not enum — still validate it's an array of strings
          if (!Array.isArray(param.options)) {
            return { ok: false, error: 'automations entry "' + autoEntry.name + '" param "' + param.name + '" options field must be an array' };
          }
        }
      }
    }
  }

  return { ok: true, spec: obj };
}

/**
 * Sort automations so that favourited items appear first, preserving relative order
 * within each group (stable partition).
 * @param {Array} automations - Array of automation objects (each has .name property)
 * @param {Object} favourites - Object map { automationName: true }
 * @returns {Array} New array with favourited items first, then non-favourited items
 */
function sortAutomationsWithFavourites(automations, favourites) {
  var favs = [];
  var nonFavs = [];
  for (var i = 0; i < automations.length; i++) {
    if (favourites[automations[i].name] === true) {
      favs.push(automations[i]);
    } else {
      nonFavs.push(automations[i]);
    }
  }
  return favs.concat(nonFavs);
}

// --- Quick Run Helpers ---

/**
 * Returns an array of all step indices [0, 1, 2, ..., steps.length - 1].
 * @param {Array} steps - array of step objects
 * @returns {number[]}
 */
function buildAllStepsChecked(steps) {
  var result = [];
  for (var i = 0; i < steps.length; i++) {
    result.push(i);
  }
  return result;
}

/**
 * Returns an object with default values for each parameter based on its type.
 * - string → empty string
 * - number → 0
 * - date → today's date in YYYY-MM-DD format
 * - enum → first option value
 * @param {Array} params - array of parameter definition objects
 * @returns {object}
 */
function buildDefaultParams(params) {
  var result = {};
  for (var i = 0; i < params.length; i++) {
    var param = params[i];
    var type = param.type;
    if (type === 'string') {
      result[param.name] = '';
    } else if (type === 'number') {
      result[param.name] = 0;
    } else if (type === 'date') {
      var now = new Date();
      var yyyy = now.getFullYear();
      var mm = String(now.getMonth() + 1);
      if (mm.length < 2) mm = '0' + mm;
      var dd = String(now.getDate());
      if (dd.length < 2) dd = '0' + dd;
      result[param.name] = yyyy + '-' + mm + '-' + dd;
    } else if (type === 'enum') {
      result[param.name] = (param.options && param.options.length > 0) ? param.options[0] : '';
    }
  }
  return result;
}

/**
 * Returns true if any non-optional parameter has no saved value.
 * @param {Array} params - array of parameter definition objects
 * @param {object|null} savedValues - object of saved param values, or null
 * @returns {boolean}
 */
function hasRequiredParamsWithoutValues(params, savedValues) {
  for (var i = 0; i < params.length; i++) {
    var param = params[i];
    if (param.optional === true) continue;
    if (!savedValues || savedValues[param.name] === undefined || savedValues[param.name] === null || savedValues[param.name] === '') {
      return true;
    }
  }
  return false;
}

/**
 * Quick Run a test: sets state, builds config, sends RUN_TEST message, switches to run view.
 * @param {number} specIndex - index into currentProject.specs
 * @param {number} testIndex - index into spec.tests
 */
function quickRunTest(specIndex, testIndex) {
  if (!currentProject || !currentProject.specs[specIndex]) return;

  var specEntry = currentProject.specs[specIndex];
  var test = specEntry.spec.tests && specEntry.spec.tests[testIndex];
  if (!test) return;

  // Set global state (same as onTestItemClick for tests)
  currentSpec = specEntry;
  currentTest = test;
  currentTestIndex = testIndex;
  currentRunnable = { type: 'test', index: testIndex, data: test };

  var checkedSteps = buildAllStepsChecked(test.steps);
  var configKey = 'config:' + currentSpec.id + ':' + testIndex;

  getTestPlanConfig(configKey).then(function (savedConfig) {
    var config = {
      allowContinueOnFailure: true,
      allowRetryOnFailure: true,
      executionSpeed: savedConfig.executionSpeed || 'NORMAL'
    };

    currentRunConfig = config;

    api.runtime.sendMessage({
      type: 'RUN_TEST',
      testIndex: testIndex,
      checkedSteps: checkedSteps,
      config: config
    });

    switchToRunView();
  });
}

/**
 * Quick Run an automation: load saved params, merge with defaults, and execute.
 * If required params have no saved values, navigates to plan view instead.
 * @param {number} specIndex - index into currentProject.specs
 * @param {number} automationIndex - index into spec.automations
 */
function quickRunAutomation(specIndex, automationIndex) {
  if (!currentProject) return;
  if (!currentProject.specs[specIndex]) return;
  var specEntry = currentProject.specs[specIndex];
  if (!specEntry.spec || !specEntry.spec.automations || !specEntry.spec.automations[automationIndex]) return;

  var automation = specEntry.spec.automations[automationIndex];

  // Set global state (same as onTestItemClick for automations)
  currentSpec = specEntry;
  currentTest = automation;
  currentTestIndex = automationIndex;
  currentRunnable = { type: 'automation', index: automationIndex, data: automation };

  var params = automation.params || [];

  loadParamValues(automation.name).then(function (savedValues) {
    // If required params have no saved values, fall back to plan view
    if (hasRequiredParamsWithoutValues(params, savedValues)) {
      showView('test-plan');
      var titleEl = document.getElementById('test-plan-title');
      if (titleEl) {
        titleEl.textContent = automation.name;
      }
      renderTestPlan();
      return;
    }

    // Merge saved values with defaults
    var mergedParams = buildDefaultParams(params);
    if (savedValues) {
      var keys = Object.keys(savedValues);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (savedValues[k] !== null && savedValues[k] !== undefined) {
          mergedParams[k] = savedValues[k];
        }
      }
    }

    var checkedSteps = buildAllStepsChecked(automation.steps || []);

    var configKey = 'config:' + currentSpec.id + ':' + automationIndex;
    getTestPlanConfig(configKey).then(function (savedConfig) {
      var config = {
        allowContinueOnFailure: true,
        allowRetryOnFailure: true,
        executionSpeed: savedConfig.executionSpeed || 'NORMAL'
      };

      currentRunConfig = config;
      currentRunAutomationParams = { name: automation.name, params: mergedParams };

      api.runtime.sendMessage({
        type: 'RUN_AUTOMATION',
        automationIndex: automationIndex,
        params: mergedParams,
        checkedSteps: checkedSteps,
        config: config
      });

      switchToRunView();
    });
  });
}

/**
 * Click handler for Quick Run buttons. Stops propagation to prevent row click,
 * reads runnable type from the parent <li>, and delegates to the appropriate runner.
 * @param {Event} e - click event on a .quick-run-btn element
 */
function onFavouriteClick(e) {
  e.stopPropagation();
  var li = e.currentTarget.parentElement;
  if (!li || !currentProject) return;
  var specIndex = parseInt(li.getAttribute('data-spec-index'), 10);
  var automationIndex = parseInt(li.getAttribute('data-automation-index'), 10);
  var automationName = currentProject.specs[specIndex].spec.automations[automationIndex].name;

  if (currentFavourites[automationName]) {
    delete currentFavourites[automationName];
  } else {
    currentFavourites[automationName] = true;
  }

  saveFavourites(currentHostname, currentFavourites);
  renderAutomationsTab(currentProject.specs, currentFavourites);
}

function onQuickRunClick(e) {
  e.stopPropagation();
  var li = e.currentTarget.parentElement;
  if (!li) return;
  var runnableType = li.getAttribute('data-runnable-type');
  var specIndex = parseInt(li.getAttribute('data-spec-index'), 10);

  if (runnableType === 'test') {
    var testIndex = parseInt(li.getAttribute('data-test-index'), 10);
    quickRunTest(specIndex, testIndex);
  } else if (runnableType === 'automation') {
    var automationIndex = parseInt(li.getAttribute('data-automation-index'), 10);
    quickRunAutomation(specIndex, automationIndex);
  }
}

// --- Home View Rendering ---

/**
 * Render test items into the #tab-content-tests container (after the search input).
 * Adds empty state message when no tests exist.
 * @param {Array} specs - project.specs array
 */
function renderTestsTab(specs) {
  var container = document.getElementById('tab-content-tests');
  if (!container) return;

  // Remove any previously rendered content (keep the search wrapper)
  var existing = container.querySelectorAll('.spec-section, .tab-empty-state');
  for (var r = 0; r < existing.length; r++) {
    existing[r].parentNode.removeChild(existing[r]);
  }

  var hasAnyTests = false;

  for (var i = 0; i < specs.length; i++) {
    var specData = specs[i].spec;
    var hasTests = specData && specData.tests && specData.tests.length > 0;

    if (hasTests) {
      hasAnyTests = true;
      var section = document.createElement('div');
      section.className = 'spec-section';
      var ul = document.createElement('ul');
      ul.className = 'test-list';

      for (var j = 0; j < specData.tests.length; j++) {
        var li = document.createElement('li');
        li.setAttribute('data-spec-index', String(i));
        li.setAttribute('data-test-index', String(j));
        li.setAttribute('data-runnable-type', 'test');

        var rowLabel = document.createElement('span');
        rowLabel.className = 'row-label';
        rowLabel.textContent = specData.tests[j].name;
        li.appendChild(rowLabel);

        var qrBtn = document.createElement('button');
        qrBtn.className = 'quick-run-btn';
        qrBtn.title = 'Quick Run';
        qrBtn.textContent = '▶';
        li.appendChild(qrBtn);
        qrBtn.addEventListener('click', onQuickRunClick);

        li.addEventListener('click', onTestItemClick);
        ul.appendChild(li);
      }

      section.appendChild(ul);
      container.appendChild(section);
    }
  }

  if (!hasAnyTests) {
    var emptyMsg = document.createElement('p');
    emptyMsg.className = 'tab-empty-state';
    emptyMsg.textContent = 'No tests available';
    container.appendChild(emptyMsg);
  }
}

/**
 * Render automation items into the #tab-content-automations container (after the search input).
 * Sorts automations by favourites if sortAutomationsWithFavourites is available.
 * Adds empty state message when no automations exist.
 * @param {Array} specs - project.specs array
 * @param {object} favourites - favourites map { automationName: true }
 */
function renderAutomationsTab(specs, favourites) {
  var container = document.getElementById('tab-content-automations');
  if (!container) return;

  // Remove any previously rendered content (keep the search wrapper)
  var existing = container.querySelectorAll('.spec-section, .tab-empty-state');
  for (var r = 0; r < existing.length; r++) {
    existing[r].parentNode.removeChild(existing[r]);
  }

  var hasAnyAutomations = false;

  for (var i = 0; i < specs.length; i++) {
    var specData = specs[i].spec;
    var hasAutomations = specData && specData.automations && specData.automations.length > 0;

    if (hasAutomations) {
      hasAnyAutomations = true;

      // Build automations array with original indices for sorting
      var automations = [];
      for (var a = 0; a < specData.automations.length; a++) {
        automations.push({ data: specData.automations[a], index: a, name: specData.automations[a].name || '' });
      }

      // Sort by favourites if the function exists
      if (typeof sortAutomationsWithFavourites === 'function') {
        automations = sortAutomationsWithFavourites(automations, favourites);
      }

      var section = document.createElement('div');
      section.className = 'spec-section';
      var ul = document.createElement('ul');
      ul.className = 'test-list';

      for (var b = 0; b < automations.length; b++) {
        var autoObj = automations[b];
        var autoData = autoObj.data;
        var autoIndex = autoObj.index;
        var autoName = autoData.name || '';
        var autoDisplayName = autoName.indexOf('__') !== -1 ? autoName.split('__').slice(1).join('__') : autoName;
        var isFav = !!(favourites && favourites[autoName]);

        var li = document.createElement('li');
        li.setAttribute('data-spec-index', String(i));
        li.setAttribute('data-automation-index', String(autoIndex));
        li.setAttribute('data-runnable-type', 'automation');
        li.className = 'automation-item';

        var favBtn = document.createElement('button');
        favBtn.className = 'favourite-btn';
        favBtn.setAttribute('data-favourite', isFav ? 'true' : 'false');
        favBtn.title = 'Favourite';
        favBtn.textContent = isFav ? '★' : '☆';
        favBtn.addEventListener('click', onFavouriteClick);
        li.appendChild(favBtn);

        var rowLabel = document.createElement('span');
        rowLabel.className = 'row-label';
        rowLabel.innerHTML = escapeHtml(autoDisplayName);
        li.appendChild(rowLabel);

        var qrBtn = document.createElement('button');
        qrBtn.className = 'quick-run-btn';
        qrBtn.title = 'Quick Run';
        qrBtn.textContent = '▶';
        li.appendChild(qrBtn);
        qrBtn.addEventListener('click', onQuickRunClick);

        li.addEventListener('click', onTestItemClick);
        ul.appendChild(li);
      }

      section.appendChild(ul);
      container.appendChild(section);
    }
  }

  if (!hasAnyAutomations) {
    var emptyMsg = document.createElement('p');
    emptyMsg.className = 'tab-empty-state';
    emptyMsg.textContent = 'No automations available';
    container.appendChild(emptyMsg);
  }
}

/**
 * Render the home view for a given hostname.
 * Loads the project from storage and displays specs/tests or a create form.
 */
function renderHomeView() {
  var contentEl = document.getElementById('project-content');
  var warningEl = document.getElementById('warning-banner');
  var landingEl = document.getElementById('home-landing');
  var loadedEl = document.getElementById('home-loaded');

  if (!contentEl && !loadedEl) return;

  warningEl.classList.remove('visible');
  warningEl.textContent = '';

  if (!currentHostname) {
    // Show landing page
    if (landingEl) landingEl.style.display = '';
    if (loadedEl) loadedEl.style.display = 'none';
    return;
  }

  getProject(currentHostname).then(function (project) {
    currentProject = project;

    if (!project || !project.specs || project.specs.length === 0) {
      // Show landing page
      if (landingEl) landingEl.style.display = '';
      if (loadedEl) loadedEl.style.display = 'none';
      return;
    }

    // Switch to loaded state
    if (landingEl) landingEl.style.display = 'none';
    if (loadedEl) loadedEl.style.display = '';

    // Update loaded header with first spec's meta info
    var firstSpec = project.specs[0];
    var spec = firstSpec.spec;
    var nameEl = document.getElementById('loaded-spec-name');
    var descEl = document.getElementById('loaded-spec-description');
    var fileInfoEl = document.getElementById('loaded-spec-file-info');

    if (nameEl) {
      nameEl.textContent = (spec && spec.meta && spec.meta.name) ? spec.meta.name : firstSpec.filename;
    }
    if (descEl) {
      var desc = (spec && spec.meta && spec.meta.description) ? spec.meta.description : '';
      descEl.textContent = desc;
      descEl.style.display = desc ? '' : 'none';
    }
    if (fileInfoEl) {
      var version = (spec && spec.meta && spec.meta.compilerVersion) ? spec.meta.compilerVersion : '';
      fileInfoEl.textContent = firstSpec.filename + (version ? ' (v' + version + ')' : '');
    }

    // Check meta.urls warning for each spec
    for (var i = 0; i < project.specs.length; i++) {
      var specEntry = project.specs[i];
      var specData = specEntry.spec;

      if (specData && specData.meta) {
        var urls = specData.meta.urls || (specData.meta.url ? [specData.meta.url] : []);
        if (urls.length > 0) {
          try {
            var anyMatch = urls.some(function (u) {
              var h = getHostFromUrl(u).trim().toLowerCase();
              return h && h.includes(currentHostname.trim().toLowerCase());
            });
            if (!anyMatch) {
              warningEl.textContent = 'Warning: Spec "' + escapeHtml(specEntry.filename) +
                '" targets ' + escapeHtml(urls.join(', ')) +
                ' but current tab is ' + escapeHtml(currentHostname);
              warningEl.classList.add('visible');
            }
          } catch (e) {
            // ignore parse errors for meta.urls
          }
        }
      }
    }

    // Load favourites and render both tabs
    loadFavourites(currentHostname).then(function (favourites) {
      currentFavourites = favourites;
      renderTestsTab(project.specs);
      renderAutomationsTab(project.specs, favourites);

      // Restore last active tab
      loadActiveTab().then(function (tabName) {
        switchTab(tabName || 'tests');
      });
    });
  });
}

/**
 * Handle click on a test or automation item — navigate to Test Plan view.
 */
function onTestItemClick(e) {
  var li = e.currentTarget;
  var specIndex = parseInt(li.getAttribute('data-spec-index'), 10);
  var runnableType = li.getAttribute('data-runnable-type') || 'test';

  if (!currentProject || !currentProject.specs[specIndex]) return;

  currentSpec = currentProject.specs[specIndex];

  if (runnableType === 'automation') {
    var automationIndex = parseInt(li.getAttribute('data-automation-index'), 10);
    var automation = currentSpec.spec.automations[automationIndex];
    currentRunnable = { type: 'automation', index: automationIndex, data: automation };
    currentTest = automation;
    currentTestIndex = automationIndex;
  } else {
    var testIndex = parseInt(li.getAttribute('data-test-index'), 10);
    var test = currentSpec.spec.tests[testIndex];
    currentRunnable = { type: 'test', index: testIndex, data: test };
    currentTest = test;
    currentTestIndex = testIndex;
  }

  showView('test-plan');
  var titleEl = document.getElementById('test-plan-title');
  if (titleEl && currentRunnable) {
    titleEl.textContent = currentRunnable.data.name;
  }
  renderTestPlan();
}

// --- Test Plan View ---

/**
 * Capitalize the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Build a step label as an HTML string with the element target in a separate badge span.
 * The action name is capitalized. The element label is rendered as a styled badge
 * with a title tooltip for hover details.
 * @param {object} step
 * @param {object} [pageElements] - spec.pageElements for label lookup
 * @returns {string} HTML string
 */
function buildStepLabelHtml(step, pageElements) {
  if (step.action === 'task' && step.name) {
    var taskLabel = step.name.replace('__', '.');
    return '<span class="step-action">Task</span> ' + escapeHtml(taskLabel);
  }

  var html = '<span class="step-action">' + escapeHtml(capitalize(step.action)) + '</span>';

  if (step.target) {
    var displayName = resolveTargetLabel(step.target, pageElements);
    var tooltip = buildElementTooltip(step.target, pageElements);
    html += ' <span class="element-badge" title="' + escapeHtml(tooltip) + '">' + escapeHtml(displayName) + '</span>';
  }

  if (step.action === 'typePassword') {
    html += ' <span class="step-value">****</span>';
  } else if (step.value) {
    html += ' <span class="step-value">"' + escapeHtml(step.value) + '"</span>';
  }

  if (step.action === 'navigate' && step.url) {
    html += ' <span class="step-value">' + escapeHtml(step.url) + '</span>';
  }

  if (step.action === 'wait' && step.ms !== undefined) {
    html += ' <span class="step-value">' + step.ms + 'ms</span>';
  }

  if (step.action === 'manual' && step.description) {
    html += ' <span class="step-value">"' + escapeHtml(step.description) + '"</span>';
  }

  return html;
}

/**
 * Build a human-readable label for a step (plain text, used for log entries).
 * Resolves element targets to their labels from pageElements.
 * @param {object} step
 * @param {object} [pageElements] - spec.pageElements for label lookup
 * @returns {string}
 */
function buildStepLabel(step, pageElements) {
  var parts = [capitalize(step.action)];
  if (step.target) {
    var displayName = resolveTargetLabel(step.target, pageElements);
    parts.push(displayName);
  }
  if (step.value) {
    parts.push('"' + step.value + '"');
  }
  if (step.action === 'task' && step.name) {
    var taskLabel = step.name.replace('__', '.');
    parts = ['Task ' + taskLabel];
  }
  return parts.join(' ');
}

/**
 * Resolve a namespaced element key to its human-readable label.
 * Falls back to the key itself if no label is found.
 * @param {string} target - namespaced key (e.g., "Home/Login__submitButton")
 * @param {object} [pageElements] - spec.pageElements map
 * @returns {string}
 */
function resolveTargetLabel(target, pageElements) {
  if (!target) return '';
  if (pageElements && pageElements[target] && pageElements[target].label) {
    return pageElements[target].label;
  }
  // Fallback: convert namespace key to readable form
  // "Home/Login__submitButton" → "Home > Login.submitButton"
  var displayTarget = target.replace('__', '.');
  displayTarget = displayTarget.replace(/\//g, ' > ');
  return displayTarget;
}

/**
 * Build a tooltip string with element details (namespace, tag, matcher/xpath).
 * @param {string} target - namespaced key
 * @param {object} [pageElements] - spec.pageElements map
 * @returns {string}
 */
function buildElementTooltip(target, pageElements) {
  if (!target || !pageElements || !pageElements[target]) return target || '';
  var el = pageElements[target];
  var lines = [];
  lines.push('Key: ' + target);
  lines.push('Tag: ' + (el.tag || '*'));
  if (el.xpath) {
    lines.push('XPath: ' + el.xpath);
  } else if (el.where && Object.keys(el.where).length > 0) {
    var matchers = Object.keys(el.where).map(function(k) {
      return k + '=' + JSON.stringify(el.where[k]);
    }).join(', ');
    lines.push('Where: ' + matchers);
  }
  if (el.childOf) {
    lines.push('Child of: ' + el.childOf);
  }
  return lines.join('\n');
}

/**
 * Render the Test Plan checklist for the current test.
 * Expands task action steps inline with indented child checkboxes (max 2 levels).
 * All checkboxes start checked.
 */
function renderTestPlan() {
  var checklist = document.getElementById('step-checklist');
  if (!checklist || !currentTest) return;

  checklist.innerHTML = '';

  // Render param form placeholder for automations (actual form rendering in task 9)
  var existingParamForm = document.querySelector('.param-form');
  if (existingParamForm) existingParamForm.remove();

  if (currentRunnable && currentRunnable.type === 'automation' && currentRunnable.data.params && currentRunnable.data.params.length > 0) {
    var paramForm = document.createElement('div');
    paramForm.className = 'param-form';
    var paramTitle = document.createElement('h3');
    paramTitle.textContent = 'Parameters';
    paramForm.appendChild(paramTitle);

    var params = currentRunnable.data.params;
    for (var p = 0; p < params.length; p++) {
      var param = params[p];
      var row = document.createElement('div');
      row.className = 'param-row' + (param.optional ? ' param-optional' : '');

      var lbl = document.createElement('label');
      lbl.setAttribute('for', 'param-' + param.name);
      lbl.textContent = param.name;
      if (param.optional) {
        var badge = document.createElement('span');
        badge.className = 'optional-badge';
        badge.textContent = ' (optional)';
        lbl.appendChild(badge);
      }
      row.appendChild(lbl);

      var input;
      if (param.type === 'enum' && param.options && param.options.length > 0) {
        input = document.createElement('select');
        input.id = 'param-' + param.name;
        input.setAttribute('data-param-name', param.name);
        input.setAttribute('data-param-type', 'enum');
        if (!param.optional) input.setAttribute('required', '');
        for (var o = 0; o < param.options.length; o++) {
          var opt = document.createElement('option');
          opt.value = param.options[o];
          opt.textContent = param.options[o];
          input.appendChild(opt);
        }
      } else {
        input = document.createElement('input');
        input.id = 'param-' + param.name;
        input.setAttribute('data-param-name', param.name);
        input.setAttribute('data-param-type', param.type);
        if (param.type === 'number') {
          input.type = 'number';
        } else if (param.type === 'date') {
          input.type = 'date';
        } else {
          input.type = 'text';
        }
        if (!param.optional) input.setAttribute('required', '');
        if (param.defaultValue) input.placeholder = param.defaultValue;
      }
      row.appendChild(input);
      paramForm.appendChild(row);
    }

    checklist.parentNode.insertBefore(paramForm, checklist);

    // Pre-fill form with last-used values from storage
    loadParamValues(currentRunnable.data.name).then(function (storedValues) {
      if (!storedValues) return;
      var inputs = paramForm.querySelectorAll('input[data-param-name], select[data-param-name]');
      for (var i = 0; i < inputs.length; i++) {
        var name = inputs[i].getAttribute('data-param-name');
        if (storedValues[name] !== undefined && storedValues[name] !== null) {
          inputs[i].value = String(storedValues[name]);
        }
      }
    });
  }

  var steps = currentTest.steps;
  var tasks = currentSpec.spec.tasks || {};
  var pageElements = currentSpec.spec.pageElements || {};

  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];

    if (step.action === 'task' && step.name && tasks[step.name]) {
      // Render task header as a checkbox item (top-level)
      var taskLi = document.createElement('li');
      var taskCb = document.createElement('input');
      taskCb.type = 'checkbox';
      taskCb.checked = true;
      taskCb.setAttribute('data-step-index', String(i));
      taskCb.setAttribute('data-is-task', 'true');
      taskCb.addEventListener('change', onTaskCheckboxChange);
      var taskLabel = document.createElement('label');
      taskLabel.innerHTML = '<span class="step-action">Task</span> ' + escapeHtml(step.name.replace('__', '.'));
      taskLabel.setAttribute('for', '');
      taskLi.appendChild(taskCb);
      taskLi.appendChild(taskLabel);
      checklist.appendChild(taskLi);

      // Render child steps indented
      var childSteps = tasks[step.name].steps;
      for (var c = 0; c < childSteps.length; c++) {
        var childLi = document.createElement('li');
        childLi.className = 'indented';
        var childCb = document.createElement('input');
        childCb.type = 'checkbox';
        childCb.checked = true;
        childCb.setAttribute('data-step-index', String(i));
        childCb.setAttribute('data-child-index', String(c));
        childCb.addEventListener('change', onChildCheckboxChange);
        var childLabel = document.createElement('label');
        childLabel.innerHTML = buildStepLabelHtml(childSteps[c], pageElements);
        childLi.appendChild(childCb);
        childLi.appendChild(childLabel);
        checklist.appendChild(childLi);
      }
    } else {
      // Render regular step as a checkbox item
      var li = document.createElement('li');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.setAttribute('data-step-index', String(i));
      var label = document.createElement('label');
      label.innerHTML = buildStepLabelHtml(step, pageElements);
      li.appendChild(cb);
      li.appendChild(label);
      checklist.appendChild(li);
    }
  }

  // Load configuration for this test plan
  loadTestPlanConfiguration();
}

/**
 * Get the storage key for the current test plan configuration.
 * @returns {string}
 */
function getConfigKey() {
  return 'config:' + currentSpec.id + ':' + currentTestIndex;
}

/**
 * Load test plan configuration from storage and apply to UI controls.
 * If no saved config exists, controls remain in their default states.
 */
function loadTestPlanConfiguration() {
  var key = getConfigKey();
  getTestPlanConfig(key).then(function (config) {
    var debugEl = document.getElementById('config-debug-mode');
    var speedEl = document.getElementById('config-execution-speed');

    if (debugEl) {
      // Debug mode is on if both continue and retry were enabled
      debugEl.checked = config.allowContinueOnFailure && config.allowRetryOnFailure;
    }
    if (speedEl) {
      speedEl.value = config.executionSpeed;
    }
  });
}

/**
 * Read the current configuration state from the UI controls and persist it.
 */
function onConfigChange() {
  var debugEl = document.getElementById('config-debug-mode');
  var speedEl = document.getElementById('config-execution-speed');

  var debugMode = debugEl ? debugEl.checked : false;

  var config = {
    allowContinueOnFailure: debugMode,
    allowRetryOnFailure: debugMode,
    executionSpeed: speedEl ? speedEl.value : 'NORMAL'
  };

  var key = getConfigKey();
  saveTestPlanConfig(key, config);
}

/**
 * When a task checkbox is toggled, sync all child checkboxes to match.
 * Checking a task checks all its child steps; unchecking unchecks them all.
 */
function onTaskCheckboxChange(e) {
  var cb = e.target;
  var stepIndex = cb.getAttribute('data-step-index');
  var isChecked = cb.checked;

  var checklist = document.getElementById('step-checklist');
  var childCbs = checklist.querySelectorAll(
    'input[data-step-index="' + stepIndex + '"][data-child-index]'
  );
  for (var i = 0; i < childCbs.length; i++) {
    childCbs[i].checked = isChecked;
  }
}

/**
 * When a child step checkbox is toggled, sync the parent task checkbox.
 * If any child is checked, the task is checked. If all are unchecked, the task is unchecked.
 */
function onChildCheckboxChange(e) {
  var cb = e.target;
  var stepIndex = cb.getAttribute('data-step-index');

  var checklist = document.getElementById('step-checklist');
  var childCbs = checklist.querySelectorAll(
    'input[data-step-index="' + stepIndex + '"][data-child-index]'
  );

  var anyChecked = false;
  for (var i = 0; i < childCbs.length; i++) {
    if (childCbs[i].checked) {
      anyChecked = true;
      break;
    }
  }

  // Find the parent task checkbox (same step-index, no child-index, has data-is-task)
  var taskCb = checklist.querySelector(
    'input[data-step-index="' + stepIndex + '"][data-is-task]'
  );
  if (taskCb) {
    taskCb.checked = anyChecked;
  }
}

/**
 * Collect checked step indices and send RUN_TEST or RUN_AUTOMATION to the background.
 * Only top-level step indices are sent (task steps that are checked).
 */
function onRunClick() {
  var checklist = document.getElementById('step-checklist');
  if (!checklist) return;

  // Collect checked top-level step indexes
  var topLevelCbs = checklist.querySelectorAll(
    'input[type="checkbox"][data-step-index]:not([data-child-index])'
  );
  var checkedSteps = [];
  for (var i = 0; i < topLevelCbs.length; i++) {
    if (topLevelCbs[i].checked) {
      checkedSteps.push(parseInt(topLevelCbs[i].getAttribute('data-step-index'), 10));
    }
  }

  var debugEl = document.getElementById('config-debug-mode');
  var speedEl = document.getElementById('config-execution-speed');

  var debugMode = debugEl ? debugEl.checked : false;

  var config = {
    allowContinueOnFailure: debugMode,
    allowRetryOnFailure: debugMode,
    executionSpeed: speedEl ? speedEl.value : 'NORMAL'
  };

  currentRunConfig = config;

  if (currentRunnable && currentRunnable.type === 'automation') {
    // Collect param form values
    var paramForm = document.querySelector('.param-form');
    var params = {};
    var hasValidationError = false;

    if (paramForm) {
      // Remove any previous validation message
      var existingMsg = paramForm.querySelector('.param-validation-message');
      if (existingMsg) existingMsg.remove();

      var inputs = paramForm.querySelectorAll('input[data-param-name], select[data-param-name]');
      var emptyFields = [];
      for (var p = 0; p < inputs.length; p++) {
        var input = inputs[p];
        var paramName = input.getAttribute('data-param-name');
        var paramType = input.getAttribute('data-param-type');
        var value = input.value;

        // Validate required fields
        if (input.hasAttribute('required') && !value) {
          input.classList.add('param-error');
          emptyFields.push(paramName);
          hasValidationError = true;
          continue;
        } else {
          input.classList.remove('param-error');
        }

        // Coerce types
        if (paramType === 'number' && value) {
          params[paramName] = parseFloat(value);
        } else {
          params[paramName] = value;
        }
      }

      if (hasValidationError) {
        var msg = document.createElement('div');
        msg.className = 'param-validation-message';
        msg.textContent = 'Required field' + (emptyFields.length > 1 ? 's' : '') + ' missing: ' + emptyFields.join(', ');
        paramForm.appendChild(msg);
        return;
      }
    }

    api.runtime.sendMessage({
      type: 'RUN_AUTOMATION',
      automationIndex: currentRunnable.index,
      params: params,
      checkedSteps: checkedSteps,
      config: config
    });

    // Store params for persistence on successful completion
    currentRunAutomationParams = { name: currentRunnable.data.name, params: params };
  } else {
    api.runtime.sendMessage({
      type: 'RUN_TEST',
      testIndex: currentTestIndex,
      checkedSteps: checkedSteps,
      config: config
    });
  }

  switchToRunView();
}

// --- Run View ---

/**
 * Switch to the run view and reset its state.
 */
function switchToRunView() {
  isRunning = true;

  // Set run title from current test
  var titleEl = document.getElementById('run-title');
  if (titleEl && currentTest) {
    titleEl.textContent = currentTest.name;
  }

  // Clear log container
  var logContainer = document.getElementById('log-container');
  if (logContainer) {
    logContainer.innerHTML = '';
  }

  // Hide summary and done actions
  var summaryEl = document.getElementById('run-summary');
  if (summaryEl) {
    summaryEl.style.display = 'none';
    summaryEl.textContent = '';
  }
  var doneActions = document.getElementById('run-done-actions');
  if (doneActions) {
    doneActions.style.display = 'none';
  }

  // Hide manual banner
  hideManualBanner();

  // Reset controller bar button states
  var pauseBtn = document.getElementById('pause-btn');
  var continueBtn = document.getElementById('continue-btn');
  var stopBtn = document.getElementById('stop-btn');
  var closeBtn = document.getElementById('close-run-btn');
  if (pauseBtn) { pauseBtn.disabled = false; }
  if (continueBtn) { continueBtn.disabled = true; }
  if (stopBtn) { stopBtn.disabled = false; }
  if (closeBtn) { closeBtn.style.display = 'none'; }

  showView('run');
}

/**
 * Append an "in progress" entry to the log showing the step is currently executing.
 * This entry will be replaced/updated when the step completes.
 * @param {object} data - { stepIndex, action, target, value, url, ms, description, name, params }
 */
function appendInProgressEntry(data) {
  var logContainer = document.getElementById('log-container');
  if (!logContainer) return;

  // Remove any existing in-progress entry
  var existing = logContainer.querySelector('.log-entry.in-progress');
  if (existing) existing.remove();

  var pageElements = (currentSpec && currentSpec.spec && currentSpec.spec.pageElements) || {};

  var div = document.createElement('div');
  div.className = 'log-entry in-progress';
  div.setAttribute('data-step-index', String(data.stepIndex));

  var html = buildLogEntryHtml(data, pageElements);
  div.innerHTML = html + ' <span class="spinner">⟳</span>';

  logContainer.appendChild(div);
  logContainer.scrollTop = logContainer.scrollHeight;
}

/**
 * Remove the "in progress" entry when the step completes (LOG arrives).
 * @param {object} logData - the LOG message
 */
function finalizeInProgressEntry(logData) {
  var logContainer = document.getElementById('log-container');
  if (!logContainer) return;

  var existing = logContainer.querySelector('.log-entry.in-progress[data-step-index="' + logData.stepIndex + '"]');
  if (existing) existing.remove();
}

/**
 * Format a params object for display in the log.
 * - 0 params: returns empty string
 * - 1-2 params: inline display { key: "val", key2: "val2" }
 * - 3+ params: badge with count, full details in title tooltip
 * Masks password-like values.
 *
 * @param {object} params
 * @returns {string} HTML string
 */
function formatParams(params) {
  if (!params || typeof params !== 'object') return '';
  var keys = Object.keys(params);
  if (keys.length === 0) return '';

  var sensitiveKeys = /password|secret|token|key|auth/i;

  function maskValue(key, val) {
    if (sensitiveKeys.test(key)) return '****';
    if (typeof val === 'string' && val.length > 30) return val.slice(0, 27) + '...';
    return String(val);
  }

  if (keys.length <= 2) {
    var inlineParts = keys.map(function(k) {
      return escapeHtml(k) + ': "' + escapeHtml(maskValue(k, params[k])) + '"';
    });
    return ' <span class="step-params">{ ' + inlineParts.join(', ') + ' }</span>';
  }

  // 3+ params: show count badge with full tooltip
  var tooltipParts = keys.map(function(k) {
    return k + ': ' + maskValue(k, params[k]);
  });
  var tooltip = tooltipParts.join('\n');
  return ' <span class="step-params-badge" title="' + escapeHtml(tooltip) + '">(' + keys.length + ' params)</span>';
}

/**
 * Build the HTML content for a log entry based on action type.
 * @param {object} logData
 * @param {object} pageElements
 * @returns {string} HTML string (without indicator)
 */
function buildLogEntryHtml(logData, pageElements) {
  var action = logData.action;
  var parts = [];

  parts.push('<span class="step-action">' + escapeHtml(capitalize(action)) + '</span>');

  switch (action) {
    case 'navigate':
      if (logData.url) {
        parts.push('<span class="step-value">' + escapeHtml(logData.url) + '</span>');
      }
      break;

    case 'wait':
      if (logData.ms != null) {
        parts.push('<span class="step-value">' + logData.ms + 'ms</span>');
      }
      break;

    case 'manual':
      if (logData.description) {
        parts.push('<span class="step-value">"' + escapeHtml(logData.description) + '"</span>');
      }
      break;

    case 'task':
      if (logData.name) {
        var taskLabel = logData.name.replace(/__/g, '.').replace(/\//g, ' > ');
        parts.push('<span class="element-badge">' + escapeHtml(taskLabel) + '</span>');
      }
      parts.push(formatParams(logData.params));
      break;

    case 'typePassword':
      if (logData.target) {
        var tgt = resolveTargetLabel(logData.target, pageElements);
        var tip = buildElementTooltip(logData.target, pageElements);
        parts.push('<span class="element-badge" title="' + escapeHtml(tip) + '">' + escapeHtml(tgt) + '</span>');
      }
      parts.push('<span class="step-value">****</span>');
      break;

    case 'saveText':
    case 'saveValue':
    case 'saveAttribute':
    case 'saveExpression':
      if (logData.target) {
        var saveTarget = resolveTargetLabel(logData.target, pageElements);
        var saveTip = buildElementTooltip(logData.target, pageElements);
        parts.push('<span class="element-badge" title="' + escapeHtml(saveTip) + '">' + escapeHtml(saveTarget) + '</span>');
      }
      if (logData.contextKey) {
        parts.push('<span class="ctx-badge">ctx.' + escapeHtml(logData.contextKey) + '</span>');
        parts.push(formatContextValue(logData.contextKey, logData.savedValue));
      }
      break;

    default:
      // Actions with target: click, type, select, assertExists, assertNotExists, assertHasText, waitFor
      if (logData.target) {
        var displayTarget = resolveTargetLabel(logData.target, pageElements);
        var tooltip = buildElementTooltip(logData.target, pageElements);
        parts.push('<span class="element-badge" title="' + escapeHtml(tooltip) + '">' + escapeHtml(displayTarget) + '</span>');
      }
      if (logData.value) {
        parts.push('<span class="step-value">"' + escapeHtml(logData.value) + '"</span>');
      }
      if (action === 'waitFor' && logData.gone) {
        parts.push('<span class="step-value">(gone)</span>');
      }
      if (logData.resolvedContext && logData.resolvedContext.length > 0) {
        var ctxLabels = logData.resolvedContext.map(function(ref) {
          return 'ctx.' + ref.key;
        });
        parts.push('<span class="ctx-source">(from ' + escapeHtml(ctxLabels.join(', ')) + ')</span>');
      }
      break;
  }

  return parts.join(' ');
}

/**
 * Append a log entry to the run view log container.
 * @param {object} logData - { stepIndex, action, target, value, ok, error, taskName, url, ms, description, name, params }
 */
function appendLogEntry(logData) {
  var logContainer = document.getElementById('log-container');
  if (!logContainer) return;

  var pageElements = (currentSpec && currentSpec.spec && currentSpec.spec.pageElements) || {};

  // If this is a task header entry, render a group header row
  if (logData.taskName) {
    var headerDiv = document.createElement('div');
    headerDiv.className = 'log-entry task-header';
    var headerLabel = logData.taskName.replace(/__/g, '.').replace(/\//g, ' > ');
    headerDiv.innerHTML = '<span class="step-action">Task</span> ' + escapeHtml(headerLabel);
    logContainer.appendChild(headerDiv);
    return;
  }

  var div = document.createElement('div');
  div.setAttribute('data-step-index', String(logData.stepIndex));
  var classes = 'log-entry';

  if (logData.ok === true) {
    classes += ' pass';
  } else if (logData.ok === false) {
    classes += ' fail';
  }

  if (logData.indented) {
    classes += ' indented';
  }

  div.className = classes;

  var html = buildLogEntryHtml(logData, pageElements);

  // Add pass/fail indicator
  var indicator = '';
  if (logData.ok === true) {
    indicator = ' ✓';
    if (logData.retryAttempt) {
      indicator += ' Attempt ' + logData.retryAttempt;
    }
  } else if (logData.ok === false) {
    indicator = ' ✗';
    if (logData.retryAttempt) {
      indicator += ' Attempt ' + logData.retryAttempt;
    }
    if (logData.error) {
      indicator += ' ' + escapeHtml(logData.error);
    }
  }

  div.innerHTML = html + indicator;

  logContainer.appendChild(div);
  logContainer.scrollTop = logContainer.scrollHeight;
}

/**
 * Show the manual pause banner with a description.
 * @param {string} description
 */
function showManualBanner(description) {
  var banner = document.getElementById('manual-banner');
  var descEl = document.getElementById('manual-description');
  if (banner && descEl) {
    descEl.textContent = description;
    banner.classList.add('visible');
  }
}

/**
 * Hide the manual pause banner.
 */
function hideManualBanner() {
  var banner = document.getElementById('manual-banner');
  if (banner) {
    banner.classList.remove('visible');
  }
}

/**
 * Render the run summary after completion or stop.
 * @param {object} data - { total, passed, failed }
 */
function showRunSummary(data) {
  isRunning = false;

  // Persist automation param values on successful run completion
  if (currentRunAutomationParams && data.failed === 0) {
    saveParamValues(currentRunAutomationParams.name, currentRunAutomationParams.params);
  }
  currentRunAutomationParams = null;

  var summaryEl = document.getElementById('run-summary');
  if (summaryEl) {
    summaryEl.textContent = 'Total: ' + data.total + ' | Passed: ' + data.passed + ' | Failed: ' + data.failed;
    summaryEl.style.display = 'block';
  }

  var doneActions = document.getElementById('run-done-actions');
  if (doneActions) {
    doneActions.style.display = 'block';
  }

  // Disable controller buttons since run is over
  var pauseBtn = document.getElementById('pause-btn');
  var continueBtn = document.getElementById('continue-btn');
  var stopBtn = document.getElementById('stop-btn');
  if (pauseBtn) { pauseBtn.disabled = true; }
  if (continueBtn) { continueBtn.disabled = true; }
  if (stopBtn) { stopBtn.disabled = true; }

  // Show close button
  var closeBtn = document.getElementById('close-run-btn');
  if (closeBtn) { closeBtn.style.display = ''; }
}

/**
 * Handle UPDATE_LOG_ENTRY message from background.
 * Updates an existing log entry DOM element in-place with new pass/fail state and retry indicator.
 * @param {object} message - { stepIndex, ok, retryAttempt, error? }
 */
function handleUpdateLogEntry(message) {
  var entry = document.querySelector('[data-step-index="' + message.stepIndex + '"]');
  if (!entry) return;

  // Update pass/fail class (also remove in-progress from retry loading state)
  entry.classList.remove('pass', 'fail', 'in-progress');
  if (message.ok) {
    entry.classList.add('pass');
  } else {
    entry.classList.add('fail');
  }

  // Rebuild indicator: use badge for attempt number
  var indicator = '';
  if (message.ok) {
    indicator = ' ✓';
    if (message.retryAttempt) {
      indicator += ' <span class="attempt-badge pass">Attempt ' + message.retryAttempt + '</span>';
    }
  } else {
    indicator = ' ✗';
    if (message.retryAttempt) {
      indicator += ' <span class="attempt-badge fail">Attempt ' + message.retryAttempt + '</span>';
    }
    if (message.error) {
      indicator += ' ' + escapeHtml(message.error);
    }
  }

  // The existing entry already has the correct action/target HTML from the original LOG emission.
  // Strip any existing indicator (✓/✗/spinner and everything after) and append the new one.
  var currentHtml = entry.innerHTML;
  currentHtml = currentHtml.replace(/ [✓✗⊘].*$/, '');
  // Also strip spinner if present (from retry loading state)
  currentHtml = currentHtml.replace(/ <span class="attempt-badge">.*$/, '');
  currentHtml = currentHtml.replace(/ <span class="spinner">.*$/, '');
  entry.innerHTML = currentHtml + indicator;
}

/**
 * Handle STEP_FAILED_AWAITING_ACTION message from the background.
 * Renders "Try Again" and/or "Skip" buttons adjacent to the failed log entry
 * based on the current run configuration.
 * @param {object} message - { stepIndex, action, target, value, error }
 */
function handleStepFailedAwaitingAction(message) {
  var logContainer = document.getElementById('log-container');
  if (!logContainer) return;

  var config = currentRunConfig || {};
  var showRetry = !!config.allowRetryOnFailure;
  var showSkip = !!config.allowContinueOnFailure;

  // If neither button should be shown, nothing to do
  if (!showRetry && !showSkip) return;

  // Create button container adjacent to the last (failed) log entry
  var buttonContainer = document.createElement('div');
  buttonContainer.className = 'log-entry action-buttons';

  var retryBtn = null;
  var skipBtn = null;

  if (showRetry) {
    retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn-primary';
    retryBtn.textContent = 'Try Again';
    retryBtn.setAttribute('data-step-index', String(message.stepIndex));
    buttonContainer.appendChild(retryBtn);
  }

  if (showSkip) {
    skipBtn = document.createElement('button');
    skipBtn.className = 'btn';
    skipBtn.textContent = 'Skip';
    skipBtn.setAttribute('data-step-index', String(message.stepIndex));
    buttonContainer.appendChild(skipBtn);
  }

  // Remove any existing action buttons to prevent duplicates on repeated retries
  var oldBtns = logContainer.querySelector('.action-buttons');
  if (oldBtns) oldBtns.parentNode.removeChild(oldBtns);

  logContainer.appendChild(buttonContainer);

  // Wire click handlers
  if (retryBtn) {
    retryBtn.addEventListener('click', function () {
      api.runtime.sendMessage({
        type: 'RETRY_STEP',
        stepIndex: message.stepIndex
      });

      // Remove the action buttons container
      if (buttonContainer.parentNode) {
        buttonContainer.parentNode.removeChild(buttonContainer);
      }

      // Put the log entry into loading/running state with attempt badge
      var entry = document.querySelector('[data-step-index="' + message.stepIndex + '"]');
      if (entry) {
        entry.classList.remove('fail');
        entry.classList.add('in-progress');
        // Strip the old indicator (error text, ✗, etc) and show attempt badge with spinner
        var currentHtml = entry.innerHTML;
        currentHtml = currentHtml.replace(/ [✓✗⊘].*$/, '');
        currentHtml = currentHtml.replace(/ <span class="attempt-badge">.*$/, '');
        currentHtml = currentHtml.replace(/ <span class="spinner">.*$/, '');
        var attemptNum = (message.retryAttempt || 0) + 1;
        entry.innerHTML = currentHtml + ' <span class="attempt-badge">Attempt ' + attemptNum + '</span> <span class="spinner">⟳</span>';
      }
    });
  }

  if (skipBtn) {
    skipBtn.addEventListener('click', function () {
      api.runtime.sendMessage({
        type: 'SKIP_STEP',
        stepIndex: message.stepIndex
      });

      // Remove the action buttons container
      if (buttonContainer.parentNode) {
        buttonContainer.parentNode.removeChild(buttonContainer);
      }

      // Update the failed log entry to show "skipped" badge with muted styling
      var entry = document.querySelector('[data-step-index="' + message.stepIndex + '"]');
      if (entry) {
        entry.classList.remove('fail');
        entry.classList.add('skipped');
        // Replace the ✗ indicator with ⊘ skipped badge
        entry.innerHTML = entry.innerHTML.replace(/ [✓✗].*$/, ' <span class="skipped-badge">⊘ skipped</span>');
      }
    });
  }

  // Auto-scroll to bottom
  logContainer.scrollTop = logContainer.scrollHeight;
}

/**
 * Handle incoming messages from the background script.
 * @param {object} message
 */
function onBackgroundMessage(message) {
  if (!message || !message.type) return;

  switch (message.type) {
    case 'STEP_STARTING':
      appendInProgressEntry(message);
      break;

    case 'LOG':
      finalizeInProgressEntry(message);
      appendLogEntry(message);
      break;

    case 'STEP_FAILED_AWAITING_ACTION':
      handleStepFailedAwaitingAction(message);
      break;

    case 'UPDATE_LOG_ENTRY':
      handleUpdateLogEntry(message);
      break;

    case 'MANUAL_PAUSE':
      showManualBanner(message.description);
      break;

    case 'RUN_COMPLETE':
      hideManualBanner();
      showRunSummary(message);
      break;

    case 'RUN_STOPPED':
      hideManualBanner();
      showRunSummary(message);
      break;

    case 'STATE_SYNC':
      // Restore UI state if panel reconnects mid-run
      if (message.running) {
        isRunning = true;
        showView('run');
        if (message.paused) {
          var pauseBtn = document.getElementById('pause-btn');
          var continueBtn = document.getElementById('continue-btn');
          if (pauseBtn) { pauseBtn.disabled = true; }
          if (continueBtn) { continueBtn.disabled = false; }
        }
      }
      break;
  }
}

// --- Load Spec ---

/**
 * Handle spec file selection and loading.
 */
function onSpecFileSelected(e) {
  var file = e.target.files[0];
  if (!file) return;
  handleDroppedFile(file);
  // Reset file input so the same file can be re-selected
  e.target.value = '';
}

/**
 * Handle a file (from input or drag-and-drop) — parse, validate, and load.
 * @param {File} file
 */
function handleDroppedFile(file) {
  var reader = new FileReader();
  reader.onload = function (evt) {
    var text = evt.target.result;
    var parsed;

    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      showError('Failed to parse JSON: ' + parseErr.message);
      return;
    }

    var result = validateSpec(parsed);
    if (!result.ok) {
      showError('Invalid spec: ' + result.error);
      return;
    }

    addSpec(currentHostname, file.name, result.spec).then(function () {
      renderHomeView();
    });
  };
  reader.readAsText(file);
}

// --- Error View ---

/**
 * Show an error message in the error view.
 * @param {string} message
 */
function showError(message) {
  var errorEl = document.getElementById('error-message');
  if (errorEl) {
    errorEl.textContent = message;
  }
  showView('error');
}

// --- Tab Sync ---

/**
 * Get the hostname of the currently active tab.
 * @param {function} callback - Called with hostname string or null
 */
function getActiveTabHostname(callback) {
  api.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs && tabs.length > 0 && tabs[0].url) {
      try {
        var url = new URL(tabs[0].url);
        callback(url.hostname);
      } catch (e) {
        callback(null);
      }
    } else {
      callback(null);
    }
  });
}

/**
 * Sync the panel to the active tab's hostname.
 * Only syncs if no test is currently running.
 */
function syncToActiveTab() {
  if (isRunning) return;

  getActiveTabHostname(function (hostname) {
    if (hostname && hostname !== currentHostname) {
      currentHostname = hostname;
      currentProject = null;
      showView('home');
      renderHomeView();
    }
  });
}

// --- Utility ---

/**
 * Determine if a context key is sensitive (should be masked).
 * @param {string} key
 * @returns {boolean}
 */
function isSensitiveKey(key) {
  return /password|secret|token|key|auth/i.test(key);
}

/**
 * Format a context value for display with truncation and masking.
 * @param {string} key - The context key (for sensitivity check)
 * @param {*} value - The raw value
 * @returns {string} HTML string with appropriate truncation/masking/tooltip
 */
function formatContextValue(key, value) {
  if (value === null || value === undefined || value === '') {
    return '<span class="ctx-value"></span>';
  }
  var strVal = String(value);
  if (isSensitiveKey(key)) {
    return '<span class="ctx-value ctx-masked">****</span>';
  }
  if (strVal.length > 30) {
    return '<span class="ctx-value" title="' + escapeHtml(strVal) + '">"' +
           escapeHtml(strVal.slice(0, 30)) + '..."</span>';
  }
  return '<span class="ctx-value">"' + escapeHtml(strVal) + '"</span>';
}

/**
 * Escape HTML special characters.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str == null) return '';
  if (typeof str !== 'string') str = String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Extract hostname from a URL string.
 * @param {string} urlStr
 * @returns {string|null}
 */
function getHostFromUrl(urlStr) {
  try {
    var u = new URL(urlStr);
    return u.hostname;
  } catch (e) {
    // If it's not a valid URL, try prepending https:// and parsing again
    try {
      var u2 = new URL('https://' + urlStr);
      return u2.hostname;
    } catch (e2) {
      return null;
    }
  }
}

// --- Initialization ---

function init() {
  // Wire up tab search input filters
  var tabSearchInputs = document.querySelectorAll('.tab-search-input');
  for (var s = 0; s < tabSearchInputs.length; s++) {
    tabSearchInputs[s].addEventListener('input', applySearchFilter);
  }

  // Wire up tab buttons
  var tabButtons = document.querySelectorAll('.tab-btn');
  for (var t = 0; t < tabButtons.length; t++) {
    tabButtons[t].addEventListener('click', function (e) {
      var tabName = e.currentTarget.getAttribute('data-tab');
      switchTab(tabName);
    });
  }

  // Wire up Load Spec button and file input
  var loadBtn = document.getElementById('load-spec-btn');
  var fileInput = document.getElementById('spec-file-input');
  if (loadBtn && fileInput) {
    loadBtn.addEventListener('click', function () {
      fileInput.click();
    });
    fileInput.addEventListener('change', onSpecFileSelected);
  }

  // Wire up alternate Load Spec button (in loaded header)
  var loadBtnAlt = document.getElementById('load-spec-btn-alt');
  var fileInputAlt = document.getElementById('spec-file-input-alt');
  if (loadBtnAlt && fileInputAlt) {
    loadBtnAlt.addEventListener('click', function () {
      fileInputAlt.click();
    });
    fileInputAlt.addEventListener('change', onSpecFileSelected);
  }

  // Wire up drag-and-drop on the drop zone and body
  var dropZone = document.getElementById('drop-zone');
  var homeView = document.getElementById('view-home');

  if (homeView) {
    homeView.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (dropZone) dropZone.classList.add('drag-over');
    });
    homeView.addEventListener('dragleave', function (e) {
      if (!homeView.contains(e.relatedTarget)) {
        if (dropZone) dropZone.classList.remove('drag-over');
      }
    });
    homeView.addEventListener('drop', function (e) {
      e.preventDefault();
      if (dropZone) dropZone.classList.remove('drag-over');
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        var file = files[0];
        if (file.name.endsWith('.json') || file.name.endsWith('.tomation.json')) {
          // Simulate file input change
          handleDroppedFile(file);
        }
      }
    });
  }

  // Wire up error back button
  var errorBackBtn = document.getElementById('error-back-btn');
  if (errorBackBtn) {
    errorBackBtn.addEventListener('click', function () {
      showView('home');
      renderHomeView();
    });
  }

  // Wire up back button from test plan view
  var backHomeBtn = document.getElementById('back-home-btn');
  if (backHomeBtn) {
    backHomeBtn.addEventListener('click', function () {
      showView('home');
      renderHomeView();
    });
  }

  // Wire up Run button in test plan view
  var runBtn = document.getElementById('run-btn');
  if (runBtn) {
    runBtn.addEventListener('click', onRunClick);
  }

  // Wire up configuration controls change listeners
  var configDebug = document.getElementById('config-debug-mode');
  var configSpeed = document.getElementById('config-execution-speed');
  if (configDebug) {
    configDebug.addEventListener('change', onConfigChange);
  }
  if (configSpeed) {
    configSpeed.addEventListener('change', onConfigChange);
  }

  // Wire up back button from run view
  var backFromRunBtn = document.getElementById('back-home-from-run-btn');
  if (backFromRunBtn) {
    backFromRunBtn.addEventListener('click', function () {
      isRunning = false;
      showView('home');
      renderHomeView();
    });
  }

  // Wire up Pause button
  var pauseBtn = document.getElementById('pause-btn');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', function () {
      api.runtime.sendMessage({ type: 'PAUSE' });
      pauseBtn.disabled = true;
      var continueBtn = document.getElementById('continue-btn');
      if (continueBtn) { continueBtn.disabled = false; }
      // Show close button when paused
      var closeBtn = document.getElementById('close-run-btn');
      if (closeBtn) { closeBtn.style.display = ''; }
    });
  }

  // Wire up Continue button
  var continueBtn = document.getElementById('continue-btn');
  if (continueBtn) {
    continueBtn.addEventListener('click', function () {
      api.runtime.sendMessage({ type: 'CONTINUE' });
      continueBtn.disabled = true;
      var pauseBtn2 = document.getElementById('pause-btn');
      if (pauseBtn2) { pauseBtn2.disabled = false; }
      // Hide close button when resuming
      var closeBtn = document.getElementById('close-run-btn');
      if (closeBtn) { closeBtn.style.display = 'none'; }
    });
  }

  // Wire up Stop button
  var stopBtn = document.getElementById('stop-btn');
  if (stopBtn) {
    stopBtn.addEventListener('click', function () {
      api.runtime.sendMessage({ type: 'STOP' });
      stopBtn.disabled = true;
      // Show close button when stopped
      var closeBtn = document.getElementById('close-run-btn');
      if (closeBtn) { closeBtn.style.display = ''; }
    });
  }

  // Wire up Close button (go back to home from run view)
  var closeRunBtn = document.getElementById('close-run-btn');
  if (closeRunBtn) {
    closeRunBtn.addEventListener('click', function () {
      isRunning = false;
      showView('home');
      renderHomeView();
    });
  }

  // Wire up Manual Continue button (inside banner)
  var manualContinueBtn = document.getElementById('manual-continue-btn');
  if (manualContinueBtn) {
    manualContinueBtn.addEventListener('click', function () {
      api.runtime.sendMessage({ type: 'CONTINUE' });
      hideManualBanner();
    });
  }

  // Listen for messages from background script
  if (api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener(onBackgroundMessage);
  }

  // Get active tab hostname and render home view
  getActiveTabHostname(function (hostname) {
    currentHostname = hostname;
    renderHomeView();
  });

  // Listen for tab changes — sync to new hostname if no test running
  if (api.tabs && api.tabs.onActivated) {
    api.tabs.onActivated.addListener(function () {
      syncToActiveTab();
    });
  }

  if (api.tabs && api.tabs.onUpdated) {
    api.tabs.onUpdated.addListener(function (tabId, changeInfo) {
      if (changeInfo.status === 'complete') {
        syncToActiveTab();
      }
    });
  }
}

// Run init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
