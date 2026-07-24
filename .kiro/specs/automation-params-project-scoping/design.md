# Automation Params Project Scoping — Bugfix Design

## Overview

Automation parameter values and favourites are stored in separate global `chrome.storage.local` keys rather than inside the project object. This causes cross-project collisions (two projects with same-named automations share params) and orphaned data on project deletion. The fix moves both `savedParams` and `favourites` inside the project object so data is project-scoped and automatically cleaned up on deletion.

## Glossary

- **Bug_Condition (C)**: Any storage operation (`saveParamValues`, `loadParamValues`, `saveFavourites`, `loadFavourites`, `deleteProject`) that reads or writes automation params or favourites using the current global-key scheme
- **Property (P)**: Params and favourites are stored inside `project.savedParams` and `project.favourites` respectively, scoped per project
- **Preservation**: All non-param/non-favourite storage operations (`saveProject`, `addSpec`, `deleteSpec`, `renameProject`, `getTestPlanConfig`, `saveTestPlanConfig`) continue to work identically
- **saveParamValues**: Function in `storage.js` that persists last-used automation parameter values
- **loadParamValues**: Function in `storage.js` that retrieves stored automation parameter values for form pre-fill and quick-run
- **saveFavourites**: Function in `storage.js` that persists favourite automations for a hostname
- **loadFavourites**: Function in `storage.js` that retrieves favourite automations for a hostname
- **deleteProject**: Function in `storage.js` that removes an entire project from storage
- **currentHostname**: Global state in `panel.js` holding the active project's hostname

## Bug Details

### Bug Condition

The bug manifests when automation param values or favourites are saved/loaded using global storage keys that are not scoped to a specific project. The `saveParamValues` function stores under `automation_params_{automationName}` (collides across projects with same automation names) and `saveFavourites` stores under `automation_favourites_{hostname}` (orphaned on deletion).

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type StorageOperation
  OUTPUT: boolean

  RETURN (input.operation = 'saveParamValues'
          AND input.storageKey = 'automation_params_' + input.automationName
          AND NOT keyIsInsideProjectObject(input.storageKey))
         OR (input.operation = 'loadParamValues'
          AND input.storageKey = 'automation_params_' + input.automationName
          AND NOT keyIsInsideProjectObject(input.storageKey))
         OR (input.operation = 'saveFavourites'
          AND input.storageKey = 'automation_favourites_' + input.hostname
          AND NOT keyIsInsideProjectObject(input.storageKey))
         OR (input.operation = 'loadFavourites'
          AND input.storageKey = 'automation_favourites_' + input.hostname
          AND NOT keyIsInsideProjectObject(input.storageKey))
         OR (input.operation = 'deleteProject'
          AND orphanedKeysExist(input.hostname))
END FUNCTION
```

### Examples

- **Cross-project collision**: Project A (`app.example.com`) and Project B (`staging.example.com`) both have an automation named "Login Flow". User saves params `{username: "admin"}` in Project A. When Project B loads params for "Login Flow", it gets `{username: "admin"}` from Project A's data.
- **Orphaned favourites**: User marks "Login Flow" as favourite in `app.example.com`. User deletes the project. The key `automation_favourites_app.example.com` remains in storage permanently.
- **Orphaned params**: User runs "Login Flow" with params in `app.example.com`. User deletes the project. The key `automation_params_Login Flow` remains in storage permanently.
- **Expected behavior after fix**: User saves params in Project A. Project B loading the same automation name gets `null` (no saved values for that project). Deleting Project A removes everything in one `api.storage.local.remove(hostname)` call.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- All existing storage operations (`saveProject`, `addSpec`, `deleteSpec`, `renameProject`, `getAllProjects`, `exportAll`, `importAll`, `getTestPlanConfig`, `saveTestPlanConfig`, `saveActiveTab`, `loadActiveTab`) must continue to function identically
- Mouse clicks, UI rendering, and panel navigation must remain unchanged
- `loadParamValues` returning `null` when no params are saved must continue to work
- `loadFavourites` returning `{}` when no favourites are saved must continue to work
- A single-project workflow (save params, reload panel, params are pre-filled) must continue working

**Scope:**
All inputs that do NOT involve `saveParamValues`, `loadParamValues`, `saveFavourites`, `loadFavourites`, or `deleteProject` should be completely unaffected by this fix. This includes:
- Test plan configuration read/write
- Spec add/delete operations
- Project rename operations
- Active tab persistence
- Export/import flows

## Hypothesized Root Cause

Based on the bug description, the root causes are:

1. **Global Key Scheme for Params**: `saveParamValues` uses `automation_params_{automationName}` as the storage key. Since automation names are not globally unique (two projects can define automations with the same name), this key is shared across projects causing value collisions.

2. **Separate Key for Favourites**: `saveFavourites` stores under `automation_favourites_{hostname}`. While this is hostname-scoped (no collision), it lives outside the project object, so `deleteProject(hostname)` (which only calls `api.storage.local.remove(hostname)`) does not clean it up.

3. **No Cleanup in deleteProject**: The `deleteProject` function only removes the hostname key itself. It does not enumerate or remove related `automation_params_*` or `automation_favourites_*` keys.

4. **Callers Don't Pass Hostname**: In `panel.js`, calls to `saveParamValues` and `loadParamValues` only pass the automation name — they don't pass `currentHostname`, making project-scoped storage impossible without changing the API.

## Correctness Properties

Property 1: Bug Condition - Params and Favourites Are Project-Scoped

_For any_ storage operation where `saveParamValues(hostname, automationName, params)` is called, the fixed function SHALL store `params` inside the project object at `project.savedParams[automationName]`, and `loadParamValues(hostname, automationName)` SHALL read exclusively from `project.savedParams[automationName]`, ensuring no cross-project collisions occur.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Non-Param Storage Operations Unchanged

_For any_ storage operation that is NOT `saveParamValues`, `loadParamValues`, `saveFavourites`, `loadFavourites`, or `deleteProject`, the fixed code SHALL produce exactly the same behavior as the original code, preserving all existing functionality for unrelated storage operations.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `packages/extension/src/storage.js`

**Functions**: `saveParamValues`, `loadParamValues`, `saveFavourites`, `loadFavourites`, `deleteFavourites`, `deleteProject`

**Specific Changes**:

1. **Change `saveParamValues` signature**: Add `hostname` as first parameter. Read the project via `getProject(hostname)`, initialize `project.savedParams` if missing, set `project.savedParams[automationName] = params`, and call `saveProject(hostname, project)`. Remove separate key write.

2. **Change `loadParamValues` signature**: Add `hostname` as first parameter. Read the project via `getProject(hostname)`, return `project.savedParams[automationName]` or `null` if not set.

3. **Change `saveFavourites` implementation**: Read the project via `getProject(hostname)`, set `project.favourites = favourites`, call `saveProject(hostname, project)`. Remove separate key write.

4. **Change `loadFavourites` implementation**: Read the project via `getProject(hostname)`, return `project.favourites` if present. If not present, fall back to reading the legacy key `automation_favourites_{hostname}` for backward compatibility. Return `{}` if neither exists.

5. **Change `deleteFavourites` implementation**: Read the project, delete `project.favourites`, save the project back. Also remove the legacy `automation_favourites_{hostname}` key.

6. **Change `deleteProject` implementation**: Before removing the hostname key, also remove the legacy `automation_favourites_{hostname}` key if present (handles case where migration has not occurred yet).

**File**: `packages/extension/src/panel.js`

**Callers to update**:

7. **`showRunSummary` (line ~1568)**: Change `saveParamValues(currentRunAutomationParams.name, currentRunAutomationParams.params)` to `saveParamValues(currentHostname, currentRunAutomationParams.name, currentRunAutomationParams.params)`.

8. **Quick-run `loadParamValues` (line ~412)**: Change `loadParamValues(automation.name)` to `loadParamValues(currentHostname, automation.name)`.

9. **Param form pre-fill `loadParamValues` (line ~989)**: Change `loadParamValues(currentRunnable.data.name)` to `loadParamValues(currentHostname, currentRunnable.data.name)`.

**File**: `packages/extension/src/options.js`

10. **`handleDeleteProjectClick`**: Remove the explicit `deleteFavourites(hostname)` call since `deleteProject` now handles legacy key cleanup internally. Simplify to just `deleteProject(hostname).then(renderProjects)`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate two projects with same-named automations saving and loading params. Run these tests on the UNFIXED code to observe that values collide.

**Test Cases**:
1. **Cross-Project Param Collision**: Save params for "Login" in project A, then load params for "Login" in project B — unfixed code returns project A's values (will fail on unfixed code)
2. **Orphaned Params on Delete**: Save params, delete project, check `automation_params_*` key still exists (will fail on unfixed code)
3. **Orphaned Favourites on Delete**: Save favourites, delete project via `api.storage.local.remove(hostname)`, check `automation_favourites_*` key still exists (will fail on unfixed code)
4. **Favourites Not Inside Project**: Call `saveFavourites`, inspect project object — favourites field is absent (will fail on unfixed code)

**Expected Counterexamples**:
- `loadParamValues("Login")` returns values from a different project
- After `deleteProject("app.example.com")`, the key `automation_favourites_app.example.com` still exists in storage

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedStorageOperation(input)
  ASSERT paramsAreProjectScoped(result)
  ASSERT noOrphanedKeysExist(result)
  ASSERT noCrossProjectCollision(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-param/non-favourite operations, then write property-based tests capturing that behavior.

**Test Cases**:
1. **addSpec Preservation**: Verify adding specs works identically before and after fix
2. **deleteSpec Preservation**: Verify deleting specs works identically before and after fix
3. **renameProject Preservation**: Verify renaming projects works identically before and after fix
4. **getTestPlanConfig Preservation**: Verify config read/write works identically before and after fix
5. **Single-Project Param Round-Trip**: Verify saving and loading params within the same project continues to work correctly

### Unit Tests

- Test `saveParamValues` stores inside project object under `savedParams` key
- Test `loadParamValues` reads from project object, returns `null` when no params saved
- Test `saveFavourites` stores inside project object under `favourites` key
- Test `loadFavourites` reads from project object, falls back to legacy key
- Test `deleteProject` removes legacy favourites key alongside project
- Test cross-project isolation: two projects with same automation name get independent params

### Property-Based Tests

- Generate random automation names and hostnames, verify params never leak across projects
- Generate random sequences of save/load/delete operations, verify no orphaned keys remain
- Generate random project states, verify non-param operations produce identical results

### Integration Tests

- Test full flow: load project → run automation → params saved → reload panel → params pre-filled (scoped to project)
- Test deletion flow: save params + favourites → delete project → verify all data removed
- Test backward compatibility: project without `favourites` field falls back to legacy key
