'use strict';

module.exports = {
  name: 'Tomation',
  version: '1.0.1',
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