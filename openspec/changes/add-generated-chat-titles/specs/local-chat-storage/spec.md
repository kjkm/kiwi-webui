## MODIFIED Requirements

### Requirement: Local chat lifecycle
The system SHALL perform chat listing, selection, rename, conditional automatic rename, and deletion against IndexedDB while preserving the existing interface behavior.

#### Scenario: List chats
- **WHEN** local storage hydration completes
- **THEN** the sidebar lists the authenticated user's chats by most recent activity

#### Scenario: Rename a chat
- **WHEN** a user provides a valid replacement title
- **THEN** the system updates that local chat without calling a backend chat CRUD endpoint

#### Scenario: Apply a generated title
- **WHEN** a valid generated title returns for a chat whose title still equals the expected automatic title
- **THEN** the system atomically updates that user-owned local chat and refreshes the local chat list

#### Scenario: Preserve a manual rename
- **WHEN** a generated title returns after the chat's title has changed from the expected automatic title
- **THEN** the system leaves the current title unchanged

#### Scenario: Apply a stale generated title
- **WHEN** a generated title returns after the local chat was deleted or for a chat outside the authenticated user's partition
- **THEN** the system performs no title write

#### Scenario: Delete a chat
- **WHEN** a user confirms deletion
- **THEN** the system atomically removes the local chat and all of its messages
