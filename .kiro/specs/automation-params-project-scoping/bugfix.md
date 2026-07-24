# Bugfix Requirements Document

## Introduction

Automation parameter values persisted in `chrome.storage.local` are stored under separate global keys (`automation_params_{automationName}`) rather than being embedded in the project object. This causes collisions when two different projects have automations with the same name — they share each other's saved parameter values unintentionally.

Similarly, favourite automations are stored under a separate key (`automation_favourites_{hostname}`). When a project is deleted via `deleteProject`, only the project record itself is removed while these external keys are orphaned in storage.

The fix consolidates both automation params and favourites inside the project object itself (stored under the hostname key), so that deleting a project automatically removes all associated data and no extra storage keys are needed.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN two projects (different hostnames) each have an automation with the same name and a user saves param values for that automation in project A THEN the system stores those values under the global key `automation_params_{automationName}`, causing project B to load project A's param values for its same-named automation

1.2 WHEN `panel.js` calls `saveParamValues` after a successful automation run THEN the system saves params under a separate storage key outside the project object, proliferating keys in storage

1.3 WHEN `panel.js` calls `loadParamValues` to pre-fill the param form or for quick-run THEN the system loads params using a non-scoped key, potentially returning another project's values

1.4 WHEN a project is deleted via `deleteProject` THEN the system removes only the project record but leaves `automation_favourites_{hostname}` and all `automation_params_*` keys associated with that project orphaned in storage

1.5 WHEN `saveFavourites` is called THEN the system stores favourites under a separate key (`automation_favourites_{hostname}`) instead of inside the project object, adding to storage key proliferation

### Expected Behavior (Correct)

2.1 WHEN a user saves param values for an automation THEN the system SHALL store those values inside the project object under a `savedParams` map (keyed by automation name) so that each project's param values are isolated and co-located with the project

2.2 WHEN `panel.js` calls `saveParamValues` after a successful automation run THEN the system SHALL read the project, update `project.savedParams[automationName]`, and save the project back — no separate storage key

2.3 WHEN `panel.js` calls `loadParamValues` to pre-fill the param form or for quick-run THEN the system SHALL read from `project.savedParams[automationName]`, returning only values saved for that specific project

2.4 WHEN a project is deleted via `deleteProject` THEN the system SHALL automatically remove all associated data (params and favourites) because they live inside the project object — no extra cleanup needed. The system SHALL also remove the legacy `automation_favourites_{hostname}` key if present

2.5 WHEN `saveFavourites` is called THEN the system SHALL store favourites inside the project object under a `favourites` field so they are co-located and deleted together with the project

2.6 WHEN `loadFavourites` is called THEN the system SHALL read from `project.favourites`, falling back to the legacy `automation_favourites_{hostname}` key for backward compatibility during migration

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a single project saves and loads automation param values THEN the system SHALL CONTINUE TO persist and retrieve those values correctly across panel reloads

3.2 WHEN a project is deleted THEN the system SHALL CONTINUE TO remove the project record itself from storage

3.3 WHEN a non-buggy storage operation occurs (e.g., `saveProject`, `addSpec`, `deleteSpec`, `renameProject`, `getTestPlanConfig`, `saveTestPlanConfig`) THEN the system SHALL CONTINUE TO function identically without any behavioural change

3.4 WHEN the panel calls `loadParamValues` or `loadFavourites` for a project that has no saved data THEN the system SHALL CONTINUE TO return null (params) or empty object (favourites) without errors
