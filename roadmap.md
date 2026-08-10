# Project Roadmap

- [ ] Migrate options page to Vue3 with font-awesome icons
  - Rewrite the current options/settings page using Vue 3 Composition API
  - Replace existing icon set with Font Awesome for consistency and wider icon coverage
  - Ensure backward compatibility with saved user preferences during migration

- [ ] Add html inspector to autogenerate POM files code
  - Build a browser-based HTML inspector tool that analyzes page structure
  - Automatically generate Page Object Model (POM) class files from selected elements
  - Support configurable selectors (id, class, data attributes, CSS, XPath)
  - Output generated code in @tomation/dsl format

- [ ] VSCode extension for linting code and checking errors before running compile process
  - Create a VSCode extension that validates project-specific syntax and structure
  - Provide real-time error highlighting and diagnostic messages in the editor
  - Catch common mistakes early to reduce failed compile cycles
  - Include quick-fix suggestions for known error patterns
  
- [ ] Remove old index.html and panel.js files
  - Identify and remove deprecated index.html and panel.js that are no longer in use
  - Verify no remaining references or imports depend on these files
  - Update documentation to reflect the removed files

- [ ] Simplify build process. Use turbo repo?  - Evaluate Turborepo as a monorepo build orchestration tool
  - Compare alternatives (Nx, Lerna) for caching, task parallelism, and ease of setup
  - Goal: reduce build times, simplify CI/CD pipeline, and improve developer experience
  - Migrate existing scripts incrementally to avoid breaking current workflows

- [ ] In the playground app, each example app should have access to test source code (similar to home page) for reference and compare easily with the test plan when it's displayed in the extension panel