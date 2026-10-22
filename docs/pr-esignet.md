# PR: Native SSO for Mobile Apps — device secret provider, derived consent, token exchange clients

Target: `mosip/esignet` `develop-go` · Branch: `feature/ps03-native-sso` (10 commits, DCO signed-off)

## Summary

Implements the eSignet side of **OpenID Connect Native SSO for Mobile Apps 1.0** on top of the
ThunderID engine changes (companion PR): a first native app that logs in with `scope=... device_sso`
receives a `device_secret`; a sibling app of the same vendor exchanges the ID token and the device
secret for its own DPoP-bound access token without a second login or consent screen.

## Changes

- `internal/engine/device_secret_provider.go` — `providers.DeviceSecretProvider` and
  `providers.DeviceSSOConsentProvider`:
  - device secrets are **signed-then-encrypted** JWTs (JWS by the OIDC signing key, JWE
    RSA-OAEP-256/A256GCM to the new `OIDC_SERVICE`/`DEVICE_SECRET_ENC` component encryption key
    provisioned at startup), carrying `iss, sub, auth_id, sid, client_id, scope, acr, claims, cnf.jkt,
    iat, exp, jti, token_type`;
  - generation and validation require `device_sso` in the client's
    `allowed_authorization_scopes`; validation checks issuer, expiry and the vendor family (same
    relying party or `allowed_child_clients`);
  - a signed KYC token from the identity system is unpacked into claims so the engine can serve the
    sibling app's userinfo; an encrypted KYC token stays opaque;
  - generation refuses a secret without `cnf.jkt` and validation treats one as `invalid_grant`, so
    every device secret is key-bound;
  - `ResolveDerivedConsent` allows the exchange only when the user's consent to the first app covers
    the sibling's claims and authorization scopes, and records a consent for the sibling with an
    audit row; an existing broader consent of the sibling is kept (widened, never narrowed; one
    history row per change); otherwise the engine answers `interaction_required`.
- Client management accepts the `token_exchange` grant; the engine client carries the registered
  grant types; deployment defaults allow the token exchange grant and advertise `device_sso`.
- Configuration: `MOSIP_ESIGNET_DEVICE_SECRET_VALIDITY_SECONDS` (default 30 days).
- Docs: `docs/native-sso.md` (design, flows, API, spec-conformance matrix, threat model, client
  checklist), OpenAPI (`/oauth2/token` token-exchange parameters incl. `audience`, `device_secret`,
  `native_sso_supported`), configuration reference, RP integration guide, and
  `postman-collection/Go-eSignet-NativeSSO.postman_collection.json`.
- Tests: `device_secret_provider_test.go` (28 cases), client validation and engine client mapping
  tests; `kmtest` can now round-trip JWE keys.

## How to test

```bash
cd esignet-service && go test ./...
# end to end (docker-compose dependent services + ./make.sh run), from the hackathon repository:
python3 tests/native_sso_e2e.py   # 35 checks: issuance, binding, exchange, negative cases, re-consent
```

## Dependencies

Requires the ThunderID companion PR (`DeviceSecretProvider`, `DeviceSSOConsentProvider`, token
exchange with device-secret actor tokens). Until that PR is merged and tagged, `go.mod`'s
`replace github.com/thunder-id/thunderid` must point at the companion branch (a published
pseudo-version of the fork); the PR will be updated to the upstream version once it exists.
