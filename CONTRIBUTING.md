# Working on this repository

This file is for anyone who wants to build, run, test or extend the Native SSO work: judges, MOSIP
and ThunderID maintainers, and contributors. The submission overview is in `README.md`; the
protocol and its security argument are in `docs/design-document.md`.

## 1. Layout and the three git repositories

| Path | Git | Branch | Contents |
|---|---|---|---|
| this repository | own history | `master` | Android SDK + reference apps (`mobile-sample/`), end-to-end test (`tests/`), Postman collection (`postman/`), one-command stack (`deploy/`), documents (`docs/`), login theme (`ui-theme/`), demo tooling (`tools/`). |
| `repos/thunderid` | clone of the ThunderID fork, fetched by `scripts/fetch-backends.sh` (git-ignored here) | `feature/ps03-native-sso` (one squashed commit on the maintainers' `feature/1.1.0/oidc-native-sso` release line, the PR branch) and `feature/ps03-native-sso-pre-rebase` (the same work as separate commits on the older base that eSignet `develop-go` pins) | Engine side of the protocol. |
| `repos/esignet-go` | clone of the eSignet fork, fetched by the same script | `feature/ps03-native-sso` (on `develop-go`) | eSignet side: `DeviceSecretProvider`, consent, client registration, docs, OpenAPI. |

Version skew to keep in mind: eSignet `develop-go` pins ThunderID at an older commit (Go 1.26);
ThunderID `main` requires Go 1.27 and changed the authentication-provider interface, so eSignet does
not compile against ThunderID `main`. eSignet's `go.mod` therefore replaces the ThunderID module with
the `-pre-rebase` branch (`../../thunderid/backend` in a local checkout; the compose build does the
same inside the image). Keep the two ThunderID branches in sync by cherry-picking, and do not commit a
`go mod tidy` that bumps eSignet's other dependencies.

## 2. What lives where

### ThunderID (`repos/thunderid/backend`)
- `internal/oauth/providers`: `DeviceSecretProvider`, `DeviceSSOConsentProvider` and their
  parameter/result types; `WithDeviceSecretProvider` option.
- `internal/oauth/constants`: `ScopeDeviceSSO`, `TokenTypeIdentifierDeviceSecret`, `ErrorInteractionRequired`.
- `internal/oauth/granthandlers/authorization_code.go`: `device_sso` requires `openid`, a client enabled
  for it and a provider; mints the device secret; puts `ds_hash` and `sid` on the ID token.
- `internal/oauth/granthandlers/token_exchange.go`: device-secret actor tokens; `ds_hash`, `sid`, `sub`,
  `cnf.jkt` = DPoP key, scope ⊆ grant, `device_sso` never exchangeable, derived consent
  (`interaction_required`), `act.sub` = super app, `audience` = issuer.
- `internal/oauth/oauth2/utils`: `device_sso` is a protocol scope, never a resource-server scope.
- `internal/oauth/tokenservice`: an expired self-issued ID token is still a valid subject token on a
  device-secret exchange (ID tokens live minutes, device secrets weeks); signature, `nbf`, `typ` and
  revocation stay enforced.
- Discovery advertises `native_sso_supported`.
- Tests: `go test ./internal/oauth/... ./pkg/thunderidengine/...`

### eSignet (`repos/esignet-go/esignet-service`)
- `internal/engine/device_secret_provider.go`: device secrets are signed with the OIDC key and
  encrypted to a component key (`DEVICE_SECRET_ENC`, provisioned at start-up); allowed-scope checks on
  issue and redeem; issuer and expiry; vendor family (same relying party or `allowed_child_clients`);
  KYC JWS unpacking; `ResolveDerivedConsent` writes a consent record and a history row for the child.
- `clientmgmt`: `token_exchange` grant type and `actor_provider.go`; `deployment.yaml` allows the
  grant and the `device_sso` scope; `MOSIP_ESIGNET_DEVICE_SECRET_VALIDITY_SECONDS`.
- `docs/native-sso.md`, OpenAPI (`/oauth2/token`), configuration reference, relying-party guide,
  `postman-collection/Go-eSignet-NativeSSO.postman_collection.json`.
- Tests: `go test ./...`

### Android (`mobile-sample/`, Gradle 8.11 / AGP 8.7 / Kotlin 2.0 / JDK 17)
- `nativesso-sdk`: `Codec`, `KeystoreDpopSigner` (Key A, EC P-256, StrongBox preferred),
  `ClientKey` (PS256 `private_key_jwt`), `EsignetClient` (PAR, PKCE, DPoP, code redemption, token
  exchange, userinfo, ID-token verification against the JWKS), `SessionStore`
  (EncryptedSharedPreferences), `NativeSsoContract` (ContentProvider IPC + remote DPoP signing).
- `super-app` (Vendor Wallet) and `child-app` (Vendor Health), both signed with
  `keystore/mosip-demo.jks` (demo certificate, not for production).
- `scripts/register_clients.py` generates the client keys into `res/raw/` and registers three clients:
  the super app, the child app and a rogue "other vendor" app for the negative tests.
- Tests: `./gradlew :nativesso-sdk:testDebugUnitTest` (JDK 17); CI runs them in
  `.github/workflows/sdk-tests.yml`.

### Verification and demo assets
- `tests/native_sso_e2e.py`: drives the complete protocol against a running eSignet, including every
  negative case and re-consent; prints `N/N checks passed`; latest results in `tests/results/`.
- `postman/build_collection.py` regenerates the collection and a local environment (the environment
  contains the demo private keys and is git-ignored).
- `tools/demo_driver.js` performs the phone demo over adb and Chrome DevTools; `tools/video/` turns
  three screen recordings and title cards into `docs/demo-video.mp4`; `tools/deck/` generates
  `docs/pitch-deck.pptx`.

## 3. Running the stack

The one-command path is in `README.md` (`deploy/docker-compose.yml`). Developer mode, with eSignet
running from source on the host:

```bash
cd repos/esignet-go/docker-compose && docker compose -f dependent-docker-compose.yaml up -d   # PostgreSQL :5455, mock identity :8082
cd ../esignet-service && cp <repo>/docs/esignet.env.example .env && ./make.sh run              # eSignet :8088
docker run -d --name esignet-ui --add-host esignet:host-gateway -p 3000:3000 \
  -v "$PWD/../docker-compose/nginx.conf:/etc/nginx/nginx.conf" -e DEFAULT_LANG=en mosipdev/oidc-ui:develop-go
python3 mobile-sample/scripts/register_clients.py
python3 tests/native_sso_e2e.py
```

Test identity: UIN `1774231323`, OTP `111111`. The captcha is Cloudflare Turnstile's public test
key, which passes without a tap; the local eSignet has no captcha validator configured and accepts any
non-empty token. Never automate a real captcha.

Useful resets:

- Consent between demos: `delete from esignet.consent_detail; delete from esignet.consent_history;`
  in the `mosip_esignet` database (`docker compose exec database psql -U postgres -d mosip_esignet`).
- Mock identity system after a Docker restart: its entrypoint cannot re-unzip the HSM client, and once
  recreated its keymanager finds `key_alias` rows for a PKCS12 file that no longer exists
  (`KER-KMA-004 No such alias`; eSignet reports `send_otp_failed`). Run
  `delete from mockidentitysystem.key_store; delete from mockidentitysystem.key_alias;` in
  `mosip_mockidentitysystem`, then `docker compose -f dependent-docker-compose.yaml up -d --force-recreate mock-identity-system`.
- Phones reach the laptop through `adb reverse tcp:8088 tcp:8088` and `adb reverse tcp:3000 tcp:3000`;
  both drop on every USB reconnect.

## 4. Conventions

- Commits are DCO signed-off (`git commit -s`). Upstream Go files carry the MPL-2.0 header used by
  eSignet.
- Run the end-to-end script after any backend change; rebuild and reinstall both APKs after SDK changes.
- Keep the two ThunderID branches identical in content; eSignet builds against the `-pre-rebase` one.
- Never commit the Postman environment or the generated client private keys.

## 5. Ideas for follow-up work

Not required by the problem statement, listed in `docs/design-document.md` §8:
device-secret revocation on super-app sign-out, single-use `jti` tracking, a child ID token on
exchange, a consent-screen line item explaining `device_sso` to the citizen, an iOS reference app.
