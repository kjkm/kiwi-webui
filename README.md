# Kiwi WebUI

A minimal, OIDC-only chat interface for one OpenAI-compatible provider. It uses SvelteKit, browser-local IndexedDB for conversations, SQLite for account metadata, and the canonical OIDC implementation vendored from `../oidc-standardization/oidc-core`.

## Features

- Authentik/OpenID Connect login with PKCE and just-in-time accounts
- Hashed, server-side application sessions
- Browser-local, user-partitioned chats with linear message history
- Searchable provider model selection and streaming OpenAI-compatible responses
- Responsive interface with sanitized Markdown and code blocks

There are no local passwords, public registration, admin console, files, RAG, tools, web search, or multi-provider management.

## Local setup

Requirements: Node.js 22+ and an Authentik OIDC application.

```sh
cp .env.example .env
npm install
npm run dev
```

SQLite migrations run automatically. The default database is `./data/kiwi-webui.db` and contains account, session, and OIDC flow metadata only.

Useful checks:

```sh
npm run format
npm run lint
npm run check
npm test
npm run test:e2e
npm run build
```

## Authentik configuration

Create an OAuth2/OpenID Provider and application with:

- **Redirect URI:** `${PUBLIC_BASE_URL}/auth/callback`
- **Flow:** Authorization code
- **Scopes:** `openid profile email`
- **Subject mode:** Stable per-user subject
- A `preferred_username` string claim

Set `OIDC_ISSUER` to Authentik's issuer URL and provide the client ID and secret. Plain HTTP issuers are rejected unless `OIDC_ALLOW_INSECURE_HTTP=true`; use that setting only for local development.

Accounts are resolved by stable OIDC subject, then linked once by case-insensitive username, then provisioned just in time. Email is never used as an identity key. Username collisions and invalid claims fail closed.

## OpenAI-compatible provider

Set:

- `OPENAI_BASE_URL` to the API root, normally ending in `/v1`
- `OPENAI_API_KEY` to the server-side credential
- `OPENAI_MODEL` to the default model ID

The provider must implement `POST /chat/completions` with standard OpenAI SSE streaming and a final `data: [DONE]` event. When `GET /models` is available, its models appear in the searchable header selector; otherwise the configured default remains available. Credentials and endpoint configuration are never sent to the browser.

## Conversation storage and privacy

Chat titles and user and assistant messages are stored in IndexedDB in the browser profile, partitioned by the authenticated OIDC user ID. They remain after logout for that same user, but they do not synchronize across browsers or devices and are permanently lost if site data is cleared. No backup, export, or import facility is currently provided.

The backend receives bounded conversation history transiently for each completion and forwards it to the configured model provider. It does not persist chat content or include it in application logs. This is a no-server-retention guarantee, not end-to-end encryption; browser extensions, same-origin scripts, developer tools, and the configured provider remain part of the trust boundary.

## Production

`PUBLIC_BASE_URL` and SvelteKit's `ORIGIN` must both be the externally visible origin, for example `https://chat.example.com`. Put the service behind TLS and persist `/app/data`.

For a local image build:

```sh
docker compose up --build
```

Pushes to `main` run `.github/workflows/build.yml`. After linting, type checks, and tests pass, it publishes:

- `ghcr.io/<owner>/kiwi-webui:latest`
- `ghcr.io/<owner>/kiwi-webui:<commit-sha>`

For automatic homelab updates, copy `deploy/docker-compose.yml` and `deploy/.env.example` to the server, replace `OWNER`, configure `.env`, and run `docker compose up -d`. The included Watchtower service polls the labeled application container for new `:latest` images. Pin a commit-SHA tag to hold or roll back.

The readiness endpoint is `GET /api/health/ready`. It returns 503 when OIDC discovery or provider configuration is unavailable.

Important deployment properties:

- Run one application instance against each SQLite database.
- Back up the database file and its WAL consistently for account metadata; conversation content exists only in users' browsers.
- Keep `.env` and provider/OIDC secrets outside the image.
- Preserve the `data` volume across upgrades and rollbacks.

To roll back, stop the service, restore a compatible application image and database backup, then restart. Migrations are forward-only in this initial release.

## OIDC provenance

The vendored canonical source is under `src/lib/server/oidc-core/`; see `PROVENANCE.md` and `UPSTREAM.md`. Production identity resolution is tested against its executable conformance suite.
