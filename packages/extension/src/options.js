// options.js — options page
// Implementation: Task 20
var api = typeof browser !== 'undefined' ? browser : chrome;

/**
 * Render all projects grouped by hostname.
 */
function renderProjects() {
  getAllProjects().then(function (projects) {
    var container = document.getElementById('projects-container');
    var hostnames = Object.keys(projects);

    if (hostnames.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No projects found.</p></div>';
      return;
    }

    var html = '';
    for (var i = 0; i < hostnames.length; i++) {
      var hostname = hostnames[i];
      var project = projects[hostname];
      if (!project || !project.host) {
        continue;
      }
      html += buildProjectCard(hostname, project);
    }

    if (html === '') {
      container.innerHTML = '<div class="empty-state"><p>No projects found.</p></div>';
      return;
    }

    container.innerHTML = html;
    attachProjectListeners();
  });
}

/**
 * Build HTML for a single project card.
 * @param {string} hostname
 * @param {object} project
 * @returns {string}
 */
function buildProjectCard(hostname, project) {
  var name = project.name || hostname;
  var specs = project.specs || [];

  var html = '<div class="project-card" data-hostname="' + escapeAttr(hostname) + '">';
  html += '<div class="project-header">';
  html += '<span class="project-name">' + escapeHtml(name) + '</span>';
  html += '<span class="project-hostname">(' + escapeHtml(hostname) + ')</span>';
  html += '<button class="btn btn-sm rename-project-btn" data-hostname="' + escapeAttr(hostname) + '" data-name="' + escapeAttr(name) + '">Rename</button>';
  html += '<button class="btn btn-sm btn-danger delete-project-btn" data-hostname="' + escapeAttr(hostname) + '">Delete</button>';
  html += '</div>';

  if (specs.length > 0) {
    html += '<ul class="spec-list">';
    for (var j = 0; j < specs.length; j++) {
      var spec = specs[j];
      html += '<li>';
      html += '<span class="spec-filename">' + escapeHtml(spec.filename || 'Unnamed spec') + '</span>';
      html += '<span class="spec-loaded">Loaded: ' + escapeHtml(formatDate(spec.loadedAt)) + '</span>';
      html += '<button class="btn btn-sm btn-danger delete-spec-btn" data-hostname="' + escapeAttr(hostname) + '" data-spec-id="' + escapeAttr(spec.id) + '">Delete</button>';
      html += '</li>';
    }
    html += '</ul>';
  }

  html += '</div>';
  return html;
}

/**
 * Attach event listeners to project card buttons.
 */
function attachProjectListeners() {
  var renameBtns = document.querySelectorAll('.rename-project-btn');
  var deleteProjBtns = document.querySelectorAll('.delete-project-btn');
  var deleteSpecBtns = document.querySelectorAll('.delete-spec-btn');

  for (var i = 0; i < renameBtns.length; i++) {
    renameBtns[i].addEventListener('click', handleRenameClick);
  }

  for (var j = 0; j < deleteProjBtns.length; j++) {
    deleteProjBtns[j].addEventListener('click', handleDeleteProjectClick);
  }

  for (var k = 0; k < deleteSpecBtns.length; k++) {
    deleteSpecBtns[k].addEventListener('click', handleDeleteSpecClick);
  }
}

/**
 * Handle rename button click — replace project name with an inline text input.
 * @param {Event} e
 */
function handleRenameClick(e) {
  var btn = e.currentTarget;
  var hostname = btn.getAttribute('data-hostname');
  var currentName = btn.getAttribute('data-name');
  var header = btn.parentElement;
  var nameSpan = header.querySelector('.project-name');

  // Replace name span with input
  var input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = currentName;
  nameSpan.style.display = 'none';
  header.insertBefore(input, nameSpan.nextSibling);
  input.focus();
  input.select();

  // Hide rename button while editing
  btn.style.display = 'none';

  function commitRename() {
    var newName = input.value.trim();
    if (newName && newName !== currentName) {
      renameProject(hostname, newName).then(function () {
        renderProjects();
      });
    } else {
      renderProjects();
    }
  }

  input.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') {
      commitRename();
    } else if (ev.key === 'Escape') {
      renderProjects();
    }
  });

  input.addEventListener('blur', function () {
    commitRename();
  });
}

/**
 * Handle delete project button click.
 * @param {Event} e
 */
function handleDeleteProjectClick(e) {
  var btn = e.currentTarget;
  var hostname = btn.getAttribute('data-hostname');

  if (confirm('Are you sure you want to delete the project "' + hostname + '"? This cannot be undone.')) {
    deleteFavourites(hostname).then(function () {
      return deleteProject(hostname);
    }).then(function () {
      renderProjects();
    });
  }
}

/**
 * Handle delete spec button click.
 * @param {Event} e
 */
function handleDeleteSpecClick(e) {
  var btn = e.currentTarget;
  var hostname = btn.getAttribute('data-hostname');
  var specId = btn.getAttribute('data-spec-id');

  if (confirm('Are you sure you want to delete this spec? This cannot be undone.')) {
    deleteSpec(hostname, specId).then(function () {
      renderProjects();
    });
  }
}

/**
 * Handle Export All button click.
 */
function handleExportAll() {
  exportAll().then(function (data) {
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'tomation-export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

/**
 * Handle Import button click — trigger file input.
 */
function handleImportClick() {
  document.getElementById('import-file-input').click();
}

/**
 * Handle file input change for import.
 * @param {Event} e
 */
function handleImportFileChange(e) {
  var file = e.target.files[0];
  if (!file) {
    return;
  }

  var reader = new FileReader();
  reader.onload = function (ev) {
    var data;
    try {
      data = JSON.parse(ev.target.result);
    } catch (err) {
      alert('Invalid JSON file.');
      return;
    }

    importAll(data, showConflictModal).then(function () {
      renderProjects();
    });
  };
  reader.readAsText(file);

  // Reset file input so the same file can be imported again
  e.target.value = '';
}

/**
 * Show the conflict modal and return a promise that resolves with 'merge' or 'replace'.
 * @param {string} hostname
 * @returns {Promise<string>}
 */
function showConflictModal(hostname) {
  return new Promise(function (resolve) {
    var modal = document.getElementById('conflict-modal');
    var message = document.getElementById('conflict-message');
    var mergeBtn = document.getElementById('conflict-merge-btn');
    var replaceBtn = document.getElementById('conflict-replace-btn');

    message.textContent = 'The project "' + hostname + '" already exists. Would you like to merge the specs or replace the existing project?';
    modal.classList.add('visible');

    function cleanup() {
      modal.classList.remove('visible');
      mergeBtn.removeEventListener('click', onMerge);
      replaceBtn.removeEventListener('click', onReplace);
    }

    function onMerge() {
      cleanup();
      resolve('merge');
    }

    function onReplace() {
      cleanup();
      resolve('replace');
    }

    mergeBtn.addEventListener('click', onMerge);
    replaceBtn.addEventListener('click', onReplace);
  });
}

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
    .replace(/"/g, '&quot;');
}

/**
 * Escape a string for use in an HTML attribute.
 * @param {string} str
 * @returns {string}
 */
function escapeAttr(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format an ISO date string for display.
 * @param {string} isoStr
 * @returns {string}
 */
function formatDate(isoStr) {
  if (!isoStr) return '';
  var d = new Date(isoStr);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function () {
  renderProjects();

  document.getElementById('export-btn').addEventListener('click', handleExportAll);
  document.getElementById('import-btn').addEventListener('click', handleImportClick);
  document.getElementById('import-file-input').addEventListener('change', handleImportFileChange);
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderProjects: renderProjects,
    buildProjectCard: buildProjectCard,
    handleExportAll: handleExportAll,
    handleImportClick: handleImportClick,
    handleImportFileChange: handleImportFileChange,
    showConflictModal: showConflictModal,
    escapeHtml: escapeHtml,
    escapeAttr: escapeAttr,
    formatDate: formatDate
  };
}
