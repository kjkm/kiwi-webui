# minimal-chat-ui Specification

## Purpose
TBD - created by archiving change build-minimal-oidc-chat. Update Purpose after archive.
## Requirements
### Requirement: Responsive authenticated shell
The system SHALL provide a responsive interface containing chat navigation, the active conversation, a message composer, and account controls.

#### Scenario: Use a wide viewport
- **WHEN** an authenticated user opens the application on a wide viewport
- **THEN** chat navigation and the active conversation are usable together

#### Scenario: Use a narrow viewport
- **WHEN** an authenticated user opens the application on a narrow viewport
- **THEN** the conversation remains primary and chat navigation is available through a compact control

### Requirement: Open WebUI sidebar fidelity
The system SHALL match Open WebUI's iconography and sidebar styling for the preserved logo, new-chat, expand/collapse, chat-list, chat-action, and account controls, including compact account access in the collapsed desktop rail.

#### Scenario: Collapse and expand the sidebar
- **WHEN** a desktop user collapses or expands chat navigation
- **THEN** the interface uses Open WebUI's sidebar icon and switches between its 260px panel treatment and compact navigation rail

#### Scenario: Use preserved sidebar controls
- **WHEN** a user views or operates new chat, chat actions, or account controls
- **THEN** those controls use the corresponding Open WebUI icon paths, sizing, spacing, radii, and hover treatments

#### Scenario: Access the account menu from the collapsed rail
- **WHEN** an authenticated desktop user collapses chat navigation
- **THEN** a keyboard-operable profile avatar remains pinned to the bottom of the compact rail and opens the same identity, welcome-message, and sign-out actions available in the expanded sidebar

#### Scenario: Display the compact account popover
- **WHEN** the user opens the account menu from the collapsed rail
- **THEN** the popover opens beside the rail without being clipped or causing page-level overflow

#### Scenario: Switch sidebar presentation with an account menu open
- **WHEN** the user expands or collapses the desktop sidebar while an account menu is open
- **THEN** the account menu closes and does not reappear unexpectedly in the other presentation

#### Scenario: Use account controls on a narrow viewport
- **WHEN** an authenticated user opens navigation on a narrow viewport
- **THEN** account controls remain in the full mobile sidebar without an additional compact profile control

### Requirement: Model selection
The system SHALL show an Open WebUI-style searchable model selector in the conversation header instead of the chat title and SHALL use the selected provider model for subsequent completions.

#### Scenario: Select an available model
- **WHEN** an authenticated user chooses a model from the header selector
- **THEN** the interface displays that model as selected and uses it for the next completion

#### Scenario: Restore model preference
- **WHEN** a user returns with a previously selected model that remains available
- **THEN** the interface restores that model selection

### Requirement: Clear chat interaction states
The system SHALL visibly distinguish empty, temporary, loading, streaming, completed, and failed conversation states.

#### Scenario: Start a new chat
- **WHEN** a user opens the normal new-chat route or a normal chat with no messages
- **THEN** the interface groups the greeting and composer near the vertical center in the Open WebUI placeholder layout without suggestion cards

#### Scenario: Start a temporary chat
- **WHEN** a user enables temporary mode on the empty new-chat route
- **THEN** the centered placeholder shows the wireframe Kiwi mark and `Incognito` heading without adding an eye icon or temporary-chat label

#### Scenario: Send from the normal new-chat route
- **WHEN** a user submits the centered composer before a normal chat exists
- **THEN** the system creates the chat, updates its URL, and transitions to the normal conversation layout

#### Scenario: Send from the temporary new-chat route
- **WHEN** a user submits the centered composer in temporary mode
- **THEN** the system remains off a `/c/{id}` route and transitions to an in-memory conversation layout with a save action

#### Scenario: Receive streamed content
- **WHEN** an assistant response is streaming in either normal or temporary mode
- **THEN** the interface updates incrementally and offers a stop control

#### Scenario: Generation fails
- **WHEN** generation fails before completion in either normal or temporary mode
- **THEN** the interface preserves the user's message in the applicable persistence boundary and displays a recoverable error state

### Requirement: Safe message rendering
The system SHALL render basic Markdown and fenced code blocks while preventing model-produced markup from executing scripts or injecting unsafe HTML.

#### Scenario: Render Markdown response
- **WHEN** an assistant message contains supported Markdown or a fenced code block
- **THEN** the interface displays formatted, sanitized content

#### Scenario: Render unsafe markup
- **WHEN** a message contains raw HTML or executable markup
- **THEN** the interface renders it inert or removes it

### Requirement: Keyboard-accessible essentials
The system SHALL make sign-in, chat selection, composing, sending, stopping, chat actions, and account controls operable by keyboard with visible focus.

#### Scenario: Send using the keyboard
- **WHEN** the composer is focused and the user invokes the send shortcut with valid content
- **THEN** the message is submitted without requiring pointer input

### Requirement: Open WebUI temporary-chat fidelity
The system SHALL use Open WebUI's temporary-chat iconography and visual treatments for the mode toggle, active state, temporary composer, and save action, with an uncluttered Kiwi-specific temporary placeholder.

#### Scenario: View the normal new-chat header
- **WHEN** no saved chat is active and temporary mode is disabled
- **THEN** the header shows the Open WebUI dotted-chat temporary control with an accessible label

#### Scenario: Enable temporary mode
- **WHEN** the user activates the temporary-chat control
- **THEN** the control uses the corresponding checked icon, the empty state replaces the normal logo and greeting with a wireframe Kiwi mark and `Incognito` heading without an additional eye icon or temporary-chat label, and the composer uses a dashed border treatment

#### Scenario: Continue a temporary conversation
- **WHEN** temporary mode contains at least one message
- **THEN** the header presents Open WebUI's save-temporary-chat affordance instead of the empty-state toggle

