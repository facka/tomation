#!/usr/bin/env node
/**
 * Build script for Tomation extension.
 * Generates browser-specific builds in dist/chrome and dist/firefox.
 * Uses the Vue panel build output from panel-vue/dist/.
 *
 * Usage:
 *   node build.js          - builds both targets
 *   node build.js chrome   - builds Chrome/Edge only
 *   node build.js firefox  - builds Firefox only
 */

var fs = require('fs');
var path = require('path');
var BASE_MANIFEST = require('./base-manifest');

var ROOT = __dirname;
var DIST = path.join(ROOT, 'dist');

// Files to copy into both builds (panel is handled separately via Vue build output)
var SHARED_FILES = [
  'src/background.js',
  'src/runtime.js',
  'src/options.html',
  'src/options.js',
  'src/storage.js',
  'src/inspector.js',
  'src/faker.js'
];

// Playground directories to copy
var PLAYGROUND_DIRS = ['login', 'todo', 'navigation', 'user-form'];

// ---------------------------------------------------------------------------
// Manifest templates
// ---------------------------------------------------------------------------

function chromeManifest() {
  return Object.assign({}, BASE_MANIFEST, {
    manifest_version: 3,
    permissions: BASE_MANIFEST.permissions.concat(['sidePanel', 'scripting']),
    host_permissions: ['<all_urls>'],
    background: {
      service_worker: 'src/background.js'
    },
    side_panel: {
      default_path: 'src/panel.html'
    },
    action: {
      default_title: 'Tomation'
    },
    web_accessible_resources: [{
      resources: ['bundled/tomation-ai.md'],
      matches: ['<all_urls>']
    }]
  });
}

function firefoxManifest() {
  return Object.assign({}, BASE_MANIFEST, {
    manifest_version: 2,
    background: {
      scripts: ['src/storage.js', 'src/background.js']
    },
    sidebar_action: {
      default_panel: 'src/panel.html',
      default_title: 'Tomation',
      default_icon: 'icons/icon-16.png',
      open_at_install: true
    },
    browser_action: {
      default_title: 'Tomation',
      default_icon: {
        '16': 'icons/icon-16.png',
        '48': 'icons/icon-48.png'
      }
    },
    browser_specific_settings: {
      gecko: {
        id: 'tomation@example.com',
        strict_min_version: '54.0'
      }
    },
    web_accessible_resources: ['bundled/tomation-ai.md']
  });
}

// ---------------------------------------------------------------------------
// File copy helpers
// ---------------------------------------------------------------------------

function mkdirp(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  mkdirp(dest);
  var entries = fs.readdirSync(src);
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var srcPath = path.join(src, entry);
    var destPath = path.join(dest, entry);
    var stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
  mkdirp(dir);
}

// ---------------------------------------------------------------------------
// Build functions
// ---------------------------------------------------------------------------

function buildTarget(target) {
  var targetDir = path.join(DIST, target);
  cleanDir(targetDir);

  // Write manifest
  var manifest = target === 'chrome' ? chromeManifest() : firefoxManifest();
  fs.writeFileSync(
    path.join(targetDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );

  // Copy Vue panel build output (panel.html + panel.js + panel.css)
  var vuePanelDir = path.join(ROOT, 'panel-vue', 'dist');
  if (!fs.existsSync(path.join(vuePanelDir, 'index.html'))) {
    console.error('Vue panel build output not found: ' + vuePanelDir);
    console.error('Run "npm run build" in packages/extension/panel-vue/ first.');
    process.exit(1);
  }
  // Copy index.html as panel.html
  copyFile(path.join(vuePanelDir, 'index.html'), path.join(targetDir, 'src', 'panel.html'));
  // Copy panel.js
  var vuePanelJs = path.join(vuePanelDir, 'panel.js');
  if (fs.existsSync(vuePanelJs)) {
    copyFile(vuePanelJs, path.join(targetDir, 'src', 'panel.js'));
  }
  // Copy panel.css if it exists
  var vuePanelCss = path.join(vuePanelDir, 'style.css');
  if (fs.existsSync(vuePanelCss)) {
    copyFile(vuePanelCss, path.join(targetDir, 'src', 'style.css'));
  }

  // Copy shared files
  for (var i = 0; i < SHARED_FILES.length; i++) {
    var file = SHARED_FILES[i];
    copyFile(path.join(ROOT, file), path.join(targetDir, file));
  }

  // Copy playground
  for (var j = 0; j < PLAYGROUND_DIRS.length; j++) {
    var pgDir = PLAYGROUND_DIRS[j];
    var src = path.join(ROOT, 'playground', pgDir);
    if (fs.existsSync(src)) {
      copyDir(src, path.join(targetDir, 'playground', pgDir));
    }
  }

  // Copy icons (create placeholder if not exists)
  var iconsDir = path.join(ROOT, 'icons');
  if (fs.existsSync(iconsDir)) {
    copyDir(iconsDir, path.join(targetDir, 'icons'));
  } else {
    mkdirp(path.join(targetDir, 'icons'));
  }

  // Copy bundled spec
  var bundledSpecSrc = path.join(ROOT, '../../examples/playground-tests/playground-tests.tomation.json');
  var bundledSpecDest = path.join(targetDir, 'bundled', 'playground-tests.tomation.json');
  copyFile(bundledSpecSrc, bundledSpecDest);

  // Copy bundled skills file (tomation-ai.md)
  var skillsFileSrc = path.join(ROOT, '../../tomation-ai.md');
  if (!fs.existsSync(skillsFileSrc)) {
    console.error('Skills file not found: ' + skillsFileSrc);
    console.error('Expected tomation-ai.md at project root.');
    process.exit(1);
  }
  var skillsFileDest = path.join(targetDir, 'bundled', 'tomation-ai.md');
  copyFile(skillsFileSrc, skillsFileDest);

  console.log('Built: dist/' + target + '/');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

var args = process.argv.slice(2);
var targets = args.length > 0 ? args : ['chrome', 'firefox'];

for (var i = 0; i < targets.length; i++) {
  var t = targets[i];
  if (t !== 'chrome' && t !== 'firefox') {
    console.error('Unknown target: ' + t + '. Use "chrome" or "firefox".');
    process.exit(1);
  }
  buildTarget(t);
}

console.log('Done.');
