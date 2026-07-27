## ADDED Requirements

### Requirement: Idempotent generation jobs
The system SHALL create an ephemeral generation job for each accepted client-generated generation ID and SHALL prevent retries from starting duplicate provider inference.

#### Scenario: Create a generation job
- **WHEN** an authenticated client submits a valid new generation ID, conversation ID, model, and bounded message history
- **THEN** the system creates one user-scoped job, reserves conversation concurrency, and starts provider orchestration once

#### Scenario: Retry creation with the same identity
- **WHEN** the same authenticated user resubmits an existing generation ID for the same conversation
- **THEN** the system attaches the client to the existing job without starting another provider request

#### Scenario: Reuse a generation ID with conflicting metadata
- **WHEN** a client submits an existing generation ID with a different owner or conversation ID
- **THEN** the system rejects the request without exposing the existing job or contacting the provider

#### Scenario: Start a different job for an active conversation
- **WHEN** a user submits a different generation ID while that user's conversation already has a running job
- **THEN** the system rejects the new job with a conflict response

### Requirement: Inference independent of subscribers
The system SHALL run accepted provider inference independently from individual browser stream connections until the job reaches a terminal state or receives an explicit cancellation.

#### Scenario: Browser stream disconnects during model loading
- **WHEN** the browser connection closes while Ollama residency checking or model preload is in progress
- **THEN** the job continues its bounded model-loading and inference lifecycle without treating the transport loss as Stop

#### Scenario: Browser stream disconnects during inference
- **WHEN** the browser connection closes after provider inference starts
- **THEN** the system detaches that subscriber while continuing to collect bounded response events for the job

#### Scenario: Provider connection fails
- **WHEN** the backend's connection to the configured provider fails or ends invalidly
- **THEN** the job records a safe terminal error and does not claim that reconnecting can continue inference

### Requirement: Ordered event replay
The system SHALL assign monotonically increasing sequence identifiers to replayable generation events and SHALL allow the owning authenticated user to subscribe after a processed-event cursor.

#### Scenario: Reconnect after missing events
- **WHEN** the job owner reconnects with a valid cursor while the job is running
- **THEN** the system replays every retained event after that cursor in original order and then streams new events

#### Scenario: Reconnect after completion
- **WHEN** the job owner reconnects before expiry after the job completed while disconnected
- **THEN** the system replays the remaining deltas and terminal completion event and closes the subscription

#### Scenario: Reconnect to a failed job
- **WHEN** the job owner reconnects before expiry after the job failed
- **THEN** the system replays its safe terminal error and closes the subscription

#### Scenario: Reconnect with the latest cursor
- **WHEN** a subscription starts with a cursor equal to the latest retained event
- **THEN** the system sends only future events or closes after confirming an already-terminal job

#### Scenario: Request an unknown, expired, or foreign job
- **WHEN** a user requests replay for a job that is absent, expired, or owned by another user
- **THEN** the system returns the same not-found response without revealing job ownership or content

### Requirement: Automatic client reconnection
The browser SHALL treat a non-terminal generation transport interruption as recoverable and SHALL attempt to resume the same job without duplicating processed output.

#### Scenario: Return to Kiwi after switching applications
- **WHEN** mobile backgrounding interrupts a generation stream and the intact page later resumes execution
- **THEN** the browser displays a reconnecting state, reconnects with its generation ID and last processed cursor, and continues the response

#### Scenario: Connectivity returns
- **WHEN** the browser is waiting to reconnect and receives an online or foreground visibility signal
- **THEN** it attempts an immediate authenticated subscription instead of waiting for the next backoff interval

#### Scenario: Replay response deltas
- **WHEN** a resumed subscription contains previously unseen delta events
- **THEN** the browser appends each delta exactly once in sequence and clears the reconnecting state

#### Scenario: Recovery is no longer available
- **WHEN** the generation job expires or cannot be found during reconnection
- **THEN** the browser stops retrying, retains the normal locally submitted user message, and shows a recoverable completion failure

### Requirement: Explicit generation cancellation
The system SHALL distinguish accidental transport loss from intentional user actions and SHALL abort provider work only for explicit cancellation, terminal failure, timeout, or enforced resource limits.

#### Scenario: User presses Stop
- **WHEN** the user activates Stop for a running generation job
- **THEN** the browser requests job cancellation, clears transient generation UI, and the backend aborts provider work and releases conversation concurrency

#### Scenario: User intentionally leaves the generating conversation
- **WHEN** the user starts another chat, navigates to another conversation, deletes or discards the active conversation, or signs out
- **THEN** the client best-effort cancels the known active job rather than leaving it running solely for replay

#### Scenario: Cancellation races with completion
- **WHEN** cancellation arrives after the job has already completed
- **THEN** the system removes retained replay data without changing the completed response already delivered to the browser

#### Scenario: Cancellation request is lost
- **WHEN** an intentional client cancellation cannot reach the backend
- **THEN** bounded runtime and expiration cleanup eventually abort and remove the orphaned job

### Requirement: Local completion consistency
The system SHALL retain browser-local chat ownership and SHALL persist a replayed assistant response no more than once after complete successful delivery.

#### Scenario: Complete a resumed normal chat
- **WHEN** replay reaches a valid completion with non-empty assistant output
- **THEN** the browser appends one assistant message to that user's conversation in IndexedDB and acknowledges the terminal job

#### Scenario: Complete a resumed temporary chat
- **WHEN** an intact temporary-chat page reconnects and receives a valid completion
- **THEN** it appends the assistant response only to page memory and acknowledges the terminal job

#### Scenario: Reload during a normal-chat job
- **WHEN** the page reloads before a pending normal-chat generation is completed
- **THEN** the submitted user message remains in IndexedDB but automatic job recovery is not guaranteed by this capability

#### Scenario: Reload during a temporary-chat job
- **WHEN** the page reloads or closes before a temporary-chat generation completes
- **THEN** the temporary transcript is discarded and the server job expires without creating local or backend chat persistence

#### Scenario: Local completion persistence fails
- **WHEN** the browser cannot append a completed assistant response locally
- **THEN** it shows a local-storage error and does not falsely record the response as persisted

### Requirement: Bounded ephemeral job retention
The system SHALL enforce per-user and process-wide job-count limits, generation runtime limits, replay-size limits, and terminal retention expiration without durable backend storage.

#### Scenario: User exceeds the active-job limit
- **WHEN** accepting a new job would exceed the authenticated user's active generation limit
- **THEN** the system rejects it before contacting Ollama or the completion provider

#### Scenario: Job exceeds runtime
- **WHEN** model loading and inference exceed the maximum job runtime
- **THEN** the system aborts provider work, records a safe terminal timeout error, and releases conversation concurrency

#### Scenario: Job exceeds replay or output bounds
- **WHEN** retaining another provider event would exceed the configured response bounds
- **THEN** the system aborts provider work and records one safe terminal size-limit error without persisting partial output

#### Scenario: Completed job is acknowledged
- **WHEN** the browser confirms successful local handling of a terminal job
- **THEN** the system promptly removes its retained events and content

#### Scenario: Terminal job expires
- **WHEN** a completed, failed, or cancelled job reaches its replay retention deadline without acknowledgement
- **THEN** the system removes all retained job content and metadata

#### Scenario: Kiwi restarts
- **WHEN** the application process restarts while jobs are active or retained
- **THEN** those jobs and replay events are lost without affecting SQLite or browser-local chat records

### Requirement: Job isolation and diagnostic privacy
The system SHALL authorize every job operation against the authenticated owner and SHALL keep job prompts, responses, credentials, and identifiers out of persistent storage and operational logs.

#### Scenario: Another user guesses a generation ID
- **WHEN** an authenticated user requests, retries, or cancels another user's generation ID
- **THEN** the system neither exposes nor mutates the job and reveals no event content or ownership details

#### Scenario: Process a successful resumable generation
- **WHEN** a generation job streams, disconnects, reconnects, and completes
- **THEN** SQLite contains no job metadata, submitted history, replay event, or generated response content

#### Scenario: Diagnose job lifecycle
- **WHEN** a job is created, disconnected, retried, cancelled, expires, or fails
- **THEN** logs contain only content-free categories and aggregate operational data, excluding user IDs, conversation IDs, prompts, responses, event payloads, and credentials
