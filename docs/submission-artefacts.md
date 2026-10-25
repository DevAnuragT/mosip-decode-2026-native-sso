# Submission artefacts — where each requirement is met

Maps the MOSIP Decode 2026 requirements (submission guidelines, evaluation criteria and the PS03
problem statement) to the files in this repository and the accompanying cloud folder.

Scoring (medium-complexity problem statement): functionality 40 %, deliverable quality 40 %
(code quality, documentation, scalability, reusability, maintainability), user experience 10 %,
presentation 10 %.

## A. Submission package

| # | Requirement | Where |
|---|---|---|
| A1 | Source code on a public git host, organised and commented, with everything needed to run | this repository; the backend branches are fetched by `scripts/fetch-backends.sh`; `deploy/docker-compose.yml` builds and runs the complete stack |
| A2 | Other artefacts in a cloud folder (deck, video, documents, college IDs) | the shared folder linked in the submission email; it holds copies of `docs/` |
| A3 | Submission email with team name, problem statement and links | sent to the organisers |
| A4 | Links accessible to the evaluators | public repository; folder shared as viewer |
| A5 | 1–2 page overview or 5–7 slide pitch | `docs/solution-overview.md` (2 pages) and `docs/pitch-deck.pptx` (13 slides) |
| A6 | College or university ID per student | cloud folder |
| A7 | Original work, OSI-licensed dependencies, contributable to MOSIP | all code original (MPL-2.0 for the upstream Go code, see `LICENSE` for this repository); dependencies Apache-2.0, MIT or MPL-2.0; both upstream branches DCO signed-off |

## B. Mandatory and scored artefacts (* = mandatory)

| # | Artefact | Where |
|---|---|---|
| B1* | Source code | this repository plus the two backend feature branches |
| B2* | Working prototype | the compose stack, the two Android apps, `tests/native_sso_e2e.py` |
| B3* | Pitch deck | `docs/pitch-deck.pptx` (generator in `tools/deck/`) |
| B4* | Demo video, 2–5 min, problem → solution → key characteristics | `docs/demo-video.mp4` (4:56); script in `docs/demo-video-script.md` |
| B5 | Mockups, wireframes, user flows | `docs/mockups-and-flows.md`, `docs/images/` |
| B6 | Architecture diagram | `docs/images/architecture.svg`, design document §2, deck slide 4 |
| B7 | Test data | `docs/test-cases-and-results.md` § Test data |
| B8 | Test cases and results | `docs/test-cases-and-results.md`, `tests/results/native_sso_e2e.json` |
| B9* | Usage and installation instructions | `README.md`, `CONTRIBUTING.md`, `mobile-sample/README.md`, `ui-theme/README.md`, `docs/esignet.env.example` |
| B10* | API documentation | `docs/api-documentation.md`; upstream `docs/native-sso.md` and the OpenAPI update on the eSignet branch |
| B11* | Git history | commit history of this repository and of both feature branches |
| B12* | College credentials | cloud folder |

## C. Problem-statement tasks (PS03)

| # | Item | Evidence |
|---|---|---|
| P1 | Two native apps signed with one certificate | `mobile-sample/keystore/mosip-demo.jks`, both apps |
| P2 | "Sign in with eSignet" in the first app per the relying-party guide (PAR, PKCE, DPoP, `private_key_jwt`) | `nativesso-sdk/EsignetClient.kt` |
| T1 | `device_sso` scope | eSignet `deployment.yaml`, ThunderID protocol scope |
| T2 | Token endpoint validates that the client is allowed `device_sso` | ThunderID authorization-code grant, eSignet provider |
| T3 | `DeviceSecretProvider` interface in ThunderID | `providers/interface.go` |
| T4 | Generate (signed JWT with `cnf.jkt`, `auth_id`, `exp`, `client_id`, `scope`, `acr`, `claims`, `iss`) and validate in eSignet; secret bound to the ID token | `device_secret_provider.go`; `ds_hash` + `sid` on the ID token |
| T5 | Token endpoint invokes generation | `authorization_code.go` |
| T6 | Response: `access_token`, `id_token`, `device_secret` | JWE device secret; e2e S1–S4 |
| T7 | Child app obtains `id_token` + `device_secret` + DPoP proof over app-to-app IPC | `NativeSsoProvider` (ContentProvider, signature permission) |
| T8 | Child calls token exchange, DPoP signed by the first app's key, no `device_sso` | `exchangeDeviceSecret`; e2e C1–C8 |
| T9 | Exchange grant: device-secret actor, provider validation, `ds_hash`, `sid`, client enablement, `cnf.jkt` | `token_exchange.go`; e2e N1–N12 |
| T10a/b | Child scope ⊆ super-app scope; `device_sso` refused on exchange | e2e N1, N2 |
| Bonus | Re-consent in the second app when consent differs | `interaction_required`, child fallback; e2e B1; on-device walkthrough |
| D1 | Native apps demonstrating the complete flow | Vendor Wallet + Vendor Health |
| D2 | Updated Postman collection | `postman/` and the collection on the eSignet branch |
| D3 | API documentation and design document | `docs/api-documentation.md`, `docs/design-document.md` |
| D4 | Presentation | `docs/pitch-deck.pptx` |
| D5 | End-to-end demo video | `docs/demo-video.mp4` |
