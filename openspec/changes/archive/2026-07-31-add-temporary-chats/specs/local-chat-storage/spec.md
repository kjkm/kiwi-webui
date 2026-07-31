## MODIFIED Requirements

### Requirement: Browser-local conversation persistence
The system SHALL persist normal chat titles, timestamps, user messages, and assistant messages in IndexedDB and SHALL NOT send that content to backend storage APIs. The system SHALL keep temporary conversation content in memory and SHALL write it to IndexedDB only when the user explicitly saves that conversation.

#### Scenario: Create a local chat
- **WHEN** an authenticated user starts a normal chat or submits the normal new-chat composer
- **THEN** the system creates the chat in IndexedDB under that user's ID

#### Scenario: Persist completed messages
- **WHEN** a user message is submitted and an assistant response completes in a normal chat
- **THEN** the system stores both ordered messages and updates the chat activity timestamp in IndexedDB

#### Scenario: Use a temporary chat
- **WHEN** an authenticated user submits messages or receives completed responses in temporary mode
- **THEN** the system performs no IndexedDB chat or message writes

#### Scenario: Save a temporary chat
- **WHEN** an authenticated user explicitly saves a temporary conversation
- **THEN** the system atomically stores the chat and its complete ordered transcript in IndexedDB under that user's ID

#### Scenario: Reload the application
- **WHEN** the same authenticated user reloads the application in the same browser profile
- **THEN** the system restores that user's normal and explicitly saved chat history from IndexedDB but does not restore unsaved temporary content
