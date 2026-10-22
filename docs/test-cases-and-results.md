# Test cases and results

Three layers of tests cover the feature. All of them pass on 2026-10-22 against the code in the
feature branches.

## 1. End-to-end protocol test (`tests/native_sso_e2e.py`)

Runs against a live eSignet (Go) with the mock identity system, playing both apps from the laptop.
35/35 checks pass; the JSON report is in `tests/results/native_sso_e2e.json` (tracked in git).

| # | Case | Expected | Result |
|---|---|---|---|
| D1 | Discovery advertises the token exchange grant | `grant_types_supported` contains the RFC 8693 URN | PASS |
| D2 | Discovery advertises `device_sso` | `scopes_supported` contains `device_sso` | PASS |
| S1 | Super app login with `device_sso` returns an access token | `token_type=DPoP` | PASS |
| S2 | … returns an `id_token` | present | PASS |
| S3 | … returns a `device_secret` | present (≈3.3 kB) | PASS |
| S4 | The device secret is encrypted | compact JWE, 5 segments | PASS |
| S5 | `id_token.ds_hash` = BASE64URL(SHA-256(device_secret)) | equal | PASS |
| S6 | `id_token.sid` present | present | PASS |
| S7 | Access token bound to Key A | `cnf.jkt` = thumbprint(Key A) | PASS |
| S8 | Super app userinfo with DPoP | claims returned (name) | PASS |
| C1 | Child token exchange (scope `openid profile`) | 200, `token_type=DPoP` | PASS |
| C2 | No device secret on an exchange | absent | PASS |
| C3 | Same subject as the super app | equal `sub` | PASS |
| C4 | `act.sub` names the super app | `mosip-super-app` | PASS |
| C5 | Child token bound to Key A | `cnf.jkt` equal | PASS |
| C6 | Child userinfo returns the consented claim | `name` | PASS |
| C7 | Device secret reusable for a second exchange | 200 | PASS |
| N1 | 10.a scope escalation (`phone` never granted) | `invalid_scope` "exceeds" | PASS |
| N2 | 10.b `device_sso` on exchange | `invalid_scope` | PASS |
| N3 | Other vendor redeems the secret | `invalid_grant` "vendor mismatch" | PASS |
| N4 | DPoP proof from a different key | `invalid_grant` "thumbprint" | PASS |
| N5 | Tampered device secret | `invalid_grant` "could not be decrypted" | PASS |
| N6 | Device secret presented with a wrong actor token type | `invalid_request` | PASS |
| B1 | Bonus: child asks for `email`, which was unticked at the super app's consent | `interaction_required` "email" | PASS |
| P1 | Login without `device_sso` issues no device secret | absent | PASS |
| P2 | … and no `ds_hash` | absent | PASS |
| D1 | Discovery advertises `native_sso_supported: true` (Native SSO §5) | present | PASS |
| N7 | Exchange `scope` without `openid` | `invalid_scope` "must include the openid scope" | PASS |
| N8 | Exchange without `audience` (§4.1) | `invalid_request` | PASS |
| N9 | Exchange with an `audience` other than the issuer (§4.1) | `invalid_target` | PASS |
| N10 | PAR with `profile device_sso` and no `openid` (§3.4) | `invalid_scope` "requires the openid scope" | PASS |
| S9 | A second `device_sso` login issues both an ID token and a device secret | both present | PASS |
| C8 | Exchange without `scope` | 200, granted `openid profile` | PASS |
| N11 | 10.b inherited scope never contains `device_sso` | absent | PASS |
| N12 | ID token of one login with the device secret of another | `invalid_grant` "ds_hash … does not match" | PASS |

## 2. Unit tests

### ThunderID (`repos/thunderid/backend`)

`go test ./internal/oauth/... ./pkg/thunderidengine/...` — all green. New tests:

- `authorization_code_test.go`: device secret issued with `sid` = authorization id when no SSO session,
  SSO session id reused, client not enabled, no provider, provider error, empty provider result,
  no secret without the scope.
- `token_exchange_test.go`: validate-grant rules (device_sso rejected, device-secret actor needs an
  id_token subject), provider nil, client not enabled, invalid secret, provider server error,
  ds_hash mismatch/missing, sid mismatch (3 variants), DPoP thumbprint mismatch/missing, subject
  mismatch, scope escalation, device secret as scope authority, success, derived consent allowed /
  interaction required / provider error, attribute caching of consented claims.
- `oauthutils_test.go`: `device_sso` classified as a protocol scope.

### eSignet (`repos/esignet-go/esignet-service`)

`go test ./...` — all green. New/updated tests:

- `device_secret_provider_test.go` (28 cases): generation (JWE, ds_hash, uniqueness, missing
  sub/sid, client not enabled, unknown client, validity bound, no encryption), validation (same
  client, sibling, allowed child client, other vendor, client not enabled, unknown client, tampered,
  plain JWS, expired, foreign issuer, missing input), derived consent (covered, hash matches an
  interactive login, missing claim, authorization scope not permitted / permitted, no origin
  consent, expired origin consent, inherited expiry, unknown child, missing input), KYC token
  unpacking (signed / encrypted), `DeviceSecretHash`.
- `validate_test.go`: `token_exchange` grant accepted at registration.
- `actor_provider_test.go`: registered grant types mapped to engine grant types.
- `kmtest`: the keymanager test fake now persists DB-resident key records and thumbprint lookups.

## 3. Device test (manual, Android)

Performed on a OnePlus CPH2531 (Android 15) with the apps installed from `mobile-sample/`:

| Step | Expected | Result |
|---|---|---|
| Vendor Wallet → Sign in with eSignet | Custom Tab opens the eSignet login for "Vendor Wallet (super app)" | PASS |
| OTP login, UIN entry | login page reached through `adb reverse` | PASS |
| Turnstile dummy captcha (auto-pass), OTP `111111`, consent Allow | redirect back to the app, claims shown, binding check "✓" | PASS |
| Vendor Health → Sign in | silent sign-in, "Signed in silently in N ms", claims shown | PASS (185–215 ms across runs; act.sub = mosip-super-app, cnf.jkt = Key A) |
| Vendor Health → Sign in with extra claims (phone) | dialog explaining the refusal, re-consent in the browser | PASS (dialog shown; interactive consent opens in the browser) |

## Test data

| Item | Value |
|---|---|
| eSignet | `http://localhost:8088` (developer mode, `.env` in `esignet-service/`) |
| Mock identity | UIN `1774231323`, OTP `111111`, PIN `545411` |
| Captcha | Cloudflare Turnstile dummy site key `1x00000000000000000000AA` (always passes; no validator URL configured locally) |
| Clients | `mosip-super-app`, `mosip-child-app` (relying party `mosip-demo-vendor`), `other-vendor-app` (relying party `another-vendor`) — registered by `mobile-sample/scripts/register_clients.py` |
| Client keys | RSA-2048, PKCS#8 PEM, generated per app; `kid` = RFC 7638 thumbprint |
