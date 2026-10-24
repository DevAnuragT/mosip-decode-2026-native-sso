# Recording a human voice-over

The video is ten pieces: seven title cards (`n0`–`n6`) and three phone segments (`s1`–`s3`). Each
piece has its own audio file; a card lasts as long as its narration, a phone segment lasts at least
the length of the recording. Record one clip per piece (Voice Memos on the phone, QuickTime, or any
recorder), export as `.m4a`, `.wav` or `.mp3`, and name the files exactly as below. Put them next to
the title-card PNGs and the raw recordings (the working directory of `assemble2.sh`); a human file
is picked over the text-to-speech `.aiff` automatically.

| File | Piece | Text to read (edit freely, keep the length close) | Aim |
|---|---|---|---|
| `n0` | Title card | MOSIP Decode 2026, problem statement three: native single sign-on in eSignet Go for mobile apps. One login, every app. | ≤ 10 s |
| `n1` | The problem | Native apps do not share cookies, so every app from the same vendor repeats the full login: UIN, OTP, captcha and consent. Web single sign-on does not exist on a phone, and a shared session would not be bound to the device. | ≤ 15 s |
| `n2` | Super app | First, the super app, Vendor Wallet, signs in with pushed authorization, PKCE, DPoP with a hardware key, and the new device_sso scope. eSignet returns an access token, an ID token carrying ds_hash and sid, and a device secret: a signed, then encrypted token that only eSignet can read. | ≤ 20 s |
| `s1` | Phone: Wallet login (70 s of video) | This is Vendor Wallet, the super app, signed out. The details card shows the client id, the eSignet URL and the thumbprint of Key A, a hardware key in the Android Keystore. Tapping Sign in with eSignet opens the login in a Custom Tab: OTP, the UIN, the test captcha passes by itself, the one-time password. On the consent screen we keep the essential claim and leave the voluntary ones off, then Allow. Back in the Wallet: signed in, device secret stored. The details show the session id, the ds_hash from the ID token and the SHA-256 of the stored device secret; they match, so the ID token is bound to this device secret. The secret itself is encrypted and opaque to the app. | ≤ 65 s |
| `n3` | Child app | Second, the child app, Vendor Health. It asks the Wallet over a signature-protected IPC for the ID token, the device secret and a DPoP proof, then performs an RFC 8693 token exchange. eSignet checks the hash binding, the session id, the subject, the key thumbprint and the vendor family, and returns an access token in about two hundred milliseconds. | ≤ 24 s |
| `s2` | Phone: Health silent sign-in (30 s) | Now Vendor Health, the child app. Nothing is stored here and there is no browser session. One tap on Sign in. Within a fraction of a second the app is signed in silently and the profile shows the user's name. In the details: the token type is DPoP, the actor claim names the Wallet, and the bound key is the Wallet's Key A. Vendor Health never had a key of its own, and no device secret came back on the exchange. | ≤ 30 s |
| `n4` | Re-consent | Third, re-consent. When Vendor Health asks for a claim the Wallet never received, eSignet refuses the silent path. The app explains why and opens the normal eSignet consent flow for its own client, so silent sign-in never widens what the user agreed to. | ≤ 16 s |
| `s3` | Phone: re-consent (64 s) | We sign out of Vendor Health and ask for extra claims, the phone number, which the Wallet was never granted. eSignet refuses the silent path; the app explains and offers to continue in the browser. There the normal eSignet flow runs for Vendor Health itself: OTP login, then a consent screen that lists the phone number. We approve it, and Vendor Health is signed in with its own consent. | ≤ 60 s |
| `n6` | Backend proof | Every binding is tested against the live stack: the hash binding, the session id, key binding, scope escalation, device_sso on exchange, vendor isolation, a wrong DPoP key, a tampered secret, and interaction required for an unconsented claim. Thirty-five checks pass, plus Go and Kotlin unit tests. | ≤ 20 s |
| `n5` | Closing | Everything in the problem statement is implemented, plus the bonus: the ThunderID engine changes, the eSignet provider with encrypted secrets and consent derivation, an Android SDK with two apps, a Postman collection, automated end-to-end checks and full documentation. Thank you. | ≤ 18 s |

Then, in that working directory:

```bash
./cards_encode.sh                                   # re-encodes the seven cards with the new audio
./assemble2.sh raw1.mp4 raw2.mp4 raw3.mp4 ../../docs/demo-video.mp4
```

Keep the total under five minutes (the cards grow with the narration; the phone segments do not
shrink below 70 / 30 / 64 s). Tips: record in a quiet room, phone 20 cm from the mouth, one take per
piece, trim silence at the start and end. If the macOS premium voices are installed instead
(System Settings → Accessibility → Spoken Content → System Voice → Manage Voices, download
"Ava (Premium)" or "Zoe (Premium)"), regenerate the synthetic narration with
`VOICE="Ava (Premium)" python3 narration.py && VOICE="Ava (Premium)" python3 narration_phone.py`.
