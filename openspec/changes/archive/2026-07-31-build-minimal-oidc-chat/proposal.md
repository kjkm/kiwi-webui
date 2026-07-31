## Why

Create a small, maintainable chat application inspired by Open WebUI without inheriting its broad feature set or internal complexity. The application needs only OIDC-based accounts and a straightforward interface for persistent, streamed LLM conversations.

## What Changes

- Create a new SvelteKit application in this project.
- Add OIDC-only authentication and just-in-time local accounts using `../oidc-standardization/oidc-core` with Authentik.
- Add secure server-side sessions, sign-in, sign-out, and basic account identity display.
- Add persistent chats and linear user/assistant message history.
- Add model discovery, selection, and streamed chat completions through one server-configured OpenAI-compatible provider.
- Add a responsive, minimal chat interface using Open WebUI as a behavioral and visual reference.
- Exclude local passwords, public signup, admin/RBAC, files, RAG, tools, skills, web search, audio, images, sharing, branching conversations, and multi-provider management.

## Capabilities

### New Capabilities
- `oidc-auth`: OIDC login, canonical identity resolution, JIT accounts, server-side sessions, and logout.
- `chat-conversations`: User-owned chat creation, listing, viewing, renaming, deletion, and linear message persistence.
- `llm-chat-streaming`: Authenticated streaming completions through a configured OpenAI-compatible model endpoint.
- `minimal-chat-ui`: Responsive sign-in and chat experiences with basic Markdown and code rendering.

### Modified Capabilities

None.

## Impact

- Establishes the application structure, database schema, server routes, and frontend from an otherwise empty project.
- Adds SvelteKit, TypeScript, SQLite persistence, `openid-client`, and the vendored or linked `oidc-core` integration.
- Requires Authentik OIDC configuration and OpenAI-compatible provider configuration at deployment time.
