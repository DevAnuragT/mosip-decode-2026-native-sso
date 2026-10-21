# MOSIP Decode 2026 - Agent Execution & Development Guide

**Problem Statement 03:** `eSignet | Enable Native SSO in eSignet Go for Mobile Apps`  
**Tracking File:** `AGENTS.md` (Internal engineering log & progress tracker)

---

## 1. Current State & Completed Implementation

### A. ThunderID Backend Core (`repos/thunderid/backend`)
- **Constants & Models (`constants/`, `model/`, `tokenservice/`)**:
  - `TokenTypeIdentifierDeviceSecret = "urn:openid:params:token-type:device-secret"`.
  - `ScopeDeviceSSO = "device_sso"`.
  - `DeviceSecret` string added to `TokenResponse` & `TokenResponseDTO`.
  - `DSHash` binding claim added to `IDTokenBuildContext` and `SubjectTokenClaims`.
- **Provider Interface (`pkg/thunderidengine/providers/`)**:
  - `DeviceSecretProvider` interface with `GenerateDeviceSecret` and `ValidateDeviceSecret`.
  - Added `WithDeviceSecretProvider` option in `engine.go`.
- **Grant Handlers (`internal/oauth/oauth2/granthandlers/`)**:
  - `authorization_code.go`: Issues `device_secret` when `scope=device_sso` is requested; computes `ds_hash = BASE64URL(SHA-256(device_secret))` and embeds it in `id_token`.
  - `token_exchange.go`: Handles `actor_token_type=urn:openid:params:token-type:device-secret`. Validates signature, verifies `ds_hash`, matches `cnf.jkt` with DPoP thumbprint (`Key A`), enforces subject match.
  - **Task 10.a Scope Downscoping**: Checks that child app scopes $\subseteq$ super app original scopes (excess scopes fail with `invalid_scope`).
  - **Task 10.b Scope Exclusion**: Rejects any token exchange request containing `device_sso` (`invalid_scope`).
- **Tests**: Full test coverage in `token_exchange_test.go` and `authorization_code_test.go`. All tests pass.

### B. MOSIP eSignet Go Service (`repos/esignet-go/esignet-service`)
- **`internal/engine/device_secret_provider.go`**:
  - Signs Device Secret compact JWS with eSignet's KeyManager/Signature service (`signature.Service.JWSSign`).
  - Validates signature (`signature.Service.JWSVerify`), checks expiration, and enforces Relying Party / Vendor family isolation (`childClient.RpID == superClient.RpID` or `allowed_child_clients`).
- **`cmd/esignet/main.go`**: Wired via `thunderidengine.WithDeviceSecretProvider(engine.NewDeviceSecretProvider(appCfg, clientSvc, sigSvc))`.
- **`internal/engine/device_secret_provider_test.go`**: Unit tests covering generation, verification, vendor isolation, expired tokens, and tampered signatures. All pass.

### C. Deliverables Ready in Workspace
1. **Postman Collection**: `postman/mosip_esignet_native_sso.postman_collection.json` (8 automated test requests).
2. **Mobile Architecture Sample**: `mobile-sample/` (Super App with KeyStoreManager Key A + signature ContentProvider; Child App with NativeSSOClient).

---

## 2. Verification Commands

```bash
# ThunderID backend tests
cd "repos/thunderid/backend"
go test -v -run "TestTokenExchangeGrantHandlerSuite/TestHandleGrant_DeviceSecret|TestTokenExchangeGrantHandlerSuite/TestValidateGrant_Device" ./internal/oauth/oauth2/granthandlers/...

# eSignet Go tests
cd "../../repos/esignet-go/esignet-service"
go test -v -run "TestDeviceSecretProviderTestSuite" ./internal/engine/...

# Build check
go build ./cmd/esignet
```

---

## 3. MOSIP Open-Source Contribution Strategy (Shortlisting Acceleration)

MOSIP Decode 2026 organizers evaluate GitHub contributions to the MOSIP ecosystem to shortlist teams into Stage 2. To ensure maximum scoring and visibility:

### A. High-Impact Community Bug Fix PRs on `mosip/esignet`
1. **Issue #2590 (`keycloak-init never creates the get_oidc_client scope, so GET /client-mgmt/client/{client_id} is unusable`)**:
   - *Status*: Claimed by Anurag Thakur (`DevAnuragT`) via [Issue Comment #5645008375](https://github.com/mosip/esignet/issues/2590#issuecomment-5645008375).
   - *Root Cause*: `deploy/keycloak/keycloak-init-values.yaml` omits `get_oidc_client` from `client_scopes` and `mosip-pms-client.assign_client_scopes`, causing HTTP 403.
   - *Fix*: Declare `get_oidc_client` scope and assign it to `mosip-pms-client` in `keycloak-init-values.yaml`.
2. **Issue #2555 (`eSignet-Thunder: Bug — An unrecognised consent purposeName silently drops every approved claim`)**:
   - *Status*: Fix and unit tests completed locally on branch `fix/2555-unrecognised-consent-purposename`. Ready for PR.
   - *Root Cause*: In `internal/engine/consent_provider.go`, `RecordConsent()` ignores unrecognized purpose prefixes, silently dropping approved claims and returning a false success.
   - *Fix*: Validate `purposeName` prefixes (`attributes:` or `permissions:`). If unrecognized, return `clientError("consent_purpose_not_recognized", fmt.Errorf("The consent decisions purposeName is not recognised"))`.
3. **Issue #2556 (`eSignet-Thunder: Bug — Declining a mandatory claim is reported as a system error`)**:
   - *Root Cause*: `clientError("essential_consent_denied", nil)` returns `serviceError.Code = "essential_consent_denied"`. ThunderID's `consent_executor.go` expects `Code == "AUTH-CES-1006"`. Because it didn't match, it fell into the generic client error branch and returned `ErrConsentRecordFailed` (*"An error occurred while recording the user consent"*).
   - *Fix*: Ensure the error code aligns with ThunderID's `ErrorEssentialConsentDenied` contract, and properly populate localized descriptions.
4. **Issue #2570 (`oidc-ui: UIN/VID login field numeric inputmode`)**:
   - *Root Cause*: `input#username_input` renders with `type="text"` and lacks `inputmode="numeric"`, opening an alphabetical keyboard on mobile devices for numeric IDs.
   - *Fix*: In `oidc-ui`, set `inputmode="numeric"` and `pattern="[0-9]*"` for the UIN/VID option.

### B. Upstream Feature Pull Requests (Problem Statement 03)
1. **PR to `thunder-id/thunderid`**:
   - RFC 8693 Token Exchange handler with `actor_token_type=device-secret`, DPoP Key A hardware binding, Task 10.a scope downscoping, and Task 10.b `device_sso` exclusion.
2. **PR to `mosip/esignet` (`develop-go`)**:
   - `DeviceSecretProvider` JWS compact token generation, `ds_hash` injection into `id_token`, verification, and vendor isolation.

### C. Contribution Requirements Checklist
- [x] Commits signed off with DCO (`git commit -s` with `Signed-off-by: Anurag Thakur <anuragthakur2102@gmail.com>`)
- [x] Targeted to upstream `develop-go` branch for `mosip/esignet`
- [x] Full unit test coverage and clean builds
- [x] Apache 2.0 / MPL 2.0 license headers preserved

