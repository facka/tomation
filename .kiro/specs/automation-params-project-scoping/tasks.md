# Implementation Plan

## Overview

Fix automation params and favourites storage to be project-scoped instead of using global keys. This eliminates cross-project collisions and orphaned data on project deletion by moving `savedParams` and `favourites` inside the project object in `chrome.storage.local`.

## Tasks

- [~] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Cross-Project Param Collision and Orphaned Keys
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate params leak across projects and keys are orphaned on deletion
  - **Scoped PBT Approach**: Scope the property to concrete failing cases:
    - Two projects with same automation name ("Login Flow") saving different params — loadParamValues returns wrong project's values
    - Delete project — `automation_favourites_{hostname}` key remains in storage
  - Test that `saveParamValues(hostnameA, "Login Flow", {user: "admin"})` followed by `loadParamValues(hostnameB, "Login Flow")` returns `null` (not hostnameA's values)
  - Test that `saveFavourites(hostname, favs)` stores inside `project.favourites` (not under a separate key)
  - Test that `deleteProject(hostname)` removes the legacy `automation_favourites_{hostname}` key
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists: params collide across projects, favourites stored externally, deleteProject leaves orphaned keys)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.3, 1.4, 1.5_

- [~] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Param Storage Operations Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code: `addSpec(hostname, filename, spec)` adds spec to project.specs
  - Observe on UNFIXED code: `deleteSpec(hostname, specId)` removes spec from project.specs
  - Observe on UNFIXED code: `renameProject(hostname, newName)` updates project.name
  - Observe on UNFIXED code: `getTestPlanConfig(key)` returns stored config or defaults
  - Observe on UNFIXED code: `saveTestPlanConfig(key, config)` persists config under key
  - Observe on UNFIXED code: `loadParamValues(name)` returns `null` when no params are saved
  - Observe on UNFIXED code: `loadFavourites(hostname)` returns `{}` when no favourites are saved
  - Write property-based test: for all non-param/non-favourite storage operations, the fixed code produces the same results as the original
  - Write property-based test: single-project param round-trip (save then load within same project) returns saved values
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [-] 3. Fix for automation params and favourites project scoping

  - [x] 3.1 Refactor `saveParamValues` in `storage.js`
    - Add `hostname` as first parameter: `saveParamValues(hostname, automationName, params)`
    - Read project via `getProject(hostname)`
    - Initialize `project.savedParams` as empty object if missing
    - Set `project.savedParams[automationName] = params`
    - Call `saveProject(hostname, project)` to persist
    - Remove the separate `automation_params_{automationName}` key write
    - Keep `.catch` with `console.error` for silent fail
    - _Bug_Condition: isBugCondition(input) where input.operation = 'saveParamValues' AND storageKey is global_
    - _Expected_Behavior: params stored inside project.savedParams[automationName]_
    - _Preservation: single-project param round-trip continues working_
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 Refactor `loadParamValues` in `storage.js`
    - Add `hostname` as first parameter: `loadParamValues(hostname, automationName)`
    - Read project via `getProject(hostname)`
    - Return `project.savedParams[automationName]` if present, otherwise `null`
    - Remove the separate `automation_params_{automationName}` key read
    - Keep `.catch` with `console.error` returning `null` for silent fail
    - _Bug_Condition: isBugCondition(input) where input.operation = 'loadParamValues' AND storageKey is global_
    - _Expected_Behavior: reads exclusively from project.savedParams[automationName], no cross-project collision_
    - _Preservation: returns null when no params saved_
    - _Requirements: 2.3, 3.4_

  - [x] 3.3 Refactor `saveFavourites` in `storage.js`
    - Read project via `getProject(hostname)`
    - Set `project.favourites = favourites`
    - Call `saveProject(hostname, project)` to persist
    - Remove the separate `automation_favourites_{hostname}` key write
    - Keep `.catch` with `console.error` for silent fail
    - _Bug_Condition: isBugCondition(input) where input.operation = 'saveFavourites' AND storageKey is external_
    - _Expected_Behavior: favourites stored inside project.favourites_
    - _Requirements: 2.5_

  - [x] 3.4 Refactor `loadFavourites` in `storage.js`
    - Read project via `getProject(hostname)`
    - Return `project.favourites` if present
    - Fall back to reading legacy key `automation_favourites_{hostname}` for backward compatibility
    - Return `{}` if neither exists
    - Keep `.catch` with `console.error` returning `{}` for silent fail
    - _Bug_Condition: isBugCondition(input) where input.operation = 'loadFavourites' AND storageKey is external_
    - _Expected_Behavior: reads from project.favourites with legacy fallback_
    - _Preservation: returns {} when no favourites saved_
    - _Requirements: 2.6, 3.4_

  - [x] 3.5 Refactor `deleteFavourites` in `storage.js`
    - Read project via `getProject(hostname)`
    - Delete `project.favourites` from the project object
    - Call `saveProject(hostname, project)` to persist
    - Also remove the legacy `automation_favourites_{hostname}` key
    - Keep `.catch` with `console.error` for silent fail
    - _Requirements: 2.4_

  - [x] 3.6 Refactor `deleteProject` in `storage.js`
    - Before removing the hostname key, also remove the legacy `automation_favourites_{hostname}` key
    - Use `api.storage.local.remove([hostname, 'automation_favourites_' + hostname])` to remove both in one call
    - _Bug_Condition: isBugCondition(input) where input.operation = 'deleteProject' AND orphanedKeysExist_
    - _Expected_Behavior: no orphaned keys remain after project deletion_
    - _Preservation: project record itself is still removed_
    - _Requirements: 2.4, 3.2_

  - [x] 3.7 Update `panel.js` callers to pass `currentHostname`
    - In `showRunSummary`: change `saveParamValues(currentRunAutomationParams.name, currentRunAutomationParams.params)` to `saveParamValues(currentHostname, currentRunAutomationParams.name, currentRunAutomationParams.params)`
    - In quick-run (`onQuickRunClick`): change `loadParamValues(automation.name)` to `loadParamValues(currentHostname, automation.name)`
    - In param form pre-fill: change `loadParamValues(currentRunnable.data.name)` to `loadParamValues(currentHostname, currentRunnable.data.name)`
    - _Requirements: 2.2, 2.3_

  - [x] 3.8 Simplify `handleDeleteProjectClick` in `options.js`
    - Remove the explicit `deleteFavourites(hostname)` call since `deleteProject` now handles legacy key cleanup
    - Change from `deleteFavourites(hostname).then(function () { return deleteProject(hostname); }).then(...)` to `deleteProject(hostname).then(function () { renderProjects(); })`
    - _Requirements: 2.4_

  - [x] 3.9 Update `module.exports` in `storage.js`
    - Ensure exports reflect updated function signatures (no code change needed if names unchanged, but verify)
    - _Requirements: 2.1, 2.2, 2.3_

  - [-] 3.10 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Cross-Project Param Isolation and Clean Deletion
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms params are project-scoped and no orphaned keys remain
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.11 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Param Storage Operations Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [~] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All code must be ES5-compatible (no arrow functions, no `const`/`let`, no template literals, no destructuring). Use `var`, `function` expressions, and string concatenation.
- Do NOT run tests from the agent — the user will run tests manually and report results.
- The `chrome.storage.local` API is wrapped via the `api` object in `storage.js`. All storage calls go through `api.storage.local.get()`, `api.storage.local.set()`, and `api.storage.local.remove()`.
- Backward compatibility: `loadFavourites` must fall back to the legacy `automation_favourites_{hostname}` key for projects that haven't been migrated yet.
- The `deleteProject` cleanup of the legacy favourites key handles the case where migration hasn't occurred.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 0,
      "tasks": ["1", "2"],
      "description": "Exploration and preservation tests (independent, run before fix)"
    },
    {
      "wave": 1,
      "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6"],
      "description": "Storage.js refactoring (parallel, each modifies a different function)"
    },
    {
      "wave": 2,
      "tasks": ["3.7", "3.8", "3.9"],
      "description": "Caller updates in panel.js and options.js (depend on storage.js being updated)"
    },
    {
      "wave": 3,
      "tasks": ["3.10", "3.11"],
      "description": "Verification (depend on fix being complete)"
    },
    {
      "wave": 4,
      "tasks": ["4"],
      "description": "Final checkpoint (all tasks complete)"
    }
  ]
}
```
