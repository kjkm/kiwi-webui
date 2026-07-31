# local-chat-storage Specification

## Purpose
TBD - created by archiving change move-chat-content-to-indexeddb. Update Purpose after archive.
## Requirements
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

### Requirement: User-partitioned local history
The system SHALL scope every local chat operation to the authenticated backend user ID.

#### Scenario: Change authenticated user
- **WHEN** a different OIDC user signs in using the same browser profile
- **THEN** the interface shows only chats associated with the newly authenticated user ID

#### Scenario: Return after logout
- **WHEN** a user logs out and later signs in with the same OIDC identity in the same browser profile
- **THEN** that user's locally retained chats are available again

### Requirement: Local chat lifecycle
The system SHALL perform chat listing, selection, rename, and deletion against IndexedDB while preserving the existing interface behavior.

#### Scenario: List chats
- **WHEN** local storage hydration completes
- **THEN** the sidebar lists the authenticated user's chats by most recent activity

#### Scenario: Rename a chat
- **WHEN** a user provides a valid replacement title
- **THEN** the system updates that local chat without calling a backend chat CRUD endpoint

#### Scenario: Delete a chat
- **WHEN** a user confirms deletion
- **THEN** the system atomically removes the local chat and all of its messages

### Requirement: Client-resolved conversation routes
The system SHALL resolve conversation route IDs from the authenticated user's IndexedDB records after browser hydration.

#### Scenario: Open an existing local deep link
- **WHEN** a user opens `/c/{id}` and that ID exists in their local records
- **THEN** the interface loads that conversation from IndexedDB

#### Scenario: Open a missing local deep link
- **WHEN** a user opens `/c/{id}` and that ID is absent from their local records
- **THEN** the interface presents a recoverable local not-found state instead of a server database 404

### Requirement: Explicit local storage states
The system SHALL distinguish IndexedDB initialization from an empty chat history and SHALL surface failures without falling back to server content persistence.

#### Scenario: Initialize local storage
- **WHEN** the authenticated application starts before IndexedDB hydration completes
- **THEN** the interface shows a loading state rather than an empty-history state

#### Scenario: IndexedDB is unavailable
- **WHEN** IndexedDB cannot be opened or a required transaction fails
- **THEN** the interface displays a recoverable storage error and does not persist chat content on the backend

#### Scenario: Browser data is cleared
- **WHEN** browser site data containing IndexedDB is removed
- **THEN** previously local chats are no longer available and the server does not restore them

