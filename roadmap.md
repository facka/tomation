# Project Roadmap

- [ ] Migrate options page to Vue3 with font-awesome icons
  - Rewrite the current options/settings page using Vue 3 Composition API
  - Replace existing icon set with Font Awesome for consistency and wider icon coverage
  - Ensure backward compatibility with saved user preferences during migration

- [x] Add html inspector to autogenerate POM files code
  - Build a browser-based HTML inspector tool that analyzes page structure
  - Automatically generate Page Object Model (POM) class files from selected elements
  - Support configurable selectors (id, class, data attributes, CSS, XPath)
  - Output generated code in @tomation/dsl format

- [x] VSCode extension for linting code and checking errors before running compile process
  - Create a VSCode extension that validates project-specific syntax and structure
  - Provide real-time error highlighting and diagnostic messages in the editor
  - Catch common mistakes early to reduce failed compile cycles
  - Include quick-fix suggestions for known error patterns
  
- [x] Remove old index.html and panel.js files
  - Identify and remove deprecated index.html and panel.js that are no longer in use
  - Verify no remaining references or imports depend on these files
  - Update documentation to reflect the removed files

- [ ] Simplify build process. Use turbo repo?  - Evaluate Turborepo as a monorepo build orchestration tool
  - Compare alternatives (Nx, Lerna) for caching, task parallelism, and ease of setup
  - Goal: reduce build times, simplify CI/CD pipeline, and improve developer experience
  - Migrate existing scripts incrementally to avoid breaking current workflows

- [x] In the playground app, each example app should have access to test source code (similar to home page) for reference and compare easily with the test plan when it's displayed in the extension panel

- [x] In playground home page add a Get Started button, with step by step to implement first tomation script

- [x] Create tomation cli with `tomation init` command to create a starter project

- [x] Add Keypress action and update documentation (playground home page, docs, readme and tomation-ai.md )

- Add CI/CD in github action to publish extension to stores
  Chrome: https://github.com/marketplace/actions/publish-chrome-extension
  Edge: https://github.com/wdzeng/edge-addon
  Firefox: https://github.com/wdzeng/firefox-addon

- [ ] Loop / iterator in the DSL
  - Add a loop construct that repeats a block of steps until a stop condition is met
  - Reuse the existing conditional machinery (if/When/ctxIf): parse the body like a then-block and the stop condition via the existing condition extractor
  - Evaluate the condition at runtime and splice iterations dynamically in the step loop (same pattern as ctxIf)
  - Include a safety guard (max iterations) to prevent infinite loops, and respect pause/stop
  - Decide condition scope (params/ctx vs DOM predicates) and loop semantics (while vs until)

- [ ] ApiCall action in the DSL
  - Add a step to make HTTP requests (GET/POST/PUT/DELETE/PATCH) from the background service worker
  - Support URL, headers, and body with {{data.*}} and {{ctx.*}} token resolution; no new permissions needed (host access already granted)
  - Save the response into the context store for use in later steps; define success/failure semantics (network error vs HTTP status)
  - Render method, URL, and result/status in the run log (mirroring the AssertRequest metadata display)
  - Consider masking secrets/auth headers in the execution log

- [ ] Regression suite execution reports synced via Git
  - Tests still run one at a time, by hand, so the tester can watch each execution (human eye catches extra issues)
  - Add a CLI command `tomation regression-suite <name>` where `<name>` is the release version; on start it creates or checks out that branch and launches a local HTTP server (same pattern as `tomation watch`)
  - The extension detects "regression mode" by polling the server (like the live-reload polling) and shows an indicator; when active, it POSTs each test's result to the server after the run finishes
  - On receiving a result the CLI writes it to the repo and runs pull + commit + push so multiple testers converge on the same release branch
  - Prefer one file per result (append-only, e.g. reports/<name>/<test>-<tester>-<env>-<timestamp>.json) over editing a single shared JSON, to avoid merge conflicts; produce the consolidated report by aggregation on demand

  - QA-standards design goals (align with ISTQB / ISO-IEC-IEEE 29119-3):
    - Result statuses beyond pass/fail: use an ISTQB-aligned enum — Pass, Fail, Blocked, Skipped, Not Run, (optionally) Not Applicable / Retest — so blocked and not-run states are first-class
    - Suite progress / coverage: model the full set of project tests as the denominator so the report shows execution progress ("X of N executed", with Not Run tracked), not just loose results — this is what makes it a real regression report
    - Interoperable export: in addition to the native JSON/CSV, emit a standard format — JUnit XML (de-facto CI) and/or CTRF (modern JSON) — so the report integrates with CI and reporting tools
    - Environment metadata: capture the execution environment on every result (browser + version, OS, target URL/environment, build/commit under test) for reproducibility and comparability across testers
    - Failure evidence: on a failure, attach diagnostics (error message, and ideally the existing network/state capture) so the result is auditable
    - Flaky / retry handling: record each attempt (do not overwrite) and distinguish "passed on retry" (flaky) from a clean pass

  - Environments defined in `tomation.config.ts`: declare the valid environments (e.g. Chrome, Firefox, Safari, Edge) so each recorded execution is tagged with the environment it ran in; the extension knows and reports its own environment automatically

  - Live progress push: when the server pulls (new results arrived from other testers), it notifies connected extensions in "regression mode" so they can display up-to-date suite progress in real time (push/notify, not just the extension polling its own results)

  - Session connect/disconnect: testers can connect to and disconnect from a regression session from the extension at any time; the backend (CLI server) keeps running independently of any connected client, and a reconnecting tester re-syncs current progress

  - Report format: native JSON/CSV plus a standard export (JUnit/CTRF); make it exportable
  - Open decisions: tester identity (git config vs flag), branch policy (uncommitted changes, base branch, first push upstream), commit/push granularity and retry on rejected push, re-run/flaky handling, and how much per-result detail to store (pass/fail+time vs network/error captures)
  - Notes / limits: the watch-style server is local HTTP with no auth (CORS *) — acceptable for local regression, but validate the POST payload shape and consider result integrity/attribution since results can inform a release decision. Requires the project to be a Git repo with a configured remote and credentials. Git is great for traceability/immutability but is not a query backend (no live dashboards/queries at scale) — a dedicated test-management tool is the path if this grows
