## MODIFIED Requirements

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
