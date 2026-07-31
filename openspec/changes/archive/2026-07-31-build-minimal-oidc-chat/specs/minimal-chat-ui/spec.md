## ADDED Requirements

### Requirement: Responsive authenticated shell
The system SHALL provide a responsive interface containing chat navigation, the active conversation, a message composer, and account controls.

#### Scenario: Use a wide viewport
- **WHEN** an authenticated user opens the application on a wide viewport
- **THEN** chat navigation and the active conversation are usable together

#### Scenario: Use a narrow viewport
- **WHEN** an authenticated user opens the application on a narrow viewport
- **THEN** the conversation remains primary and chat navigation is available through a compact control

### Requirement: Open WebUI sidebar fidelity
The system SHALL match Open WebUI's iconography and sidebar styling for the preserved logo, new-chat, expand/collapse, chat-list, chat-action, and account controls.

#### Scenario: Collapse and expand the sidebar
- **WHEN** a desktop user collapses or expands chat navigation
- **THEN** the interface uses Open WebUI's sidebar icon and switches between its 260px panel treatment and compact navigation rail

#### Scenario: Use preserved sidebar controls
- **WHEN** a user views or operates new chat, chat actions, or account controls
- **THEN** those controls use the corresponding Open WebUI icon paths, sizing, spacing, radii, and hover treatments

### Requirement: Model selection
The system SHALL show an Open WebUI-style searchable model selector in the conversation header instead of the chat title and SHALL use the selected provider model for subsequent completions.

#### Scenario: Select an available model
- **WHEN** an authenticated user chooses a model from the header selector
- **THEN** the interface displays that model as selected and uses it for the next completion

#### Scenario: Restore model preference
- **WHEN** a user returns with a previously selected model that remains available
- **THEN** the interface restores that model selection

### Requirement: Clear chat interaction states
The system SHALL visibly distinguish empty, loading, streaming, completed, and failed conversation states.

#### Scenario: Start a new chat
- **WHEN** a user opens the new-chat route or a chat with no messages
- **THEN** the interface groups the greeting and composer near the vertical center in the Open WebUI placeholder layout without suggestion cards

#### Scenario: Send from the new-chat route
- **WHEN** a user submits the centered composer before a chat exists
- **THEN** the system creates the chat, updates its URL, and transitions to the normal conversation layout

#### Scenario: Receive streamed content
- **WHEN** an assistant response is streaming
- **THEN** the interface updates incrementally and offers a stop control

#### Scenario: Generation fails
- **WHEN** generation fails before completion
- **THEN** the interface preserves the user's message and displays a recoverable error state

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
