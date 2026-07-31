## ADDED Requirements

### Requirement: User-owned chats
The system SHALL allow authenticated users to create, list, open, rename, and delete only their own chats.

#### Scenario: Create a chat
- **WHEN** an authenticated user starts a new conversation
- **THEN** the system creates a chat owned by that user

#### Scenario: List chats
- **WHEN** an authenticated user views the application
- **THEN** the system lists that user's chats in descending recent-activity order

#### Scenario: Rename a chat
- **WHEN** an authenticated owner supplies a valid title for a chat
- **THEN** the system updates that chat's title

#### Scenario: Delete a chat
- **WHEN** an authenticated owner confirms deletion
- **THEN** the system deletes the chat and all of its messages

#### Scenario: Deny cross-user access
- **WHEN** a user requests another user's chat or mutation
- **THEN** the system reveals no chat data and performs no mutation

### Requirement: Linear message history
The system SHALL persist each chat as a single ordered sequence of user and assistant messages.

#### Scenario: Reopen a conversation
- **WHEN** a user opens one of their existing chats
- **THEN** the system displays its persisted messages in chronological order

#### Scenario: Append messages
- **WHEN** a chat turn completes successfully
- **THEN** the user message and completed assistant response remain in their original order after reload

### Requirement: Valid conversation mutations
The system SHALL validate chat titles and message content using documented non-empty length limits.

#### Scenario: Reject invalid input
- **WHEN** a title or user message is empty or exceeds its allowed length
- **THEN** the system rejects the mutation without changing persisted conversation data
