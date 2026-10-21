# Postman collection — Native SSO on eSignet (Go)

- `mosip_esignet_native_sso.postman_collection.json` — 20 requests in 4 folders: discovery, the super
  app login with `device_sso` (PAR → login flow → consent → token), the child app's silent sign-in
  (token exchange, userinfo, reuse) and the security/consent checks (scope escalation, `device_sso` on
  exchange, vendor isolation, wrong DPoP key, tampered secret, `interaction_required`).
- `mosip_esignet_native_sso_local.postman_environment.json` — local environment with the demo
  clients and their private keys (generated; not committed). Regenerate both files with
  `python3 postman/build_collection.py` after `python3 mobile-sample/scripts/register_clients.py`.

Run in the **Postman desktop app** (v11+): the pre-request scripts use WebCrypto and top-level
`await` to mint PKCE, the DPoP key ("Key A") and PS256 `private_key_jwt` assertions, exactly like the
upstream eSignet collection they extend. `newman` does not support those scripts; for a scripted run
use `tests/native_sso_e2e.py`, which performs the same requests with assertions.
