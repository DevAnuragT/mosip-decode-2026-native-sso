# PR: OpenID Connect Native SSO for Mobile Apps (device secrets + token exchange)

Target: `thunder-id/thunderid` `main` · Branch: `feature/ps03-native-sso` (3 commits, DCO signed-off)

### Purpose

Adds the engine side of **OpenID Connect Native SSO for Mobile Apps 1.0** so an embedding
authorization server (eSignet) can let a second native app of the same vendor reuse the first app's
authentication: the authorization-code grant issues a *device secret* next to the ID token, and the
RFC 8693 token exchange accepts that device secret as `actor_token` to mint the sibling app's own
DPoP-bound access token. Nothing changes for deployments that do not configure a
`DeviceSecretProvider`.

### Approach

- **Provider contracts** (`pkg/thunderidengine/providers`): `DeviceSecretProvider`
  (`GenerateDeviceSecret`, `ValidateDeviceSecret`) wired with `WithDeviceSecretProvider`, and the
  optional `DeviceSSOConsentProvider` (`ResolveDerivedConsent`) that lets the embedder decide whether
  the consent captured by the first app covers the second app's request.
- **Authorization-code grant**: when the grant carries `device_sso` (a protocol scope, kept out of
  resource-server downscoping), the client must be registered for it and a provider must exist; the
  engine mints the device secret with `sub`, `auth_id`, `sid` (the SSO session id, or the
  authorization id when no session store exists), `client_id`, scope, acr, the user's attributes and
  `cnf.jkt` (the DPoP key), returns it as `device_secret`, and puts `ds_hash` and `sid` on the ID
  token.
- **Token exchange** with `actor_token_type=urn:openid:params:token-type:device-secret`: requires an
  `id_token` subject token, a client registered for `device_sso`, validates the secret through the
  provider, checks `ds_hash = BASE64URL(SHA-256(actor_token))`, equal `sid` and `sub`, a DPoP proof
  from the key in `cnf.jkt`, uses the device secret's scope as the grant authority (child scope ⊆
  it, else `invalid_scope`), refuses `device_sso` on an exchange, asks the consent provider (a
  refusal is `interaction_required`), caches the device secret's claims as the new token's attribute
  cache (filtered to the scopes released), and records the first app as the `act` actor.
- Constants: `ScopeDeviceSSO`, `TokenTypeIdentifierDeviceSecret`, `ErrorInteractionRequired`.

### Related Issues
- MOSIP Decode 2026, problem statement 03 (eSignet Native SSO)

### Related PRs
- mosip/esignet: eSignet `DeviceSecretProvider` implementation (companion PR)

### Checklist
- [x] Followed the contribution guidelines.
- [x] Manual test round performed and verified (eSignet end-to-end test, Android apps).
- [x] Documentation provided (eSignet `docs/native-sso.md`; provider interfaces documented inline).
- [x] Tests provided: unit tests in `granthandlers` (authorization code + token exchange) and `oauth2/utils`.
- [ ] Breaking changes: none (new optional provider; `newTokenExchangeGrantHandler` gains parameters, internal).

### Security checks
- [x] Followed secure coding standards.
- [x] No keys, passwords, tokens or secrets committed.
