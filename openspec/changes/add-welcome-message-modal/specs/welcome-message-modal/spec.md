## ADDED Requirements

### Requirement: Operator-authored Markdown content
The system SHALL source the authenticated welcome message from a repository-managed Markdown file and SHALL render it through the application's sanitized Markdown rendering path.

#### Scenario: Valid welcome content loads
- **WHEN** an eligible authenticated user visits Kiwi and the Markdown file contains non-empty content
- **THEN** the system displays the rendered and sanitized Markdown in the welcome modal

#### Scenario: Markdown contains raw or unsafe HTML
- **WHEN** the welcome Markdown contains raw HTML or unsafe generated markup
- **THEN** the system escapes or sanitizes that markup according to the existing Markdown security policy

#### Scenario: Operator edits content
- **WHEN** the operator changes the Markdown file and deploys a rebuilt application image
- **THEN** eligible users receive the updated content without requiring application code changes

### Requirement: User-partitioned first-visit presentation
The system SHALL show the welcome modal once per authenticated OIDC user and browser profile and SHALL partition acknowledgement by the authenticated user's stable ID.

#### Scenario: User has no acknowledgement
- **WHEN** an authenticated user visits the application without a stored acknowledgement for their user ID
- **THEN** the system loads and presents the welcome message

#### Scenario: User previously acknowledged the message
- **WHEN** an authenticated user visits with a stored acknowledgement for their user ID
- **THEN** the system does not load or display the welcome modal

#### Scenario: Different user shares the browser profile
- **WHEN** a second authenticated user visits in a browser where another user acknowledged the message
- **THEN** the system independently presents the message unless the second user's own acknowledgement exists

#### Scenario: Welcome content changes after acknowledgement
- **WHEN** an acknowledged user visits after the operator edits the welcome Markdown
- **THEN** the system does not display the message again

### Requirement: Explicit acknowledgement
The system SHALL provide a single acknowledgement button labeled exactly “Cool, thanks.” and SHALL record acknowledgement only when that action is activated.

#### Scenario: User acknowledges the message
- **WHEN** the user activates “Cool, thanks.”
- **THEN** the system stores acknowledgement for that authenticated user and closes the modal

#### Scenario: User attempts incidental dismissal
- **WHEN** the user presses Escape or interacts with the backdrop
- **THEN** the modal remains open and no acknowledgement is recorded

#### Scenario: Browser storage rejects acknowledgement
- **WHEN** the user activates “Cool, thanks.” but browser-local storage is unavailable
- **THEN** the system closes the modal for the current page session without blocking application use

### Requirement: Accessible responsive modal
The system SHALL present the message as an accessible modal dialog that prevents interaction with background content while open and remains usable across supported desktop and mobile viewports.

#### Scenario: Modal opens
- **WHEN** valid welcome content is ready for an eligible user
- **THEN** focus moves into the modal and assistive technology identifies it as the active welcome dialog

#### Scenario: Keyboard navigation
- **WHEN** a keyboard user navigates while the modal is open
- **THEN** focus remains within the modal and the acknowledgement action is reachable and operable

#### Scenario: Long content on a small viewport
- **WHEN** the welcome Markdown exceeds the available mobile viewport height
- **THEN** the content is scrollable and the acknowledgement button remains reachable without interacting with the page behind it

### Requirement: Non-blocking failure behavior
The welcome-message capability SHALL fail open and SHALL NOT prevent access to chat when usable content cannot be loaded.

#### Scenario: Markdown asset is missing or unavailable
- **WHEN** the welcome Markdown request fails
- **THEN** the system does not open the modal and the authenticated application remains usable

#### Scenario: Markdown asset is empty
- **WHEN** the loaded Markdown is empty or whitespace-only
- **THEN** the system does not open the modal and the authenticated application remains usable

#### Scenario: Transient content failure recovers later
- **WHEN** content loading failed without displaying the message and the user visits again after content becomes available
- **THEN** the system retries because no acknowledgement was recorded for the failed presentation
