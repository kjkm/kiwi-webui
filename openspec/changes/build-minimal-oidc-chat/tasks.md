## 1. Application Foundation

- [x] 1.1 Scaffold the SvelteKit TypeScript application with the Node adapter
- [x] 1.2 Add formatting, linting, type-checking, and test commands
- [x] 1.3 Define and validate environment configuration for the app, OIDC issuer/client, database, session lifetime, and LLM provider
- [x] 1.4 Add a production build and container-ready startup path

## 2. Persistence

- [x] 2.1 Add SQLite access and a migration runner with foreign keys enabled
- [x] 2.2 Create migrations for users, sessions, OIDC flows, chats, and ordered messages
- [x] 2.3 Implement transactional repositories for users, sessions, and single-use OIDC flows
- [x] 2.4 Implement ownership-aware repositories for chat and message CRUD
- [x] 2.5 Add repository tests for constraints, ordering, cascade deletion, and cross-user isolation

## 3. OIDC Authentication

- [x] 3.1 Vendor or package `oidc-standardization/oidc-core` with its provenance and required `openid-client` dependency
- [x] 3.2 Initialize OIDC discovery at startup and expose actionable readiness failure
- [x] 3.3 Adapt the SQLite OIDC flow repository to the canonical `FlowStore` contract
- [x] 3.4 Implement production identity resolution and bind it to the `oidc-core` conformance suite
- [x] 3.5 Implement secure hashed session creation, lookup, expiry, rotation, revocation, and cookie handling
- [x] 3.6 Add login, callback, logout, and current-account server routes
- [x] 3.7 Protect application and API routes and enforce same-origin state-changing requests
- [x] 3.8 Add stub-IdP integration tests for successful login and generic failure cases

## 4. Chat API and Streaming

- [x] 4.1 Add authenticated chat create, list, read, rename, and delete routes with input limits
- [x] 4.2 Implement the server-side OpenAI-compatible streaming client using fixed environment configuration
- [x] 4.3 Build the ordered provider payload from the authenticated owner's linear message history
- [x] 4.4 Add the generation endpoint with one active generation per chat and disconnect cancellation
- [x] 4.5 Persist user input and only completed assistant responses with defined failure behavior
- [x] 4.6 Add route and provider-stub tests for CRUD, ownership, streaming, errors, cancellation, and concurrent requests

## 5. Minimal Chat Interface

- [x] 5.1 Build the OIDC sign-in page and generic sign-in failure state
- [x] 5.2 Build the responsive authenticated shell with chat navigation and account/logout controls
- [x] 5.3 Build new-chat, chat selection, rename, and confirmed deletion interactions
- [x] 5.4 Build the linear conversation view and keyboard-accessible composer
- [x] 5.5 Connect incremental streaming, stop control, loading states, and recoverable error display
- [x] 5.6 Add sanitized basic Markdown and fenced-code rendering
- [x] 5.7 Add focused responsive styling and visible keyboard focus using Open WebUI only as a UX reference

## 6. Verification and Operations

- [x] 6.1 Add browser tests covering OIDC login, chat creation, streamed completion, reload persistence, and logout
- [x] 6.2 Add security tests for session expiry, cookie attributes, unsafe Markdown, CSRF rejection, and user-data isolation
- [x] 6.3 Document local Authentik client setup, environment variables, database persistence, provider setup, and production deployment
- [x] 6.4 Run formatting, linting, type checks, unit/integration tests, browser tests, and a production build

## 7. Container Release

- [x] 7.1 Add a gated GitHub Actions workflow publishing GHCR `latest` and commit-SHA images
- [x] 7.2 Add a Watchtower-compatible deployment compose and release environment template
- [x] 7.3 Harden and validate the Docker build context and release documentation

## 8. Model Selection

- [x] 8.1 Discover and validate models from the configured OpenAI-compatible provider
- [x] 8.2 Replace the conversation title with a searchable Open WebUI-style model selector
- [x] 8.3 Send the selected model with generation requests and retain the browser preference
- [x] 8.4 Cover model discovery, selection, completion routing, and production build validation
