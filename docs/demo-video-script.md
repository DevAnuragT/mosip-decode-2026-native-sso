# Demo video script (target 3–4 minutes)

Record the phone with `scrcpy --record demo.mp4` (or Android's built-in screen recorder) and the
laptop terminal side by side. Keep the phone connected over USB with `adb reverse tcp:8088 tcp:8088`
and `adb reverse tcp:3000 tcp:3000` active.

## Narration (as recorded in `docs/demo-video.mp4`, macOS text-to-speech; re-record with a human voice if preferred)

| Section | Text |
|---|---|
| Title | MOSIP Decode 2026, problem statement three: native single sign-on in eSignet Go for mobile apps. One login, every app. |
| 1 The problem | Native apps do not share cookies, so every app from the same vendor repeats the full login: UIN, OTP, captcha and consent. Web single sign-on does not exist on a phone, and a shared session would not be bound to the device. |
| 2 Super app | First, the super app, Vendor Wallet, signs in with pushed authorization, PKCE, DPoP with a hardware key, and the new `device_sso` scope. eSignet returns an access token, an ID token carrying `ds_hash` and `sid`, and a device secret: a signed, then encrypted token that only eSignet can read. |
| Phone: Wallet login | Vendor Wallet signed out; Key A thumbprint; OTP login in a Custom Tab; consent with voluntary claims off; signed in, device secret stored; `sid`, `ds_hash` and the SHA-256 of the stored secret match. |
| 3 Child app | Second, the child app, Vendor Health. It asks the Wallet over a signature-protected IPC for the ID token, the device secret and a DPoP proof. Then it performs an RFC 8693 token exchange. eSignet checks the hash binding, the session id, the subject, the key thumbprint and the vendor family, and returns an access token in about two hundred milliseconds. |
| Phone: Health silent sign-in | One tap; signed in silently; `act.sub` = Wallet; bound key = Wallet's Key A; no device secret on the exchange. |
| 4 Re-consent | Third, re-consent. When Vendor Health asks for a claim the Wallet never received, eSignet refuses the silent path. The app explains why and opens the normal eSignet consent flow for its own client, so silent sign-in never widens what the user agreed to. |
| Phone: re-consent | Sign out, extra claims (phone), dialog, Continue, OTP login for Vendor Health, consent listing the phone number, Allow, signed in with its own consent. |
| Backend proof | Every binding is tested against the live stack (35/35), plus Go and Kotlin unit tests. |
| Closing | Everything in the problem statement is implemented, plus the bonus. |

The original shot list follows; `tools/video/README.md` has the pipeline.

## 0:00 – 0:25 · The problem (slide or voice-over)

"Native apps don't share cookies. A citizen with a national wallet app, a health app and a tax app
from the same vendor logs in three times. We implemented OpenID Connect Native SSO in eSignet (Go)
and the ThunderID engine so that one login is reused, silently and safely."

## 0:25 – 1:30 · Super app login (phone)

1. Open **Vendor Wallet**. Point at the status card ("Signed out") and the Key A thumbprint:
   "Key A is a hardware key in the Android Keystore. Everything that follows is bound to it."
2. Tap **Sign in with eSignet**. The eSignet login opens in a Custom Tab for "Vendor Wallet
   (super app)". Choose **Login with OTP**, enter UIN `1774231323`, tick the captcha, **Get OTP**,
   enter `111111`.
3. On the consent screen untick **picture**, keep name/email, tap **Allow**. "We deliberately leave
   one claim out; it matters later."
4. Back in the Wallet: "Signed in · device secret stored". Scroll to *Native SSO details*: read out
   `sid`, `ds_hash` in the id_token, the SHA-256 of the stored device secret and the "✓ bound"
   line. "The token endpoint returned a device secret because we asked for the device_sso scope.
   It is an encrypted JWT the app cannot read."

## 1:30 – 2:15 · Child app silent sign-in (phone)

5. Open **Vendor Health**. "Nothing stored here, no browser session." Tap **Sign in**.
6. Within a second: "Signed in silently in N ms", the profile shows the user's name and email.
   Scroll to the details: `act.sub = mosip-super-app` ("the token says who vouched for it"),
   `cnf.jkt` equal to the Wallet's Key A ("the child never had a key; the Wallet signed its DPoP
   proof over a signature-protected IPC").

## 2:15 – 2:50 · Re-consent (bonus) (phone)

7. In Vendor Health tap **Sign out**, then **Sign in with extra claims (phone)**. A dialog explains
   that eSignet refused the silent path (`invalid_scope`: phone was never granted to the Wallet).
   Tap **Continue**: the eSignet consent flow opens for Vendor Health itself. "Silent sign-in never
   widens what the user consented to."

## 2:50 – 3:30 · Backend proof (laptop)

8. Run `python3 tests/native_sso_e2e.py` and show the 35/35 green lines: ds_hash binding, sid,
   key binding, scope escalation rejected, device_sso rejected on exchange, vendor isolation, wrong
   DPoP key, tampered secret, interaction_required for the unconsented claim.
9. Show `go test` summaries of ThunderID and eSignet.

## 3:30 – 3:50 · Where the code lives (slide)

"Two upstream pull requests: the engine changes in thunder-id/thunderid, the provider, consent and
client-management changes in mosip/esignet develop-go. The Android SDK and apps show relying parties
exactly what to build."
