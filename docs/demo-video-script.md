# Demo video script (target 3–4 minutes)

Record the phone with `scrcpy --record demo.mp4` (or Android's built-in screen recorder) and the
laptop terminal side by side. Keep the phone connected over USB with `adb reverse tcp:8088 tcp:8088`
and `adb reverse tcp:3000 tcp:3000` active.

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

8. Run `python3 tests/native_sso_e2e.py` and show the 26/26 green lines: ds_hash binding, sid,
   key binding, scope escalation rejected, device_sso rejected on exchange, vendor isolation, wrong
   DPoP key, tampered secret, interaction_required for the unconsented claim.
9. Show `go test` summaries of ThunderID and eSignet.

## 3:30 – 3:50 · Where the code lives (slide)

"Two upstream pull requests: the engine changes in thunder-id/thunderid, the provider, consent and
client-management changes in mosip/esignet develop-go. The Android SDK and apps show relying parties
exactly what to build."
