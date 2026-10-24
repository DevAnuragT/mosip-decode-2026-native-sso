# Submission checklist — MOSIP Decode 2026, PS03 Native SSO

Sources: PS03 PDF (`03_Enable_Native_SSO_in_eSignet_Go_for_Mobile_Apps.pdf`), MOSIP "Submission
guidelines" and "Evaluation criteria" PDFs, Unstop listing (rules, rounds). Reviewed 2026-10-22.

**Deadline: Sunday 26 Oct 2026, 23:59 IST** (Unstop "Submission" round; last submission counts).
Evaluation 2–6 Nov 2026. Scoring: functionality 40 %, deliverable quality 40 %, UX 10 %,
presentation 10 % (medium-complexity PS).

## A. How and where to submit

| # | Requirement | Status | Where |
|---|---|---|---|
| A1 | Source code on GitHub/GitLab/Bitbucket, well organised and commented, with everything needed to run | **push pending** | this repo (`master`) + the two feature branches in the forks (`scripts/fetch-backends.sh` pulls them; `deploy/` builds the stack); see §D |
| A2 | Other mandatory artefacts in a cloud folder (e.g. Google Drive): deck, video, docs, college IDs | **to assemble** | `docs/` has every file; the folder must be created and shared with "anyone with the link" |
| A3 | Email to `decode@mosip.io` with Team Name, Problem Statement, URLs | **draft ready** | `docs/submission-email.md` |
| A4 | All links accessible with the necessary permissions | **check before sending** | repo public (or MOSIP granted access), Drive link set to viewer |
| A5 | 1–2 page overview document or 5–7 slide pitch (Unstop rule) | done (fill in the team line) | `docs/solution-overview.md` (2 pages) + `docs/pitch-deck.pptx` |
| A6 | College/university ID per student | **user** | upload to the Drive folder |
| A7 | Originality, OSI-licensed dependencies, IP contributable to MOSIP | done | all code original; deps Apache/MIT/MPL; both upstream branches DCO signed-off |

## B. Mandatory artefacts (submission guidelines, * = mandatory)

| # | Artefact | Status | Where |
|---|---|---|---|
| B1* | Source code | done | this repo, `repos/thunderid` and `repos/esignet-go` feature branches |
| B2* | Working prototype / demo | done | local stack + two Android apps installed and verified on device |
| B3* | Pitch presentation / slide deck | done (needs a visual pass in PowerPoint) | `docs/pitch-deck.pptx` |
| B4* | Video demo, 2–5 min, problem → solution → key characteristics | done (4:43, narrated with the Ava Premium voice, title cards + live phone capture incl. the completed re-consent) | `docs/demo-video.mp4` (pipeline: `tools/video/`, driver: `tools/demo_driver.js`) |
| B5 | Design mockups, wireframes, user-flow diagrams | done | `docs/mockups-and-flows.md` + `docs/images/` |
| B6 | Architecture diagram | done | `docs/images/architecture.svg`, deck slide 4, design doc §2 |
| B7 | Test data | done | `docs/test-cases-and-results.md` §Test data |
| B8 | Test cases and results | done | `docs/test-cases-and-results.md`, `tests/results/native_sso_e2e.json` (tracked) |
| B9* | Usage and installation instructions | done | `README.md` "Verify it in ten minutes" (compose stack), `mobile-sample/README.md`, `ui-theme/README.md`, `docs/esignet.env.example` |
| B10* | API documentation | done | `docs/api-documentation.md` (standalone), `repos/esignet-go/docs/native-sso.md` §6, OpenAPI `/oauth2/token` |
| B11* | Git repository with version-control history | done locally | commits per feature in all three repos; push pending (§D) |
| B12* | College/university credentials | **user** | Drive folder |

## C. Problem-statement deliverables and tasks (PS03)

| # | PS item | Status | Evidence |
|---|---|---|---|
| P1 | Two native apps signed with one certificate | done | `mobile-sample/keystore/mosip-demo.jks`, both apps |
| P2 | "Sign in with eSignet" in the first app per the RP integration guide (PAR, PKCE, DPoP, private_key_jwt) | done | `nativesso-sdk/EsignetClient.kt` |
| T1 | `device_sso` scope | done | eSignet `deployment.yaml`, ThunderID protocol scope |
| T2 | Token endpoint validates `allowed_authorization_scopes` has `device_sso` | done | ThunderID auth-code grant + eSignet provider |
| T3 | DeviceSecretProvider interface in ThunderID | done | `providers/interface.go` |
| T4 | Generate (signed JWT with cnf.jkt, auth_id, exp, client_id, scope, acr, claims, iss) / Validate in eSignet; secret bound to the id_token | done | `device_secret_provider.go`; binding via `ds_hash` + `sid` on the id_token (spec §4.2 and the PS sequence diagram) |
| T5 | Token endpoint invokes generation | done | `authorization_code.go` |
| T6 | Response: access_token, id_token, device_secret (signed-then-encrypted) | done | JWE device secret; e2e S1–S4 |
| T7 | Child app gets id_token + device_secret + DPoP proof via app-to-app IPC | done | `NativeSsoProvider` (ContentProvider, signature permission) |
| T8 | Child calls token exchange, DPoP signed by the first app's key, no `device_sso` | done | `exchangeDeviceSecret`; e2e C1–C7 |
| T9 | Exchange grant: device-secret actor, provider validation, ds_hash, sid, client enablement, cnf.jkt | done | `token_exchange.go`; e2e N1–N6 |
| T10a/b | Scope ⊆ grant; `device_sso` refused on exchange | done | e2e N1, N2 |
| Bonus | Re-consent in the second app when scopes/consent differ | done | `interaction_required`, child fallback; e2e B1; verified on device |
| D1 | Native apps demonstrating the complete flow in a UI | done | Wallet + Health, verified on OnePlus |
| D2 | Updated Postman collection | done | `postman/` (collection + env generator) |
| D3 | API documentation + design document (MOSIP design + RFC behaviour) | done | `docs/api-documentation.md`, `docs/design-document.md` |
| D4 | PPT | done | `docs/pitch-deck.pptx` |
| D5 | Demo video end to end | done | `docs/demo-video.mp4` |

## D. Actions that need the account owner

1. Create the ThunderID fork (`gh repo fork thunder-id/thunderid --clone=false`); the eSignet fork exists.
2. Push `feature/ps03-native-sso` **and** `feature/ps03-native-sso-pre-rebase` of `repos/thunderid` and
   `feature/ps03-native-sso` of `repos/esignet-go` to the forks; then point eSignet's `go.mod` replace at
   the pushed ThunderID pseudo-version (so the branch builds outside this laptop) and push again; open the
   PRs with `docs/pr-thunderid.md` and `docs/pr-esignet.md`.
3. Push the submission repo to GitHub (public), e.g. `gh repo create mosip-decode-2026-native-sso --public --source . --push`,
   then test `scripts/fetch-backends.sh` + `deploy/docker-compose.yml` from a fresh clone.
4. Create the Drive folder: deck, video, `docs/*.md` (or a PDF export), college IDs; share as viewer.
5. Send the email (`docs/submission-email.md`).
