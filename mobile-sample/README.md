# Native SSO reference apps for MOSIP eSignet (Go)

Two Android apps of one vendor demonstrate **OpenID Connect Native SSO for Mobile Apps 1.0** on
eSignet (Go) with the ThunderID engine:

| App | Package | Role |
|---|---|---|
| **Vendor Wallet** (`super-app/`) | `org.mosip.superapp` | Signs in with eSignet (PAR + PKCE + DPoP, OTP, consent) asking for `device_sso`, stores the `id_token` + `device_secret`, and serves them to sibling apps over a signature-protected IPC together with DPoP proofs signed by its hardware key (Key A). |
| **Vendor Health** (`child-app/`) | `org.mosip.childapp` | Signs in **silently**: fetches the credentials from the Wallet and performs an RFC 8693 token exchange. Falls back to an interactive re-consent when eSignet answers `interaction_required` (bonus task) or `invalid_scope`. |
| `nativesso-sdk/` | library | PAR/PKCE/DPoP/token-exchange client, Key A in the Android Keystore, PS256 `private_key_jwt`, encrypted session store, the IPC contract. Reusable by any eSignet relying party. |

Both apps are signed with the same certificate (`keystore/mosip-demo.jks`); that is what lets the
child hold the Wallet's `signature`-level permission (Native SSO prerequisite 1).

## How the two flows work

```
Wallet                               eSignet (Go + ThunderID)                 Health
  | PAR (scope … device_sso, dpop_jkt=Key A) |                                   |
  | authorize in a Custom Tab → OTP, consent |                                   |
  | token (code, DPoP by Key A) -----------> | issues access_token, id_token      |
  |            <---------------------------- |   (ds_hash, sid), device_secret    |
  | store id_token + device_secret (encrypted)                                   |
  |                                          |          GET_SSO_CREDENTIALS (IPC)  |
  | verify caller certificate; sign DPoP proof for POST /oauth2/token with Key A  |
  |  ------------------------------------------------------------------------>   |
  |                                          | <-- token exchange: subject=id_token, actor=device_secret, DPoP
  |                                          | checks ds_hash, sid, cnf.jkt, sub, vendor family, scope ⊆ grant, consent
  |                                          | --> access_token (cnf.jkt=Key A, act.sub=Wallet)
  |                                          | <-- userinfo (DPoP proof from the Wallet)
```

Key A never leaves the Wallet: the child never signs anything itself, it asks the Wallet for each
DPoP proof (`NativeSsoContract.signDpop`). That keeps every token in the family bound to one
hardware key, as the specification's sequence diagram requires ("Super App signs for child apps").

## Run it

Prerequisites: Android SDK (platform 35), JDK 17, a device or emulator, and the local eSignet stack
from `repos/esignet-go` (PostgreSQL + mock identity system via Docker Compose, eSignet from source,
the OIDC UI container). See the repository `README.md` for the stack.

```bash
# 1. Keys + client registration (super app, child app, a rogue other-vendor client)
python3 scripts/register_clients.py --esignet http://localhost:8088

# 2. Build (JDK 17)
./gradlew assembleDebug            # set JAVA_HOME to a JDK 17 if it is not the default

# 3. Let the phone reach the laptop as "localhost" (repeat after every USB reconnect)
adb reverse tcp:8088 tcp:8088
adb reverse tcp:3000 tcp:3000

# 4. Install
adb install -r super-app/build/outputs/apk/debug/super-app-debug.apk
adb install -r child-app/build/outputs/apk/debug/child-app-debug.apk
```

To point the apps at another eSignet (for example your laptop's LAN address or a sandbox), build
with `-PesignetBaseUrl=https://host:port`.

Demo script:

1. Open **Vendor Wallet** → *Sign in with eSignet* → OTP login (UIN `1774231323`, the Turnstile
   test captcha passes by itself, OTP `111111`) → review consent → *Allow*. The Wallet shows your claims and the Native
   SSO details: `sid`, `ds_hash`, the SHA-256 of the stored device secret, and the binding check.
2. Open **Vendor Health** → *Sign in*. No browser, no OTP, no consent: the status chip shows
   "Signed in silently in N ms", the profile shows the consented claims, and the details show
   `act.sub = mosip-super-app` and `cnf.jkt` equal to the Wallet's Key A.
3. In Vendor Health, *Sign out* → *Sign in with extra claims (phone)*. The Wallet was never granted
   `phone`, so eSignet refuses the silent path; the app explains why and opens the eSignet consent
   flow for its own client (bonus task).

## Security properties shown by the apps

- `android:protectionLevel="signature"` permission on the Wallet's ContentProvider, plus an
  explicit `PackageManager.checkSignatures` on every call: a third-party app cannot even ask.
- Key A is an EC P-256 key in the Android Keystore (`KeystoreDpopSigner`); only proofs leave the
  Wallet. The exchanged access token's `cnf.jkt` is the Wallet's key.
- `id_token` and `device_secret` live in `EncryptedSharedPreferences`; the device secret is itself
  an encrypted JWE the apps cannot read.
- The child never requests `device_sso`, and never receives one.
- Cleartext HTTP is allowed only for this local demo (`network_security_config.xml`); production
  builds must use HTTPS.

## Layout

```
mobile-sample/
  nativesso-sdk/        Codec, DpopSigner (Keystore Key A), ClientKey (PS256 assertions), EsignetClient,
                        SessionStore, NativeSsoContract (IPC + RemoteDpopSigner)
  super-app/            MainActivity, AuthRepository, NativeSsoProvider (ContentProvider)
  child-app/            MainActivity, ChildAuthRepository (silent sign-in + re-consent fallback)
  scripts/register_clients.py   key generation + client registration + clients.json
  keystore/mosip-demo.jks       the shared vendor signing certificate (demo only)
```
