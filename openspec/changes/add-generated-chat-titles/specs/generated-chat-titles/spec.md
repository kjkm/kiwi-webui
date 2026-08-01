## ADDED Requirements

### Requirement: Provider-generated first-message titles
The system SHALL request one concise plain-text title from the selected provider model using the first user message after the first assistant response for a normal chat completes successfully.

#### Scenario: Complete the first response
- **WHEN** the first assistant response in a normal chat completes and is persisted
- **THEN** the system requests a title based on the first user message without delaying the completed response or keeping the composer busy

#### Scenario: Continue an existing chat
- **WHEN** a later assistant response completes in a chat that already contains an assistant message
- **THEN** the system does not request another automatic title

#### Scenario: Fail the first response
- **WHEN** the first assistant response fails or is interrupted
- **THEN** the system does not request a title and retains the existing chat title

#### Scenario: Resolve the title model
- **WHEN** the system requests an automatic title
- **THEN** it validates and uses the model selected for that conversation through the existing provider model allowlist

#### Scenario: Stream the title completion
- **WHEN** the system contacts the provider for an automatic title
- **THEN** it uses the provider's required SSE completion contract without a generation-token cap and bounds the title content accumulated by Kiwi

### Requirement: Bounded and safe title output
The system SHALL treat provider-generated title output as untrusted plain text, normalize it, and accept only a non-empty title within the existing title-length limit.

#### Scenario: Return a valid generated title
- **WHEN** the provider returns a title with surrounding whitespace, line breaks, repeated spacing, or one pair of common surrounding quotation marks
- **THEN** the system removes that presentation noise and returns the normalized plain-text title

#### Scenario: Return invalid title output
- **WHEN** the provider returns empty, excessive, malformed, or otherwise invalid title output
- **THEN** the title request fails without applying the output to local storage

#### Scenario: Attempt title markup
- **WHEN** generated title text contains markup-like characters
- **THEN** the system stores and displays the title as plain text without interpreting Markdown or HTML

### Requirement: Non-fatal background naming
The system SHALL keep title generation independent from primary message delivery and SHALL fail open without exposing title-task failures as chat-generation failures.

#### Scenario: Title provider is unavailable
- **WHEN** title generation fails after a completed normal response
- **THEN** the assistant response remains completed and the chat retains `New chat`

#### Scenario: Title storage update fails
- **WHEN** a valid generated title cannot be applied to local storage
- **THEN** the completed conversation remains usable and title failure does not replace the chat's message status

#### Scenario: Navigate during title generation
- **WHEN** the user navigates to another chat while a title request remains in flight
- **THEN** a valid result may update the original local chat by ID without changing the active conversation

### Requirement: Saved temporary-chat titles
The system SHALL request a generated title for a temporary conversation only after the user explicitly saves it and SHALL retain its deterministic first-message title as the fallback.

#### Scenario: Use an unsaved temporary conversation
- **WHEN** a temporary conversation receives a completed assistant response but has not been saved
- **THEN** the system does not request or persist an automatic title

#### Scenario: Save a temporary conversation
- **WHEN** the user saves a temporary conversation containing a first user message
- **THEN** the system immediately stores it with the deterministic first-message title and requests a provider-generated title in the background

#### Scenario: Temporary-chat title generation fails
- **WHEN** title generation for a saved temporary conversation fails
- **THEN** the saved chat retains its deterministic first-message title and complete local transcript
