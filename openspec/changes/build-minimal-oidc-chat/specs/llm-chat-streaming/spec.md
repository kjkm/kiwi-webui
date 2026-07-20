## ADDED Requirements

### Requirement: Server-configured completion provider
The system SHALL send chat completions only to the server-configured OpenAI-compatible base URL and a model exposed by that provider, with provider credentials retained on the server.

#### Scenario: Submit a conversation
- **WHEN** an authenticated chat owner submits a valid user message with an available model
- **THEN** the system sends the ordered conversation to the selected model without exposing the provider credential to the browser

#### Scenario: Reject an unavailable model
- **WHEN** a client requests a model that is not the configured default or in the provider's discovered model list
- **THEN** the system rejects the request without persisting the user message or starting a completion

#### Scenario: Missing provider configuration
- **WHEN** required provider configuration is unavailable
- **THEN** the system fails readiness or returns a clear unavailable response without accepting generation work

### Requirement: Stream assistant responses
The system SHALL relay standard OpenAI-compatible streaming response text to the initiating authenticated client as it arrives.

#### Scenario: Successful stream
- **WHEN** the upstream provider emits valid response chunks and completes
- **THEN** the user sees incremental assistant text and the completed response is persisted

#### Scenario: Upstream failure
- **WHEN** the provider rejects the request, times out, or emits an invalid stream
- **THEN** the system ends the stream with a safe error and does not persist a completed assistant response

#### Scenario: Cancel generation
- **WHEN** the user cancels an active generation or disconnects
- **THEN** the system aborts the upstream request and does not persist a completed assistant response

### Requirement: Generation ownership and serialization
The system SHALL permit generation only for the chat owner and SHALL allow at most one active generation per chat.

#### Scenario: Concurrent generation attempt
- **WHEN** a second generation is requested while the same chat already has an active generation
- **THEN** the system rejects the second request without duplicating messages

#### Scenario: Generation for another user's chat
- **WHEN** a user requests generation against a chat they do not own
- **THEN** the system rejects the request without contacting the provider
