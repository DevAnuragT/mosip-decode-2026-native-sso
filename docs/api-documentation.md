# API documentation: Native SSO in eSignet (Go)

Reference for every interface the Native SSO feature adds or uses. Behaviour and rationale are in the
[design document](design-document.md); the runnable collection is in [`../postman/`](../postman/); the
tests that exercise each call are in [test cases and results](test-cases-and-results.md). Overview:
[solution overview](solution-overview.md).

Base URL in the local stack: `http://localhost:8088` (eSignet). Examples abbreviate JWTs with `eyJ...`.

| # | Interface | Section |
|---|---|---|
| 1 | Discovery | [1](#1-discovery) |
| 2 | Client registration | [2](#2-client-registration) |
| 3 | Pushed authorization request (PAR) | [3](#3-pushed-authorization-request) |
| 4 | Authorize | [4](#4-authorize) |
| 5 | Token: authorization code grant | [5](#5-token-endpoint-authorization-code-grant) |
| 6 | Token: token exchange grant | [6](#6-token-endpoint-token-exchange-grant) |
| 7 | Userinfo | [7](#7-userinfo) |
| 8 | Android IPC contract | [8](#8-android-ipc-contract) |
| 9 | ThunderID provider interfaces | [9](#9-thunderid-provider-interfaces) |
| 10 | Configuration | [10](#10-configuration) |

## 1. Discovery

`GET /.well-known/openid-configuration` (unchanged endpoint, two additions):

| Field | Addition |
|---|---|
| `grant_types_supported` | contains `urn:ietf:params:oauth:grant-type:token-exchange` |
| `scopes_supported` | contains `device_sso` |

## 2. Client registration

`POST /client-mgmt/client`, `Content-Type: application/json`. Native SSO adds the `token_exchange`
grant type and these `additionalConfig` keys:

| Field | Meaning |
|---|---|
| `grantTypes` | `["authorization_code"]` for a super app; `["authorization_code", "token_exchange"]` for a child app (the registration validator now accepts `token_exchange`) |
| `additionalConfig.allowed_authorization_scopes` | must contain `device_sso` for every app that issues or redeems a device secret |
| `additionalConfig.allowed_child_clients` | optional, on the super app: client ids of siblings that belong to a different relying party but may redeem its device secrets |
| `relyingPartyId` | apps with the same value form one vendor family |
| `publicKey` | JWK of the app's `private_key_jwt` key; include a `kid` (RFC 7638 thumbprint). The key signs PS256 assertions, so omit `alg`. |
| `additionalConfig.require_pushed_authorization_requests`, `dpop_bound_access_tokens`, `require_pkce` | `true` for the demo apps |

Example (child app, as sent by `mobile-sample/scripts/register_clients.py`):

```json
{
  "requestTime": "2026-10-21T12:00:00.000Z",
  "request": {
    "clientId": "mosip-child-app",
    "clientName": "Vendor Health (child app)",
    "clientNameLangMap": {"eng": "Vendor Health (child app)"},
    "relyingPartyId": "mosip-demo-vendor",
    "logoUri": "https://mosip.io/favicon.ico",
    "redirectUris": ["org.mosip.childapp://callback"],
    "userClaims": ["name", "email", "phone_number"],
    "authContextRefs": ["mosip:idp:acr:generated-code", "mosip:idp:acr:password", "mosip:idp:acr:static-code"],
    "publicKey": {"kty": "RSA", "n": "...", "e": "AQAB", "kid": "<RFC 7638 thumbprint>", "use": "sig"},
    "grantTypes": ["authorization_code", "token_exchange"],
    "clientAuthMethods": ["private_key_jwt"],
    "additionalConfig": {
      "require_pushed_authorization_requests": true,
      "dpop_bound_access_tokens": true,
      "require_pkce": true,
      "allowed_authorization_scopes": ["device_sso"]
    }
  }
}
```

The demo registers three clients: `mosip-super-app` and `mosip-child-app` (relying party
`mosip-demo-vendor`) and `other-vendor-app` (relying party `another-vendor`, used for the vendor
mismatch test).

## 3. Pushed authorization request

`POST /oauth2/par` (RFC 9126), `application/x-www-form-urlencoded`, client authentication by
`private_key_jwt`. Native SSO adds the `device_sso` scope and uses `dpop_jkt` to bind the code to Key A.

```
POST /oauth2/par
Content-Type: application/x-www-form-urlencoded

client_id=mosip-super-app
&response_type=code
&redirect_uri=org.mosip.superapp://callback
&scope=openid profile email device_sso
&state=<random>
&nonce=<random, echoed in the id_token>
&code_challenge=<BASE64URL(SHA-256(code_verifier))>
&code_challenge_method=S256
&dpop_jkt=<thumbprint of Key A>
&client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
&client_assertion=<PS256 private_key_jwt, aud = issuer>
```

Optional: `claims` (JSON, per the eSignet RP guide) and `prompt=consent` (used by the child app's
interactive fallback). Response (RFC 9126; `expires_in` follows the configured PAR validity, 3600 s by
default in eSignet Go):

```json
{"request_uri": "urn:ietf:params:oauth:request_uri:...", "expires_in": 3600}
```

A client that is not registered with `device_sso` in `allowed_authorization_scopes` cannot obtain the scope.

## 4. Authorize

```
GET /oauth2/authorize?client_id=mosip-super-app&request_uri=<request_uri from PAR>
```

Opened in a Custom Tab. The user logs in (OTP) and consents; eSignet redirects to
`org.mosip.superapp://callback?code=...`. A child app that falls back to interactive consent sends a
new PAR with `prompt=consent` for its own client.

## 5. Token endpoint: authorization code grant

```
POST /oauth2/token
Content-Type: application/x-www-form-urlencoded
DPoP: <proof signed by Key A for POST {token_endpoint}>

grant_type=authorization_code
&client_id=mosip-super-app
&code=<code>
&redirect_uri=org.mosip.superapp://callback
&code_verifier=<verifier>
&client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
&client_assertion=<PS256 private_key_jwt>
```

Response (when the authorized scope included `device_sso`):

```json
{
  "access_token": "eyJ...",
  "token_type": "DPoP",
  "expires_in": 120,
  "scope": "openid profile email device_sso",
  "id_token": "eyJ...",
  "device_secret": "eyJhbGciOiJSU0EtT0FFUC0yNTYi..."
}
```

| Item | Detail |
|---|---|
| `device_secret` | compact JWE (signed-then-encrypted JWT), opaque to the app; see [design §4](design-document.md#4-the-device-secret) for the signed claims |
| `access_token` | DPoP-bound: `cnf.jkt` = thumbprint of Key A |
| `id_token.ds_hash` | `BASE64URL(SHA-256(device_secret))` |
| `id_token.sid` | session id shared with the device secret (the authorization id when no SSO session store exists) |

Without `device_sso` the response has no `device_secret` and the ID token no `ds_hash` (tests P1, P2).

## 6. Token endpoint: token exchange grant

```
POST /oauth2/token
Content-Type: application/x-www-form-urlencoded
DPoP: <proof signed by Key A for POST {token_endpoint}>

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
&client_id=<child client>
&subject_token=<id_token of the super app>
&subject_token_type=urn:ietf:params:oauth:token-type:id_token
&actor_token=<device_secret>
&actor_token_type=urn:openid:params:token-type:device-secret
&scope=openid profile
&client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
&client_assertion=<PS256 private_key_jwt, aud = issuer>
```

| Parameter | Rule |
|---|---|
| `subject_token_type` | must be `urn:ietf:params:oauth:token-type:id_token` |
| `actor_token_type` | `urn:openid:params:token-type:device-secret` selects the Native SSO path |
| `scope` | must be a subset of the scope on the device secret; `device_sso` is rejected |
| `DPoP` header | proof key must equal the device secret's `cnf.jkt` (Key A) |

Success: an access token bound to Key A whose `act.sub` is the super app's client id. No `id_token`, never a `device_secret`.

```json
{"access_token": "eyJ...", "token_type": "DPoP", "expires_in": 120, "scope": "openid profile"}
```

Access token claims of interest: `sub` (same user as the super app), `cnf.jkt` (Key A), `act.sub` (`mosip-super-app`).

An ID token past its `exp` is accepted as subject token (signature, issuer, `nbf` and revocation are still checked); the device secret's own `exp` bounds the exchange ([design §8](design-document.md#8-security-notes-and-limits)).

### Errors

Standard OAuth error body: `{"error": "...", "error_description": "..."}`.

| Error | When |
|---|---|
| `invalid_request` | `subject_token_type` is not `id_token`, the subject token is not a self-issued ID token, or the actor/subject tokens are missing |
| `unauthorized_client` | the presenting client is not registered for `device_sso` |
| `invalid_grant` | device secret cannot be decrypted or verified, is expired or from a foreign issuer; vendor mismatch; `ds_hash`, `sid` or `sub` mismatch; DPoP key differs from `cnf.jkt` |
| `invalid_dpop_proof` | no DPoP proof although the secret is key-bound |
| `invalid_scope` | child scope exceeds the super app's grant, or `device_sso` was requested |
| `interaction_required` | the originating consent does not cover the request; the child app must run an interactive authorization with `prompt=consent` |

Example:

```json
{"error":"interaction_required","error_description":"The consent granted to the originating application does not cover this request; claims not consented: picture"}
```

## 7. Userinfo

```
GET /oauth2/userinfo
Authorization: DPoP <access_token>
DPoP: <proof signed by Key A: htm=GET, htu=<userinfo URL>, ath=BASE64URL(SHA-256(access_token))>
```

Returns the consented claims. For an exchanged token the claims come from the snapshot stored in the
device secret, restricted to what the user accepted. A child app has no key: it obtains each proof
from the Wallet through `SIGN_DPOP` (next section).

## 8. Android IPC contract

Defined in `mobile-sample/nativesso-sdk/src/main/java/org/mosip/nativesso/NativeSsoContract.kt`. The
Wallet exports a `ContentProvider`; callers use `ContentResolver.call`.

| Item | Value |
|---|---|
| Authority | `org.mosip.superapp.sso` (URI `content://org.mosip.superapp.sso`) |
| Permission | `org.mosip.superapp.permission.NATIVE_SSO` (`signature` protection level; the Wallet also re-checks the caller's signing certificate) |

### Methods

| Method | Purpose | Input extras | Result extras |
|---|---|---|---|
| `GET_SSO_CREDENTIALS` | credentials for one token exchange | `htm` (`POST`), `htu` (token endpoint URL) | `id_token`, `device_secret`, `dpop_proof` (signed by Key A for `htm htu`), `dpop_jkt`, `subject` |
| `SIGN_DPOP` | DPoP proof for any later request | `htm`, `htu`, optional `access_token` (adds `ath`) | `dpop_proof` |

### Errors

Reported in the result bundle under the `error` extra.

| Code | Meaning |
|---|---|
| `NO_ACTIVE_SESSION` | the Wallet holds no `id_token` / `device_secret` (user not signed in) |
| `CALLER_SIGNATURE_MISMATCH` | the caller is not signed with the vendor certificate |

If the Wallet is not installed or does not answer, `call` returns `null`; the SDK throws `IllegalStateException`. A missing result extra raises `SuperAppException("missing <extra>")`.

SDK entry points: `NativeSsoContract.fetchCredentials(context, tokenEndpoint)`, `signDpop(context, htm, htu, accessToken)` and `RemoteDpopSigner`, a `DpopSigner` that delegates to the Wallet.

## 9. ThunderID provider interfaces

Package `pkg/thunderidengine/providers` (`interface.go`, `model.go`), in `repos/thunderid` branch `feature/ps03-native-sso`. The embedding application wires an implementation with `WithDeviceSecretProvider`; eSignet's is `internal/engine/device_secret_provider.go`.

```go
type DeviceSecretProvider interface {
    GenerateDeviceSecret(ctx context.Context, params *DeviceSecretParams) (*DeviceSecretResult, *common.ServiceError)
    ValidateDeviceSecret(ctx context.Context, clientID string, deviceSecret string) (*DeviceSecretClaims, *common.ServiceError)
}

// Optional extension of a DeviceSecretProvider.
type DeviceSSOConsentProvider interface {
    ResolveDerivedConsent(ctx context.Context, req *DerivedConsentRequest) (*DerivedConsentResult, *common.ServiceError)
}
```

If the provider does not implement `DeviceSSOConsentProvider`, the exchange only enforces scope ⊆ grant. A result that is not allowed makes the token endpoint answer `interaction_required`.

| Struct | Fields |
|---|---|
| `DeviceSecretParams` | `Sub`, `AuthID`, `ClientID`, `Scope`, `ACR`, `Claims` (map), `Issuer`, `CnfJKT`, `ExpiryDuration`, `SessionID` |
| `DeviceSecretResult` | `DeviceSecret`, `DSHash`, `ExpiresAt` |
| `DeviceSecretClaims` | `Sub`, `AuthID`, `ClientID`, `Scope`, `ACR`, `Claims`, `CnfJKT`, `Issuer`, `ExpiresAt`, `JTI`, `SessionID` |
| `DerivedConsentRequest` | `Sub`, `ClientID` (child), `OriginClientID` (super app), `RequestedScopes`, `GrantedScopes`, `AuthID`, `SessionID` |
| `DerivedConsentResult` | `Allowed`, `MissingScopes`, `MissingClaims` |

Related constants: `ScopeDeviceSSO`, `TokenTypeIdentifierDeviceSecret`, `ErrorInteractionRequired`.

## 10. Configuration

| Setting | Default | Meaning |
|---|---|---|
| `MOSIP_ESIGNET_DEVICE_SECRET_VALIDITY_SECONDS` | `2592000` (30 days) | upper bound of a device secret's lifetime |
| `oauth.allowed_grant_types` (`data/deployment.yaml`) | includes `urn:ietf:params:oauth:grant-type:token-exchange` | enables the grant |
| `oauth.allowed_scopes` (`data/deployment.yaml`) | includes `device_sso` | advertised in discovery |
| keymanager `OIDC_SERVICE` / `DEVICE_SECRET_ENC` | provisioned at startup | encryption key of device secrets (RSA-OAEP-256 + A256GCM) |
| `MOSIP_ESIGNET_SIGNING_KEY_REF_ID` | existing setting | signing key of device secrets |
