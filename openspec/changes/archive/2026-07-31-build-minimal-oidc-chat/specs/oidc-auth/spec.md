## ADDED Requirements

### Requirement: OIDC-only sign-in
The system SHALL authenticate users only through the configured OIDC issuer using authorization code flow with PKCE, state, and nonce validation.

#### Scenario: Begin sign-in
- **WHEN** an unauthenticated visitor starts sign-in
- **THEN** the system creates an expiring OIDC flow and redirects the visitor to the configured issuer

#### Scenario: Complete valid callback
- **WHEN** the issuer returns a valid callback matching an unconsumed flow
- **THEN** the system resolves the identity, creates a server-side session, and redirects the user to the application

#### Scenario: Reject invalid callback
- **WHEN** callback validation, flow consumption, or identity resolution fails
- **THEN** the system creates no session and presents one generic sign-in failure

### Requirement: Canonical account resolution
The system SHALL use the `oidc-core` identity policy and SHALL keep its production resolution path conformant with the supplied conformance suite.

#### Scenario: Resolve pinned subject
- **WHEN** a valid claim subject is already pinned to an account
- **THEN** the system signs in that account without changing its username

#### Scenario: Link an existing account once
- **WHEN** an unknown subject has a case-insensitive username match with an unlinked account
- **THEN** the system permanently pins the subject to that account

#### Scenario: Provision an account
- **WHEN** neither subject nor username resolves to an existing account and claims are valid
- **THEN** the system creates a non-administrative account with the claimed username stored verbatim

#### Scenario: Refuse an unsafe resolution
- **WHEN** the username is missing, invalid, or held by a non-linkable account
- **THEN** the system fails closed without creating or modifying an account

### Requirement: Secure application sessions
The system SHALL use expiring opaque server-side sessions conveyed by an HttpOnly SameSite cookie and SHALL never expose provider tokens to browser storage.

#### Scenario: Access authenticated content
- **WHEN** a request includes a valid unexpired session
- **THEN** the system associates the request with that session's user

#### Scenario: Reject absent or expired session
- **WHEN** a protected request lacks a valid unexpired session
- **THEN** the system denies access and directs browser navigation to sign-in

#### Scenario: Sign out
- **WHEN** an authenticated user signs out
- **THEN** the system revokes the server-side session and clears its cookie

### Requirement: Basic account identity
The system SHALL display the authenticated user's basic OIDC-derived identity without offering password management.

#### Scenario: View account identity
- **WHEN** an authenticated user opens the account control
- **THEN** the system displays the account's username and available display name or email
