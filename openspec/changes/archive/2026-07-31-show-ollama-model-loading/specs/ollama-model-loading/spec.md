## ADDED Requirements

### Requirement: Optional Ollama residency detection
The system SHALL check the selected model against Ollama's currently loaded models before inference when a native Ollama API base URL is configured, and SHALL preserve generic OpenAI-compatible provider behavior when it is not configured.

#### Scenario: Selected model is already loaded
- **WHEN** `/api/ps` reports the selected model as resident
- **THEN** the system starts inference without issuing a preload request or showing a model-loading state

#### Scenario: Ollama integration is not configured
- **WHEN** generation starts without a native Ollama API base URL
- **THEN** the system starts the configured OpenAI-compatible completion without contacting Ollama native endpoints

#### Scenario: Residency probe is unavailable
- **WHEN** the optional `/api/ps` request fails before residency can be determined
- **THEN** the system proceeds with normal provider inference without claiming that the model is loading

### Requirement: Explicit model preload
The system SHALL preload an installed selected model through Ollama's native API when `/api/ps` establishes that the model is not resident, and SHALL avoid duplicate simultaneous preload operations for the same model.

#### Scenario: Selected model is not loaded
- **WHEN** `/api/ps` does not report the selected model as resident
- **THEN** the system sends an empty native Ollama chat request for that model and waits for it to complete before starting inference

#### Scenario: Concurrent requests require the same model
- **WHEN** multiple generation requests concurrently determine that the same model requires loading
- **THEN** the system performs one bounded preload operation and allows the requests to await its result

#### Scenario: Explicit preload fails
- **WHEN** an unloaded model's preload request fails or exceeds its timeout
- **THEN** the system emits a safe generation error, releases request concurrency state, and does not start inference

### Requirement: Model-loading progress stream
The system SHALL communicate model-loading progress through ephemeral generation stream events without persisting the status or any additional conversation content.

#### Scenario: Begin a cold model request
- **WHEN** the selected model requires preloading
- **THEN** the browser receives a loading status and displays “Loading model…” before inference starts

#### Scenario: Preload completes
- **WHEN** the selected model finishes loading successfully
- **THEN** the browser clears the loading message, returns to the ordinary generation indicator, and the backend starts inference

#### Scenario: Response content begins
- **WHEN** the provider emits the first assistant response delta
- **THEN** the browser replaces any generation status indicator with the streamed assistant content

#### Scenario: Use an already-loaded model
- **WHEN** the selected model is resident or Ollama integration is disabled
- **THEN** the browser uses the existing ordinary generation indicator without displaying “Loading model…”

### Requirement: Loading cancellation and privacy
The system SHALL preserve cancellation, isolation, and content-free diagnostics while checking or loading an Ollama model.

#### Scenario: User stops during model loading
- **WHEN** the initiating user stops generation or disconnects while awaiting residency or preload work
- **THEN** the browser stops waiting, the conversation concurrency key is released, and no assistant message is persisted

#### Scenario: Shared preload outlives one request
- **WHEN** one request disconnects while another request is awaiting the same shared model preload
- **THEN** cancellation of the first request does not cancel the bounded shared preload for the remaining request

#### Scenario: Diagnose model-loading failure
- **WHEN** a residency check or preload operation fails
- **THEN** server logs and client status events contain no submitted messages, generated response content, provider credentials, or cross-user identifiers
