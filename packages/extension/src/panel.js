// panel.js — sidebar UI
// Implementation: Tasks 17, 18, 19
var api = typeof browser !== 'undefined' ? browser : chrome;

// --- State ---
var currentHostname = null;
var currentProject = null;
var currentSpec = null;
var currentTest = null;
var currentTestIndex = -1;
var isRunning = false;
var currentRunConfig = null;

// --- Search Filter ---

/**
 * Pure function: filter test names by case-insensitive substring match.
 * @param {string[]} testNames
 * @param {string} query
 * @returns {string[]}
 */
function filterTests(testNames, query) {
  if (!query) return testNames;
  var lowerQuery = query.toLowerCase();
  return testNames.filter(function(name) {
    return name.toLowerCase().indexOf(lowerQuery) !== -1;
  });
}

/**
 * Apply search filter to the rendered test list in the Home view.
 * Hides/shows test items, spec section headers, and empty state message.
 */
function applySearchFilter() {
  var searchInput = document.getElementById('search-input');
  var contentEl = document.getElementById('project-content');
  var emptyState = document.getElementById('search-empty-state');
  if (!searchInput || !contentEl) return;

  var query = searchInput.value;
  var lowerQuery = query ? query.toLowerCase() : '';

  var sections = contentEl.querySelectorAll('.spec-section');
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

  // Show/hide empty state
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

  return { ok: true, spec: obj };
}

// --- Home View Rendering ---

/**
 * Render the home view for a given hostname.
 * Loads the project from storage and displays specs/tests or a create form.
 */
function renderHomeView() {
  var contentEl = document.getElementById('project-content');
  var warningEl = document.getElementById('warning-banner');

  if (!contentEl) return;

  // Clear search input when returning to Home view (Requirement 1.7)
  var searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.value = '';
  }

  warningEl.classList.remove('visible');
  warningEl.textContent = '';

  if (!currentHostname) {
    contentEl.innerHTML = '<p>No active tab detected.</p>';
    return;
  }

  getProject(currentHostname).then(function (project) {
    currentProject = project;

    if (!project || !project.specs || project.specs.length === 0) {
      // Show create-project prompt
      contentEl.innerHTML =
        '<div class="create-project">' +
        '<p>No project found for <strong>' + escapeHtml(currentHostname) + '</strong></p>' +
        '<p>Load a spec file to get started.</p>' +
        '</div>';
      return;
    }

    // Render spec + test list
    var html = '';
    for (var i = 0; i < project.specs.length; i++) {
      var specEntry = project.specs[i];
      var spec = specEntry.spec;

      // Check meta.urls (array) or meta.url (legacy single) warning
      if (spec && spec.meta) {
        var urls = spec.meta.urls || (spec.meta.url ? [spec.meta.url] : []);
        if (urls.length > 0) {
          try {
            var anyMatch = urls.some(function (u) {
              var h = getHostFromUrl(u);
              return h && h === currentHostname;
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

      html += '<div class="spec-section">';
      html += '<div class="spec-header">' + escapeHtml(specEntry.filename) + '</div>';

      if (spec && spec.tests && spec.tests.length > 0) {
        html += '<ul class="test-list">';
        for (var j = 0; j < spec.tests.length; j++) {
          html += '<li data-spec-index="' + i + '" data-test-index="' + j + '">' +
            escapeHtml(spec.tests[j].name) + '</li>';
        }
        html += '</ul>';
      }

      html += '</div>';
    }

    contentEl.innerHTML = html;

    // Attach click handlers to test items
    var testItems = contentEl.querySelectorAll('.test-list li');
    for (var t = 0; t < testItems.length; t++) {
      testItems[t].addEventListener('click', onTestItemClick);
    }

    // Apply search filter after rendering (in case search input has a value)
    applySearchFilter();
  });
}

/**
 * Handle click on a test item — navigate to Test Plan view.
 */
function onTestItemClick(e) {
  var li = e.currentTarget;
  var specIndex = parseInt(li.getAttribute('data-spec-index'), 10);
  var testIndex = parseInt(li.getAttribute('data-test-index'), 10);

  if (!currentProject || !currentProject.specs[specIndex]) return;

  currentSpec = currentProject.specs[specIndex];
  currentTest = currentSpec.spec.tests[testIndex];
  currentTestIndex = testIndex;

  showView('test-plan');
  var titleEl = document.getElementById('test-plan-title');
  if (titleEl && currentTest) {
    titleEl.textContent = currentTest.name;
  }
  renderTestPlan();
}

// --- Test Plan View ---

/**
 * Build a human-readable label for a step.
 * @param {object} step
 * @returns {string}
 */
function buildStepLabel(step) {
  var parts = [step.action];
  if (step.target) {
    parts.push(step.target);
  }
  if (step.value) {
    parts.push('"' + step.value + '"');
  }
  if (step.action === 'task' && step.name) {
    parts = ['task: ' + step.name];
  }
  return parts.join(' ');
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

  var steps = currentTest.steps;
  var tasks = currentSpec.spec.tasks || {};

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
      taskLabel.textContent = step.name;
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
        var childLabel = document.createElement('label');
        childLabel.textContent = buildStepLabel(childSteps[c]);
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
      label.textContent = buildStepLabel(step);
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
    var continueEl = document.getElementById('config-continue-on-failure');
    var retryEl = document.getElementById('config-retry-on-failure');
    var speedEl = document.getElementById('config-execution-speed');

    if (continueEl) {
      continueEl.checked = config.allowContinueOnFailure;
    }
    if (retryEl) {
      retryEl.checked = config.allowRetryOnFailure;
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
  var continueEl = document.getElementById('config-continue-on-failure');
  var retryEl = document.getElementById('config-retry-on-failure');
  var speedEl = document.getElementById('config-execution-speed');

  var config = {
    allowContinueOnFailure: continueEl ? continueEl.checked : false,
    allowRetryOnFailure: retryEl ? retryEl.checked : false,
    executionSpeed: speedEl ? speedEl.value : 'NORMAL'
  };

  var key = getConfigKey();
  saveTestPlanConfig(key, config);
}

/**
 * When a task checkbox is unchecked, uncheck all its child checkboxes.
 * When checked, do not force children to re-check.
 */
function onTaskCheckboxChange(e) {
  var cb = e.target;
  var stepIndex = cb.getAttribute('data-step-index');
  var isChecked = cb.checked;

  if (!isChecked) {
    // Uncheck all child checkboxes for this task
    var checklist = document.getElementById('step-checklist');
    var childCbs = checklist.querySelectorAll(
      'input[data-step-index="' + stepIndex + '"][data-child-index]'
    );
    for (var i = 0; i < childCbs.length; i++) {
      childCbs[i].checked = false;
    }
  }
}

/**
 * Collect checked step indices and send RUN_TEST to the background.
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

  var continueEl = document.getElementById('config-continue-on-failure');
  var retryEl = document.getElementById('config-retry-on-failure');
  var speedEl = document.getElementById('config-execution-speed');

  var config = {
    allowContinueOnFailure: continueEl ? continueEl.checked : false,
    allowRetryOnFailure: retryEl ? retryEl.checked : false,
    executionSpeed: speedEl ? speedEl.value : 'NORMAL'
  };

  currentRunConfig = config;

  api.runtime.sendMessage({
    type: 'RUN_TEST',
    testIndex: currentTestIndex,
    checkedSteps: checkedSteps,
    config: config
  });

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
  if (pauseBtn) { pauseBtn.disabled = false; }
  if (continueBtn) { continueBtn.disabled = true; }
  if (stopBtn) { stopBtn.disabled = false; }

  showView('run');
}

/**
 * Append a log entry to the run view log container.
 * @param {object} logData - { stepIndex, action, target, value, ok, error, taskName }
 */
function appendLogEntry(logData) {
  var logContainer = document.getElementById('log-container');
  if (!logContainer) return;

  // If this is a task header entry, render a group header row
  if (logData.taskName) {
    var headerDiv = document.createElement('div');
    headerDiv.className = 'log-entry task-header';
    headerDiv.textContent = logData.taskName;
    logContainer.appendChild(headerDiv);
    return;
  }

  var div = document.createElement('div');
  var classes = 'log-entry';

  // Add pass/fail class
  if (logData.ok === true) {
    classes += ' pass';
  } else if (logData.ok === false) {
    classes += ' fail';
  }

  // Add indented class if this step is inside a task
  if (logData.indented) {
    classes += ' indented';
  }

  div.className = classes;

  // Build display text: action, target, value (masked for typePassword)
  var parts = [];
  if (logData.action) {
    parts.push(logData.action);
  }
  if (logData.target) {
    parts.push(logData.target);
  }
  if (logData.action === 'typePassword') {
    parts.push('****');
  } else if (logData.value) {
    parts.push(escapeHtml(logData.value));
  }

  // Add pass/fail indicator with optional retry attempt count
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

  div.innerHTML = escapeHtml(parts.join(' ')) + indicator;

  logContainer.appendChild(div);

  // Auto-scroll to bottom
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

  logContainer.appendChild(buttonContainer);

  // Wire click handlers
  if (retryBtn) {
    retryBtn.addEventListener('click', function () {
      api.runtime.sendMessage({
        type: 'RETRY_STEP',
        stepIndex: message.stepIndex
      });
      if (retryBtn) retryBtn.disabled = true;
      if (skipBtn) skipBtn.disabled = true;
    });
  }

  if (skipBtn) {
    skipBtn.addEventListener('click', function () {
      api.runtime.sendMessage({
        type: 'SKIP_STEP',
        stepIndex: message.stepIndex
      });
      if (retryBtn) retryBtn.disabled = true;
      if (skipBtn) skipBtn.disabled = true;

      // Update the last failed log entry to show "skipped" badge with muted styling
      var logEntries = logContainer.querySelectorAll('.log-entry.fail');
      if (logEntries.length > 0) {
        var lastFailed = logEntries[logEntries.length - 1];
        lastFailed.classList.remove('fail');
        lastFailed.classList.add('skipped');
        // Replace the ✗ indicator with ⊘ skipped badge
        lastFailed.innerHTML = lastFailed.innerHTML.replace(/ ✗.*$/, ' ⊘ skipped');
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
    case 'LOG':
      appendLogEntry(message);
      break;

    case 'STEP_FAILED_AWAITING_ACTION':
      handleStepFailedAwaitingAction(message);
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

  // Reset file input so the same file can be re-selected
  e.target.value = '';
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
 * Escape HTML special characters.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
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
    return null;
  }
}

// --- Initialization ---

function init() {
  // Wire up search input filter
  var searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', applySearchFilter);
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
  var configContinue = document.getElementById('config-continue-on-failure');
  var configRetry = document.getElementById('config-retry-on-failure');
  var configSpeed = document.getElementById('config-execution-speed');
  if (configContinue) {
    configContinue.addEventListener('change', onConfigChange);
  }
  if (configRetry) {
    configRetry.addEventListener('change', onConfigChange);
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
    });
  }

  // Wire up Stop button
  var stopBtn = document.getElementById('stop-btn');
  if (stopBtn) {
    stopBtn.addEventListener('click', function () {
      api.runtime.sendMessage({ type: 'STOP' });
      stopBtn.disabled = true;
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
