## ADDED Requirements

### Requirement: Disposable temporary conversation lifecycle
The system SHALL provide a temporary chat mode whose title and messages exist only in the current in-memory application session unless the user explicitly saves the conversation.

#### Scenario: Enable temporary mode
- **WHEN** an authenticated user enables temporary chat from an empty new-chat view
- **THEN** the interface enters temporary mode without creating an IndexedDB chat record or changing to a `/c/{id}` route

#### Scenario: Leave a temporary conversation
- **WHEN** the user starts a normal new chat, opens a saved chat, navigates away, reloads, or logs out
- **THEN** the temporary transcript is discarded and is not available in sidebar history

#### Scenario: Disable empty temporary mode
- **WHEN** the user disables temporary mode before submitting a message
- **THEN** the interface returns to the normal empty new-chat state without any persistence operation

### Requirement: In-memory temporary generation
The system SHALL send bounded temporary conversation history to the existing stateless generation endpoint while avoiding all chat and message writes to IndexedDB and backend storage.

#### Scenario: Submit a temporary message
- **WHEN** a user submits a valid prompt in temporary mode
- **THEN** the user message is added to in-memory history and the provider receives the ordered temporary history without a local persistence call

#### Scenario: Complete a temporary response
- **WHEN** a temporary generation stream completes successfully
- **THEN** the assistant response is added to in-memory history and remains absent from IndexedDB

#### Scenario: Temporary generation fails
- **WHEN** temporary generation fails or is stopped
- **THEN** no partial assistant response is persisted and the temporary user message remains available only in memory for retry or review

### Requirement: Explicit temporary-chat conversion
The system SHALL allow a completed temporary conversation to be saved as a normal browser-local chat through an explicit user action.

#### Scenario: Save a temporary conversation
- **WHEN** the user invokes the save action for a non-empty temporary conversation while generation is idle
- **THEN** the system atomically creates one IndexedDB chat with the complete ordered transcript, exits temporary mode, refreshes sidebar history, and changes to its `/c/{id}` route

#### Scenario: Saving fails
- **WHEN** the atomic IndexedDB conversion cannot complete
- **THEN** the system leaves the temporary transcript in memory, remains in temporary mode, and displays a recoverable error without a partial saved chat

#### Scenario: Save while generating
- **WHEN** a temporary response is still generating
- **THEN** the save action is unavailable until generation finishes or is stopped
