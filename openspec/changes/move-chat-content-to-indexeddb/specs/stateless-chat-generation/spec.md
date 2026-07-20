## ADDED Requirements

### Requirement: Authenticated stateless generation
The system SHALL accept authenticated generation requests containing an ordered client-supplied conversation history and SHALL stream the selected provider's response without loading or saving chat content in backend storage.

#### Scenario: Generate from local history
- **WHEN** an authenticated client submits a valid conversation ID, model, and ordered message history
- **THEN** the backend forwards the validated roles and content to the selected provider and streams response deltas

#### Scenario: Complete generation
- **WHEN** the provider completes a non-empty response
- **THEN** the backend emits a completion event and the browser persists the accumulated assistant response in IndexedDB

#### Scenario: Reject an unauthenticated request
- **WHEN** a request without a valid application session invokes generation
- **THEN** the backend rejects it without contacting the provider

### Requirement: No server-side conversation persistence
The system SHALL keep no chat titles, user messages, assistant messages, or conversation histories in SQLite or another backend persistence mechanism.

#### Scenario: Process a successful conversation
- **WHEN** a generation request completes successfully
- **THEN** backend persistent storage contains no request history or generated response content

#### Scenario: Deploy over the existing schema
- **WHEN** database migrations run against an installation containing server-side chats and messages
- **THEN** the chat and message tables and their existing contents are removed without migration

#### Scenario: Handle diagnostic logging
- **WHEN** generation succeeds or fails
- **THEN** backend logs do not include the submitted history or generated response content

### Requirement: Bounded generation payloads
The system SHALL validate message roles, individual message lengths, message count, aggregate content size, conversation ID, and provider model before forwarding a request.

#### Scenario: Submit valid bounded history
- **WHEN** all request fields satisfy configured generation limits
- **THEN** the backend accepts the request for provider generation

#### Scenario: Submit excessive or malformed history
- **WHEN** any field or aggregate history exceeds a limit or has an invalid shape
- **THEN** the backend returns a client error without contacting the provider

### Requirement: Local failure consistency
The system SHALL preserve a locally submitted user message while avoiding persistence of incomplete assistant output.

#### Scenario: Provider request fails
- **WHEN** the provider cannot start a completion
- **THEN** the browser retains the submitted user message in IndexedDB and shows a recoverable error without an assistant message

#### Scenario: Provider stream is interrupted
- **WHEN** a response stream ends before a valid completion
- **THEN** the browser does not persist the partial assistant response and shows a recoverable interruption state

### Requirement: Per-user conversation concurrency
The system SHALL prevent overlapping active generations for the same authenticated user and client conversation ID without persisting the concurrency key.

#### Scenario: Submit overlapping generation
- **WHEN** a second generation starts for a user and conversation while the first remains active
- **THEN** the backend rejects the second request with a conflict response

#### Scenario: Finish generation
- **WHEN** generation completes, fails, or is cancelled
- **THEN** the backend releases the in-memory concurrency key
