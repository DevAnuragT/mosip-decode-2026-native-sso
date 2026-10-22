# MOSIP Decode 2026 — Agent Execution & Development Guide

**Problem statement 03:** `eSignet | Enable Native SSO in eSignet Go for Mobile Apps`
**Tracking file:** `AGENTS.md` (engineering log, state of play, how to work in this workspace)

---

## 0. Hackathon facts (from Unstop + the organiser PDFs, 2026-10-21)

- **Final submission deadline: 26 Oct 2026, 23:59 IST.** Evaluation 2–6 Nov 2026. Last submission counts.
- Submit by email to `decode@mosip.io`: team name, problem statement, links (code repo + a cloud folder
  with the other artefacts). Everything must be accessible.
- Mandatory artefacts: source repo with history, working prototype, pitch deck, 2–5 min demo video,
  README with install steps, API documentation, college IDs. Scored extras: architecture diagram,
  mockups, test data, test cases + results.
- Scoring: functionality 40 %, deliverable quality 40 % (code quality, docs, scalability,
  reusability, maintainability), UX 10 %, presentation 10 %.
- PS03 deliverables: native apps, Postman collection, API + design docs, PPT, demo video.

## 1. Workspace layout and git state

| Path | Git | Branch of record | Notes |
|---|---|---|---|
| `/Users/anurag/MOSIP hack` (this folder) | own repo (`master`) | — | Submission repo: `mobile-sample/`, `tests/`, `postman/`, `docs/`, `README.md`. `repos/` and `scratch/` are git-ignored. |
| `repos/thunderid` | fork checkout of `thunder-id/thunderid` | `feature/ps03-native-sso` (rebased on `origin/main`, 10 commits) | **PR branch.** `feature/ps03-native-sso-pre-rebase` holds the same work on the older base that eSignet `develop-go` pins; keep both in sync (cherry-pick) — eSignet is built against the pre-rebase branch. |
| `repos/esignet-go` | checkout of `mosip/esignet` (`origin`), fork remote `fork` = DevAnuragT/esignet | `feature/ps03-native-sso` (rebased on `origin/develop-go`, 9+ commits) | **PR branch.** Go code lives on `develop-go`, never rebase onto `master` (Java). `go.mod` replaces thunderid with `../../thunderid/backend`. `fix/2555-...` carries the separate community bug fix. |

Version skew to remember: eSignet `develop-go` pins ThunderID at an Aug-2026 commit (Go 1.26);
ThunderID `main` needs Go 1.27.2 and changed the authn provider interface, so eSignet does **not**
compile against ThunderID `main`. Do not commit a `go mod tidy` that bumps eSignet's `go.mod`.

## 2. What is implemented (all PS03 tasks + bonus)

### ThunderID (`repos/thunderid/backend`)
- `providers`: `DeviceSecretProvider`, `DeviceSSOConsentProvider`, `DeviceSecretParams/Result/Claims`
  (incl. `SessionID`), `DerivedConsentRequest/Result`; `WithDeviceSecretProvider`.
- `constants`: `ScopeDeviceSSO`, `TokenTypeIdentifierDeviceSecret`, `ErrorInteractionRequired`.
- `granthandlers/authorization_code.go`: `device_sso` ⇒ client must be enabled + provider present;
  mints device secret (sid = SSO session id or authorization id), `ds_hash` + `sid` on the ID token.
- `granthandlers/token_exchange.go`: device-secret actor: id_token subject required, client enabled,
  provider validation, `ds_hash`/`sid`/`sub` checks, DPoP key = `cnf.jkt`, device-secret scope is
  the grant authority, `device_sso` refused, derived consent (⇒ `interaction_required`), attribute
  cache from the device secret's claims, `act` = super app.
- `oauth2/utils`: `device_sso` is a protocol scope (not downscoped to a resource server).
- `tokenservice`: `ValidateNativeSSOSubjectToken` accepts an expired self-issued ID token on a
  device-secret exchange (ID tokens live ~2 min, device secrets 30 days); nbf, signature, typ and
  revocation are still enforced. Found on the phone: "The subject_token has expired".
- Tests: `granthandlers` (both suites), `oauth2/utils`. `go test ./internal/oauth/... ./pkg/thunderidengine/...` green.

### eSignet (`repos/esignet-go/esignet-service`)
- `internal/engine/device_secret_provider.go`: signed-then-encrypted device secrets
  (`OIDC_SERVICE`/`DEVICE_SECRET_ENC`, provisioned in `main.go`), allowed-scope checks on both sides,
  issuer/expiry, vendor family (RP id or `allowed_child_clients`), KYC JWS unpacking,
  `ResolveDerivedConsent` (consent record + history row for the child).
- `clientmgmt`: `token_exchange` grant accepted; `actor_provider.go` maps registered grant types;
  `deployment.yaml` allows the exchange grant + `device_sso`; config
  `MOSIP_ESIGNET_DEVICE_SECRET_VALIDITY_SECONDS`.
- Docs: `docs/native-sso.md`, OpenAPI, configuration, RP guide. Tests: `go test ./...` green.

### Mobile (`mobile-sample/`, Gradle 8.11.1 / AGP 8.7.3 / Kotlin 2.0.21 / JDK 17)
- `nativesso-sdk`: `Codec`, `KeystoreDpopSigner` (Key A, EC P-256), `ClientKey` (PS256
  private_key_jwt, `aud` = issuer, `kid` = RFC 7638 thumbprint), `EsignetClient` (PAR/PKCE/DPoP,
  code redemption, token exchange, userinfo), `SessionStore` (EncryptedSharedPreferences),
  `NativeSsoContract` (ContentProvider IPC + `RemoteDpopSigner`).
- `super-app` (Vendor Wallet, `org.mosip.superapp`) and `child-app` (Vendor Health,
  `org.mosip.childapp`), both signed with `keystore/mosip-demo.jks`. Edge-to-edge safe-area handled
  with `fitsSystemWindows`; readable key/value rows.
- `scripts/register_clients.py` generates client keys into `res/raw/` and registers
  `mosip-super-app`, `mosip-child-app`, `other-vendor-app`.
- Build: `JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew assembleDebug`. Device: OnePlus
  CPH2531 (`FUHIYLMZUO8LAMY9`, Android 15). Needs `adb reverse tcp:8088 tcp:8088` and
  `adb reverse tcp:3000 tcp:3000` (re-run after every reconnect).

### Login UI theme (`ui-theme/`)
- `esignet-data/` overlay of the eSignet data dir (adds `theme-modern.yaml`, captcha `size: compact`),
  selected with `DATA_DIR="…/ui-theme/esignet-data"` (quoted: the path has a space) and
  `MOSIP_ESIGNET_THEME_ID=theme-modern` in `.env`; `variables.css` mounted into the oidc-ui
  container by `run-ui.sh` (Inter font via `DEFAULT_FONT_URL`). Real SDK class names are BEM:
  `thunderid-button__outline`, `thunderid-button__solid.thunderid-button__primary`,
  `thunderid-text-field__input`, `thunderid-typography__h3/subtitle2`; the card is a fixed 420 px
  `thunderid-signin` (overridden to 100%). Browser caches `variables.css`: clear cache after edits
  (DevTools over `adb forward tcp:9222 localabstract:chrome_devtools_remote` works with Brave).

### Submission docs (`docs/`)
- `submission-checklist.md` (organiser requirements → evidence), `solution-overview.md` (team line
  still a placeholder), `api-documentation.md`, `mockups-and-flows.md`, `images/architecture.svg`
  (render with headless Chrome; qlmanage crops it), `design-document.md`, `test-cases-and-results.md`,
  `pitch-deck.pptx`, `submission-email.md`, `pr-*.md`, `esignet.env.example`. SDK JVM tests:
  `./gradlew :nativesso-sdk:testDebugUnitTest` (12 tests).

### Verification assets
- `tests/native_sso_e2e.py`: 35/35 against the local stack (drives the login flow API with
  `test-captcha-token`). Results in `tests/results/`.
- `postman/build_collection.py` → collection + env (Postman desktop app; newman lacks WebCrypto/top-level await).

## 3. Local stack (how it is running now)

```bash
cd repos/esignet-go/docker-compose && docker compose -f dependent-docker-compose.yaml up -d   # Postgres :5455, mock-identity :8082
cd ../esignet-service && ./make.sh run          # :8088, .env prepared (mock authn, inmemory cache, PKCS12 ./keystore.pfx, LOG_LEVEL=debug)
docker run -d --name esignet-ui --user root --add-host esignet:host-gateway -p 3000:3000 \
  -v "$PWD/../docker-compose/nginx.conf:/etc/nginx/nginx.conf" -e DEFAULT_LANG=en mosipdev/oidc-ui:develop-go
python3 mobile-sample/scripts/register_clients.py
python3 tests/native_sso_e2e.py
```
Mock identity: UIN `1774231323`, OTP `111111`. Captcha: Cloudflare Turnstile dummy key
(`cloudflare-turnstile` / `1x00000000000000000000AA`) auto-passes with no tap; the server has no
validator URL so any non-empty token is accepted locally. Never automate a real captcha. To reset consent between
demos: `delete from esignet.consent_detail; delete from esignet.consent_history;` in the
`mosip_esignet` database (`docker compose exec database psql -U postgres -d mosip_esignet`).

## 4. Open items / next steps

1. **Phone walk-through done (2026-10-21 18:30):** Wallet login (captcha ticked by the user) →
   Health silent sign-in in 215 ms (act.sub = super app, cnf.jkt = Key A) → "extra claims (phone)"
   refused with invalid_scope → dialog → eSignet consent flow opens for the Health client.
   **Demo video done (2026-10-22):** `docs/demo-video.mp4` (3:12, 1080x1920, silent). Pipeline in
   `tools/video/` (Ghostscript title cards, scrcpy `--time-limit` segments driven by
   `tools/demo_driver.js`, ffmpeg concat). Consent "Allow" must be a real tap (custom-scheme
   redirects ignore synthetic clicks). A voice-over can be added later; the cards carry the narration.
2. Push `feature/ps03-native-sso` of both repos to the forks and open the upstream PRs
   (`docs/pr-thunderid.md`, `docs/pr-esignet.md`). ThunderID PR needs the rebased branch; eSignet PR
   builds only with the companion change (state it in the PR).
3. Pitch deck in `docs/` (generated from this workspace) — keep the PS task table and the security
   properties slide in sync with `README.md`.
4. Follow-ups worth mentioning, not required: device-secret revocation on super-app sign-out,
   single-use `jti` tracking, a consent-screen line item for `device_sso`.

## 5. Community bug-fix PRs (shortlisting)

- Issue #2590 (`keycloak-init` scope) — claimed by Anurag Thakur (`DevAnuragT`).
- Issue #2555 (unrecognised consent purposeName) — fix + tests on `fix/2555-unrecognised-consent-purposename` (rebased on `develop-go`), ready for PR.
- Issue #2556 (declining a mandatory claim reported as system error) — root cause known, fix pending.
- Issue #2570 (oidc-ui numeric inputmode) — fix pending.

## 6. Conventions

- Commits: `git commit -s` (DCO, `Signed-off-by: Anurag Thakur <anuragthakur2102@gmail.com>`),
  **no Co-Authored-By or "generated with" attribution anywhere** (commits, PR texts, docs),
  MPL-2.0 headers in eSignet Go files.
- Keep the ThunderID branches in sync; run the e2e script after any backend change; rebuild +
  reinstall both APKs after SDK changes.
