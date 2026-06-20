#!/usr/bin/env node
/**
 * Build script for Tomation extension.
 * Generates browser-specific builds in dist/chrome and dist/firefox.
 *
 * Usage:
 *   node build.js          - builds both targets
 *   node build.js chrome   - builds Chrome/Edge only
 *   node build.js firefox  - builds Firefox only
 */

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var DIST = path.join(ROOT, 'dist');

// Files to copy into both builds
var SHARED_FILES = [
  'src/background.js',
  'src/runtime.js',
  'src/panel.html',
  'src/panel.js',
  'src/options.html',
  'src/options.js',
  'src/storage.js'
];

// Playground directories to copy
var PLAYGROUND_DIRS = ['login', 'todo', 'navigation'];

// ---------------------------------------------------------------------------
// Manifest templates
// ---------------------------------------------------------------------------

var BASE_MANIFEST = {
  name: 'Tomation',
  version: '0.0.1',
  description: 'Browser automation and testing via a sidebar panel',
  permissions: ['storage', 'tabs'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/runtime.js'],
      run_at: 'document_idle'
    }
  ],
  options_page: 'src/options.html',
  icons: {
    '16': 'icons/icon-16.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png'
  }
};

function chromeManifest() {
  return Object.assign({}, BASE_MANIFEST, {
    manifest_version: 3,
    permissions: BASE_MANIFEST.permissions.concat(['sidePanel']),
    background: {
      service_worker: 'src/background.js'
    },
    side_panel: {
      default_path: 'src/panel.html'
    },
    action: {
      default_title: 'Tomation'
    }
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
    }
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
