## Context

The project is empty except for OpenSpec configuration. It will be a new, minimal application that references Open WebUI's core chat experience while avoiding its platform features. Authentication is OIDC-only through Authentik, using the canonical TypeScript client and policy suite in `../oidc-standardization/oidc-core`.

## Goals / Non-Goals

**Goals:**
- Deliver one small deployable application for authenticated, persistent LLM chat.
- Keep authentication, data ownership, and provider credentials server-side.
- Reuse the canonical OIDC protocol and identity-resolution behavior.
- Keep the architecture understandable and testable with few moving parts.

**Non-Goals:**
- Compatibility with Open WebUI internals or data.
- Password authentication, public registration, administration, or RBAC.
- Files, RAG, tools, skills, search, audio, images, sharing, message branching, or provider management.
- Multi-node operation in the initial release.

## Decisions

### SvelteKit as a single full-stack application

Use SvelteKit with TypeScript and the Node adapter for pages, API routes, and server logic. This directly consumes `oidc-core`, keeps one language and deployment unit, and avoids a separate Python service. Open WebUI is a UX reference only; its coupled components will not be copied wholesale.

### SQLite persistence

Use SQLite with migrations for users, sessions, OIDC flows, chats, and messages. Foreign keys and transactions enforce ownership and preserve ordered linear histories. Store timestamps in UTC and use opaque generated IDs. SQLite suits the intended single-instance deployment; a repository boundary will keep a later database change possible without designing for it now.

### Canonical OIDC-only authentication

Configure one issuer and use `oidc-core` for discovery, PKCE, state, nonce, callback validation, and identity resolution. Use a database-backed `FlowStore` for expiring, single-use authorization flows. JIT provision accounts according to the conformance policy: pinned subject first, one-time case-insensitive username linking, otherwise verbatim provisioning, with collisions and invalid claims failing closed. Email is profile data, never an identity key.

Issue random opaque sessions in an HttpOnly, Secure-in-production, SameSite=Lax cookie. Store only a hash of the session token in SQLite. Rotate the session after login, enforce expiry on every authenticated request, and delete it on logout. State-changing routes also validate same-origin requests.

### Server-owned model configuration

Configure one OpenAI-compatible base URL, API key, and model through environment variables. The browser never receives provider credentials or selects arbitrary endpoints. The server validates requests, loads the user's ordered conversation, forwards it to the configured chat-completions endpoint, and relays the upstream SSE stream.

### Linear conversation model

Persist chats separately from ordered messages. A chat has one owner and messages have `user` or `assistant` roles. Editing, regeneration, branches, and concurrent generations in the same chat are excluded. Completed assistant text is persisted atomically at stream completion; failed or cancelled generations do not create a misleading completed assistant message.

### Small original interface

Implement an original responsive shell with a chat list, new-chat action, conversation view, composer, streaming indicator, account identity, and logout. Render a deliberately limited Markdown subset and sanitize generated HTML before insertion. Match useful Open WebUI interaction patterns without importing its feature-heavy chat implementation.

### Test boundaries

Use the exported OIDC stub IdP and policy conformance suite. Add repository/route tests for ownership, session expiry, chat CRUD, streaming success, upstream failure, and cancellation. Add browser-level coverage for login-to-chat and chat persistence.

## Risks / Trade-offs

- **[Relative `oidc-core` dependency complicates builds]** → Vendor it using its documented workflow or package it during project setup, while retaining upstream provenance and conformance tests.
- **[SQLite limits horizontal scaling]** → Document single-instance operation and avoid Redis/multi-worker complexity until required.
- **[OpenAI-compatible servers vary in SSE details]** → Support the standard chat-completions SSE format and return a clear generic provider error for unsupported variants.
- **[Partial streams can diverge from persisted history]** → Persist assistant messages only after clean completion and clearly mark interrupted output as unsaved.
- **[Untrusted model Markdown can produce unsafe HTML]** → Disable raw HTML and sanitize all rendered output.
