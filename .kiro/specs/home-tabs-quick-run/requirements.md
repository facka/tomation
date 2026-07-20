# Requirements Document

## Introduction

This feature restructures the Tomation extension's home view by splitting the single combined list into two distinct tabs: "Tests" and "Automations". Each tab provides a Quick Run button on every row to bypass the test plan view and start execution immediately with all steps checked and debug mode enabled. The Automations tab adds favouriting (to sort favourites to the top).

## Glossary

- **Side_Panel**: The browser extension side panel that displays the home view, test plan view, and run view.
- **Home_View**: The main view in the Side_Panel that lists available Tests and Automations for the current hostname.
- **Tests_Tab**: The tab within the Home_View that displays only Test entries.
- **Automations_Tab**: The tab within the Home_View that displays only Automation entries.
- **Quick_Run_Button**: A button displayed on the right side of each row in both tabs that immediately starts execution without navigating to the test plan view.
- **Favourite_Flag**: A per-Automation boolean stored in extension storage indicating whether the Automation is marked as a favourite.
- **Runtime**: The Tomation extension background script that executes tests and automations via message passing.
- **Spec**: The compiled `.tomation.json` output consumed by the extension, containing tests and automations arrays.

## Requirements

### Requirement 1: Tab-Based Home View Layout

**User Story:** As a user, I want the home view to be split into "Tests" and "Automations" tabs, so that I can quickly find and manage each type of runnable separately.

#### Acceptance Criteria

1. THE Side_Panel SHALL display two tabs labeled "Tests" and "Automations" at the top of the Home_View
2. WHEN the user clicks the "Tests" tab, THE Side_Panel SHALL display only Test entries from the loaded Spec
3. WHEN the user clicks the "Automations" tab, THE Side_Panel SHALL display only Automation entries from the loaded Spec
4. THE Side_Panel SHALL persist the last selected tab so that returning to the Home_View restores the previously active tab
5. WHEN a Spec contains no Automations, THE Automations_Tab SHALL display an empty state message indicating no automations are available
6. WHEN a Spec contains no Tests, THE Tests_Tab SHALL display an empty state message indicating no tests are available
7. THE existing search filter SHALL apply only to the items visible in the currently active tab

### Requirement 2: Quick Run Button for Tests

**User Story:** As a user, I want a run button on each test row, so that I can start a test immediately without navigating to the test plan view.

#### Acceptance Criteria

1. THE Tests_Tab SHALL display a Quick_Run_Button on the right side of each test row
2. WHEN the user clicks the Quick_Run_Button for a test, THE Side_Panel SHALL send a RUN_TEST message to the Runtime with all step indices checked
3. WHEN the user clicks the Quick_Run_Button for a test, THE Side_Panel SHALL include debug mode enabled in the run configuration (allowContinueOnFailure: true, allowRetryOnFailure: true)
4. WHEN the user clicks the Quick_Run_Button for a test, THE Side_Panel SHALL skip the test plan view and transition directly to the run view
5. WHEN the user clicks the Quick_Run_Button, THE Side_Panel SHALL use the default execution speed configured in the test plan settings

### Requirement 3: Quick Run Button for Automations

**User Story:** As a user, I want a run button on each automation row, so that I can start an automation immediately using the last saved parameters.

#### Acceptance Criteria

1. THE Automations_Tab SHALL display a Quick_Run_Button on the right side of each automation row
2. WHEN the user clicks the Quick_Run_Button for an automation, THE Side_Panel SHALL load the last saved parameter values from extension storage for that automation
3. WHEN the user clicks the Quick_Run_Button for an automation, THE Side_Panel SHALL send a RUN_AUTOMATION message to the Runtime with all step indices checked, the loaded parameters, and debug mode enabled
4. WHEN the user clicks the Quick_Run_Button for an automation, THE Side_Panel SHALL skip the test plan view and transition directly to the run view
5. IF no previously saved parameter values exist for the automation, THEN THE Side_Panel SHALL send empty strings for string params, zero for number params, and today's date for date params as default values
6. IF an automation has required params with no saved values, THEN THE Side_Panel SHALL navigate to the test plan view instead of quick running, so the user can fill in the required fields

### Requirement 4: Automation Favourites

**User Story:** As a user, I want to mark Automations as favourites, so that my most-used automations appear at the top of the list for faster access.

#### Acceptance Criteria

1. THE Automations_Tab SHALL display a favourite toggle (e.g., star icon) on each automation row
2. WHEN the user clicks the favourite toggle on an automation, THE Side_Panel SHALL persist the Favourite_Flag for that automation in extension storage scoped to the current project hostname
3. WHILE an automation has its Favourite_Flag set to true, THE Automations_Tab SHALL display that automation above non-favourite automations
4. THE Automations_Tab SHALL preserve the original relative order among favourite automations and among non-favourite automations
5. WHEN returning to the Home_View, THE Side_Panel SHALL load favourite flags from extension storage for the current project hostname and sort automations accordingly
6. WHEN a project is deleted, THE Side_Panel SHALL remove the associated favourite data from extension storage to keep storage clean

### Requirement 5: Row Item Interaction Preservation

**User Story:** As a user, I want to still be able to click a test or automation row to navigate to the test plan view, so that I can configure steps and params before running when needed.

#### Acceptance Criteria

1. WHEN the user clicks on the row body (not the Quick_Run_Button or favourite controls) of a test item, THE Side_Panel SHALL navigate to the Test_Plan_View for that test
2. WHEN the user clicks on the row body (not the Quick_Run_Button or favourite controls) of an automation item, THE Side_Panel SHALL navigate to the Test_Plan_View for that automation
3. THE Quick_Run_Button click SHALL NOT propagate to the row click handler
4. THE favourite toggle click SHALL NOT propagate to the row click handler
