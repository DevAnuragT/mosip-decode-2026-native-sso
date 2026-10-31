#!/usr/bin/env python3
"""Provision the Native SSO demo clients against a running eSignet.

For each app this script (1) generates an RSA key pair with openssl, (2) writes the PKCS#8
private key into the app's `res/raw/client_private_key.pem` so the APK can sign
`private_key_jwt` client assertions, and (3) registers the OIDC client through
`POST /client-mgmt/client` with the matching public JWK.

The super app and the child app share one relying party and both list `device_sso` in
`allowed_authorization_scopes`; the child app additionally registers the `token_exchange`
grant. A third client of another vendor is registered to demonstrate the vendor-isolation
rejection in the Postman collection.

Usage:
    python3 scripts/register_clients.py [--esignet http://localhost:8088] [--keys-only]
"""
import argparse
import base64
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CLIENTS = [
    {
        "clientId": "mosip-super-app",
        "clientName": "Vendor Wallet (super app)",
        "module": "super-app",
        "relyingPartyId": "mosip-demo-vendor",
        "redirectUris": ["org.mosip.superapp://callback"],
        "userClaims": ["name", "email", "picture", "phone_number", "birthdate", "gender"],
        # refresh_token: the super app renews its tokens without a new login; the refreshed ID token
        # keeps its device-secret binding (Native SSO 1.0 §3.4.3).
        "grantTypes": ["authorization_code", "refresh_token"],
        "additionalConfig": {
            "require_pushed_authorization_requests": True,
            "dpop_bound_access_tokens": True,
            "require_pkce": True,
            "allowed_authorization_scopes": ["device_sso"],
        },
    },
    {
        "clientId": "mosip-child-app",
        "clientName": "Vendor Health (child app)",
        "module": "child-app",
        "relyingPartyId": "mosip-demo-vendor",
        "redirectUris": ["org.mosip.childapp://callback"],
        # No picture: the default silent sign-in (openid profile) then only needs the essential
        # "name" claim, while email/phone are the extra claims that trigger re-consent.
        "userClaims": ["name", "email", "phone_number"],
        "grantTypes": ["authorization_code", "token_exchange"],
        "additionalConfig": {
            "require_pushed_authorization_requests": True,
            "dpop_bound_access_tokens": True,
            "require_pkce": True,
            "allowed_authorization_scopes": ["device_sso"],
        },
    },
    {
        "clientId": "other-vendor-app",
        "clientName": "Other Vendor App (negative test)",
        "module": None,
        "relyingPartyId": "another-vendor",
        "redirectUris": ["org.example.other://callback"],
        "userClaims": ["name"],
        "grantTypes": ["authorization_code", "token_exchange"],
        "additionalConfig": {
            "require_pkce": True,
            "dpop_bound_access_tokens": True,
            "allowed_authorization_scopes": ["device_sso"],
        },
    },
]


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def generate_key(path: str) -> dict:
    """Generates (or reuses) a 2048-bit RSA key at path and returns its public JWK."""
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048",
                        "-out", path], check=True, capture_output=True)
    out = subprocess.run(["openssl", "rsa", "-in", path, "-noout", "-modulus"], check=True,
                         capture_output=True, text=True).stdout.strip()
    modulus_hex = out.split("=", 1)[1]
    n = bytes.fromhex(modulus_hex)
    e = (65537).to_bytes(3, "big")
    jwk = {"kty": "RSA", "n": b64url(n), "e": b64url(e)}
    # kid = RFC 7638 thumbprint; the app derives the same value from its private key. No "alg":
    # the key signs PS256 client assertions (eSignet's FAPI 2.0 profile does not accept RS256).
    canonical = json.dumps({"e": jwk["e"], "kty": "RSA", "n": jwk["n"]}, separators=(",", ":"))
    jwk["kid"] = b64url(hashlib.sha256(canonical.encode()).digest())
    jwk["use"] = "sig"
    return jwk


def register(esignet: str, client: dict, jwk: dict) -> None:
    body = {
        "requestTime": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "request": {
            "clientId": client["clientId"],
            "clientName": client["clientName"],
            "clientNameLangMap": {"eng": client["clientName"]},
            "relyingPartyId": client["relyingPartyId"],
            "logoUri": "https://mosip.io/favicon.ico",
            "redirectUris": client["redirectUris"],
            "userClaims": client["userClaims"],
            "authContextRefs": ["mosip:idp:acr:generated-code", "mosip:idp:acr:password", "mosip:idp:acr:static-code"],
            "publicKey": jwk,
            "grantTypes": client["grantTypes"],
            "clientAuthMethods": ["private_key_jwt"],
            "additionalConfig": client["additionalConfig"],
        },
    }
    data = json.dumps(body).encode()
    req = urllib.request.Request(f"{esignet}/client-mgmt/client", data=data, method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            payload = json.loads(resp.read().decode() or "{}")
            errors = payload.get("errors") or []
            if not errors:
                print(f"  registered {client['clientId']}: HTTP {resp.status}")
                return
            codes = [e.get("errorCode") for e in errors]
            if any(c in ("duplicate_client_id", "client_already_exists") for c in codes):
                print(f"  {client['clientId']} already registered; updating")
            else:
                print(f"  create failed for {client['clientId']}: {errors}")
                sys.exit(1)
    except urllib.error.HTTPError as err:
        text = err.read().decode(errors="replace")
        if err.code in (400, 409) and "duplicate" in text.lower():
            print(f"  {client['clientId']} already registered; updating")
        else:
            print(f"  create failed for {client['clientId']}: HTTP {err.code} {text}")
            if err.code != 400:
                sys.exit(1)
    # Fall back to a full update so re-running the script refreshes the registration.
    update = dict(body["request"])
    for k in ("clientId", "relyingPartyId", "publicKey"):
        update.pop(k, None)
    update["status"] = "ACTIVE"
    req = urllib.request.Request(f"{esignet}/client-mgmt/client/{client['clientId']}",
                                 data=json.dumps({"requestTime": body["requestTime"], "request": update}).encode(),
                                 method="PUT", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            payload = json.loads(resp.read().decode() or "{}")
            if payload.get("errors"):
                print(f"  update failed for {client['clientId']}: {payload['errors']}")
                sys.exit(1)
            print(f"  updated {client['clientId']}: HTTP {resp.status}")
    except urllib.error.HTTPError as err:
        print(f"  update failed for {client['clientId']}: HTTP {err.code} {err.read().decode(errors='replace')}")
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--esignet", default=os.environ.get("ESIGNET_BASE_URL", "http://localhost:8088"))
    parser.add_argument("--keys-only", action="store_true", help="generate keys without registering clients")
    parser.add_argument("--export", default=os.path.join(ROOT, "scripts", "clients.json"),
                        help="where to write the generated client summary (used by the Postman collection)")
    args = parser.parse_args()

    summary = {}
    for client in CLIENTS:
        if client["module"]:
            key_path = os.path.join(ROOT, client["module"], "src", "main", "res", "raw", "client_private_key.pem")
        else:
            key_path = os.path.join(ROOT, "scripts", "keys", f"{client['clientId']}.pem")
        jwk = generate_key(key_path)
        print(f"{client['clientId']}: key at {os.path.relpath(key_path, ROOT)}")
        summary[client["clientId"]] = {"private_key_path": os.path.relpath(key_path, ROOT), "public_jwk": jwk,
                                       "relying_party_id": client["relyingPartyId"]}
        if not args.keys_only:
            register(args.esignet, client, jwk)

    with open(args.export, "w") as fh:
        json.dump(summary, fh, indent=2)
    print(f"wrote {os.path.relpath(args.export, ROOT)}")


if __name__ == "__main__":
    main()
