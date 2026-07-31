## ADDED Requirements

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

## MODIFIED Requirements

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
