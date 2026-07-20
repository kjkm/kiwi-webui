# oidc-core

The shared OIDC core for rayfin, reputation, quetzal, and every app after
them. Two layers, deliberately separable:

| Layer | Where | Dependencies | Consumed by |
|---|---|---|---|
| **Policy** — identity-resolution port + conformance suite | `src/port.ts`, `src/cases.ts`, `src/run.ts` | none | all three existing apps (vendored) |
| **Protocol** — canonical `openid-client` handshake | `src/protocol/` | peer: `openid-client ^6.8` | the next new app (forward-only) |

Vendoring the policy suite alone (what the three apps do) pulls zero
dependencies — the protocol module is imported nowhere by it.

Normative specs: `openspec/specs/` in this repo. Background: `FINDINGS.md`.

## Policy layer: what the conformance suite pins

The canonical resolution policy, judged purely by **outcomes** (never by
storage internals — husk representation, schemas, and sentinels are
app-local and out of scope):

1. **Pinned sub wins.** A known `sub` resolves to its account; the username
   claim is ignored; the local username never changes.
2. **One-time link by username.** An unknown `sub` links to an *unlinked*
   local account matching `preferred_username` case-insensitively. Linking
   pins permanently; an account never gets a second sub.
3. **JIT provision, verbatim.** Otherwise a new account is created with the
   claimed username stored *exactly* — no case-folding, truncation,
   character substitution, or `-N` suffixing. (Leading/trailing whitespace
   handling is the one app-local edge: trim or refuse, never anything else.)
4. **Fail closed.** Missing username, invalid username (for apps that
   validate format on the SSO path), or a collision with a non-linkable
   account → refuse, creating and modifying nothing.
5. **Deleted-account lockout** (apps with deletion): a deleted account's
   sub and username both refuse.
6. **Email is never identity-bearing.**

Two named `regression/2026-06-*` cases replay the exact drifts found in the
June 2026 audit.

### Writing a policy adapter

Implement `PolicyAdapter` (`src/port.ts`), then bind to your runner:

```ts
import { runConformance, type PolicyAdapter } from "../vendor/oidc-core/src/index.js";
import { test } from "vitest"; // or node:test, jest, ...

const adapter: PolicyAdapter = /* your ~30–50 line adapter */;

runConformance(adapter, {
  test: (name, fn) => test(name, fn),
  skip: (name, reason) => test.skip(`${name} (${reason})`, () => {}),
});
```

Adapter contract:

- **`resolve(claims)` MUST invoke your production resolution code path** —
  the same code your OIDC callback route runs. If your resolution logic is
  inline in a route handler, extract it (behavior-preserving) into an
  exported function that both the route and the adapter call.
  **Re-implementing the logic in the adapter is forbidden**: that tests a
  copy and lets production drift undetected.
- `reset` / `seedUser` / `getUserByUsername` / `getUserBySub` are test-only
  plumbing against your test database; they must not be reachable from
  production code. `getUserByUsername` uses the same case-sensitivity your
  username uniqueness uses and returns the username exactly as stored.
- `capabilities.supportsDeletion`: `true` only if your app has account
  deletion (enables the lockout cases and `seedUser({ deleted: true })`).
- `capabilities.sampleInvalidUsername`: a username your own registration
  rules reject (e.g. `"a!"` against quetzal's `USERNAME_RE`), or `null` if
  your app applies no format validation on the SSO provisioning path.

Gated cases are **skipped loudly** — they appear in test output with the
gating capability named. If your output shows neither a pass nor a skip for
a case, your registrar binding is wrong.

## Protocol layer: the canonical handshake

`OidcClient` (`src/protocol/`) is the three apps' consensus, extracted:
boot-time discovery (fail-fast, actionable error), PKCE S256 + state +
nonce, single-use 10-minute flow state, validated callback exchange,
throw-on-failure. It is framework-free — it speaks URLs and strings, never
request/response objects. Cookies, sessions, and failure pages stay in your
app.

A new app needs three things:

**1. A `FlowStore` (~20 lines).** Where pending flows' `{state, nonce,
verifier}` live between redirect and callback. Two proven shapes:

- *Stateful* (reputation/quetzal): a DB row keyed by a random id, deleted on
  `consume` — strict single-use.
- *Stateless* (rayfin): the handle **is** the signed/encrypted payload,
  round-tripped through the cookie. Caveat: no server-side invalidation, so
  strict single-use depends on the IdP's one-time authorization code — use a
  stateful store if that matters to you.

`MemoryFlowStore` ships as the reference implementation (tests and
single-process apps).

**2. Two routes.**

```ts
import { OidcClient, OidcProtocolError, MemoryFlowStore } from "../vendor/oidc-core/src/protocol/index.js";

const client = await OidcClient.discover({
  issuer, clientId, clientSecret,
  flowStore: new MemoryFlowStore(),      // or your DB/cookie store
  scope: "openid profile",               // add ` email` if you store email
  // allowInsecureHttp: true,            // local dev/test ONLY — http issuers fail loudly without it
});

// GET /auth/oidc
const { url, flowHandle } = await client.startAuthorization(`${origin}/auth/oidc/callback`);
// set flowHandle in an HttpOnly SameSite=Lax cookie, redirect to url

// GET /auth/oidc/callback
try {
  const claims = await client.completeCallback(cookies.flow, callbackUrl);
  // → { sub, preferredUsername?, email? } — untransformed; feed your policy layer
} catch (err) {
  // THE CALLER CONTRACT: log err (OidcProtocolError.reason is diagnostic),
  // render ONE generic failure — indistinguishable across reasons.
}
```

**3. A policy adapter** (above) so the conformance suite guards your
resolution code from day one.

### Testing your integration

`test/stub-idp.ts` is an exported stub IdP (discovery + JWKS + token
endpoint signing arbitrary claims with the per-flow nonce; single-use
codes, like the real thing) — drive your app's routes against it the way
`test/protocol.test.ts` drives the client. The in-repo suite runs every
scenario against both flow-store shapes.

## Changing anything

Every conformance case carries the name of its spec scenario, and the
protocol tests map to the protocol spec. To change or extend behavior:
change the spec and the code/table in the same change, re-vendor into each
consuming app, and never edit either alone. `npm run check && npm test`
must be green.
