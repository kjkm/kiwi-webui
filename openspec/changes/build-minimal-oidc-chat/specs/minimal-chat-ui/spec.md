## ADDED Requirements

### Requirement: Responsive authenticated shell
The system SHALL provide a responsive interface containing chat navigation, the active conversation, a message composer, and account controls.

#### Scenario: Use a wide viewport
- **WHEN** an authenticated user opens the application on a wide viewport
- **THEN** chat navigation and the active conversation are usable together

#### Scenario: Use a narrow viewport
- **WHEN** an authenticated user opens the application on a narrow viewport
- **THEN** the conversation remains primary and chat navigation is available through a compact control

### Requirement: Clear chat interaction states
The system SHALL visibly distinguish empty, loading, streaming, completed, and failed conversation states.

#### Scenario: Start a new chat
- **WHEN** a user opens a chat with no messages
- **THEN** the interface presents a focused composer and a clear empty state

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
