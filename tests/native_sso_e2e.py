#!/usr/bin/env python3
"""End-to-end test of OpenID Connect Native SSO against a running eSignet (Go).

The script plays both apps of one vendor from the laptop, with no browser involved:

  1. Super app: PAR + PKCE + DPoP authorization asking for ``device_sso``, the mock-identity
     OTP login through eSignet's flow API, consent, the authorization-code grant. Expects
     ``device_secret`` in the token response and ``ds_hash``/``sid`` in the ID token.
  2. Child app: RFC 8693 token exchange presenting the ID token (subject) and the device secret
     (actor) with a DPoP proof from the super app's key. Expects a DPoP-bound access token whose
     ``act`` names the super app, then calls userinfo with it.
  3. Negative cases: scope escalation, ``device_sso`` on an exchange, a different vendor, a wrong
     DPoP key, a tampered device secret, a missing ``sid`` binding, and the bonus re-consent case
     (``interaction_required`` when the child asks for a claim the user never consented to); the
     exchange's ``audience`` must be the issuer (missing: invalid_request, other: invalid_target)
     and a ``scope`` without ``openid`` is refused.
  4. A login without ``device_sso`` issues no device secret; ``device_sso`` without ``openid`` is
     refused; an exchange without ``scope`` never hands ``device_sso`` to the child; and the ID
     token of one login cannot be paired with the device secret of another (ds_hash/sid binding).

Only the standard library and the ``openssl`` CLI are used. Keys come from
``mobile-sample/scripts/register_clients.py`` (run it first, it registers the clients too).

Usage:
    python3 tests/native_sso_e2e.py [--esignet http://localhost:8088] [--individual-id 1774231323] [--otp 111111]
"""
import argparse
import base64
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOBILE = os.path.join(ROOT, "mobile-sample")

SUPER = "mosip-super-app"
CHILD = "mosip-child-app"
OTHER = "other-vendor-app"
KEYS = {
    SUPER: os.path.join(MOBILE, "super-app/src/main/res/raw/client_private_key.pem"),
    CHILD: os.path.join(MOBILE, "child-app/src/main/res/raw/client_private_key.pem"),
    OTHER: os.path.join(MOBILE, "scripts/keys/other-vendor-app.pem"),
}
GRANT_TOKEN_EXCHANGE = "urn:ietf:params:oauth:grant-type:token-exchange"
TT_ID_TOKEN = "urn:ietf:params:oauth:token-type:id_token"
TT_DEVICE_SECRET = "urn:openid:params:token-type:device-secret"


# ----------------------------------------------------------------------------- crypto helpers

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def b64url_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sha256_b64url(text: str) -> str:
    return b64url(hashlib.sha256(text.encode()).digest())


def jwt_payload(token: str) -> dict:
    return json.loads(b64url_decode(token.split(".")[1]))


def openssl_sign(key_path: str, data: bytes, pss: bool) -> bytes:
    with tempfile.NamedTemporaryFile(delete=False) as fh:
        fh.write(data)
        path = fh.name
    try:
        cmd = ["openssl", "pkeyutl", "-sign", "-inkey", key_path, "-rawin", "-digest", "sha256", "-in", path]
        if pss:
            cmd += ["-pkeyopt", "rsa_padding_mode:pss", "-pkeyopt", "rsa_pss_saltlen:32"]
        return subprocess.run(cmd, check=True, capture_output=True).stdout
    finally:
        os.unlink(path)


class RsaClientKey:
    """Signs PS256 private_key_jwt client assertions with a registered client's PKCS#8 key."""

    def __init__(self, client_id: str, pem_path: str):
        self.client_id = client_id
        self.pem_path = pem_path
        out = subprocess.run(["openssl", "rsa", "-in", pem_path, "-noout", "-modulus"], check=True,
                             capture_output=True, text=True).stdout.strip()
        n = b64url(bytes.fromhex(out.split("=", 1)[1]))
        e = b64url((65537).to_bytes(3, "big"))
        self.kid = sha256_b64url(json.dumps({"e": e, "kty": "RSA", "n": n}, separators=(",", ":")))

    def assertion(self, audience: str) -> str:
        """FAPI 2.0 §5.3.2.1: the assertion audience is the authorization server's issuer."""
        now = int(time.time())
        header = {"alg": "PS256", "typ": "JWT", "kid": self.kid}
        payload = {"iss": self.client_id, "sub": self.client_id, "aud": audience, "iat": now, "nbf": now,
                   "exp": now + 120, "jti": str(uuid.uuid4())}
        signing_input = f"{b64url(json.dumps(header).encode())}.{b64url(json.dumps(payload).encode())}"
        sig = openssl_sign(self.pem_path, signing_input.encode(), pss=True)
        return f"{signing_input}.{b64url(sig)}"


class EcDpopKey:
    """An EC P-256 DPoP key (the super app's Key A) backed by a temporary openssl key file."""

    def __init__(self):
        self.path = tempfile.NamedTemporaryFile(suffix=".pem", delete=False).name
        subprocess.run(["openssl", "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", self.path],
                       check=True, capture_output=True)
        pub = subprocess.run(["openssl", "ec", "-in", self.path, "-noout", "-text"], check=True,
                             capture_output=True, text=True).stdout
        # Parse the uncompressed point (04 || X || Y) printed under "pub:".
        lines = pub.splitlines()
        start = next(i for i, l in enumerate(lines) if l.strip().startswith("pub:")) + 1
        hexstr = ""
        for l in lines[start:]:
            if not l.startswith("    "):
                break
            hexstr += l.strip().replace(":", "")
        point = bytes.fromhex(hexstr)
        assert point[0] == 4
        self.x = b64url(point[1:33])
        self.y = b64url(point[33:65])

    def jwk(self) -> dict:
        return {"crv": "P-256", "kty": "EC", "x": self.x, "y": self.y}

    def thumbprint(self) -> str:
        return sha256_b64url(json.dumps(self.jwk(), separators=(",", ":"), sort_keys=True))

    def proof(self, htm: str, htu: str, access_token: str | None = None) -> str:
        header = {"typ": "dpop+jwt", "alg": "ES256", "jwk": self.jwk()}
        payload = {"jti": str(uuid.uuid4()), "htm": htm, "htu": htu, "iat": int(time.time())}
        if access_token:
            payload["ath"] = sha256_b64url(access_token)
        signing_input = f"{b64url(json.dumps(header).encode())}.{b64url(json.dumps(payload).encode())}"
        der = openssl_sign(self.path, signing_input.encode(), pss=False)
        return f"{signing_input}.{b64url(der_to_jose(der))}"


def der_to_jose(der: bytes) -> bytes:
    """ASN.1 DER ECDSA signature -> R||S (32 bytes each)."""
    i = 2
    assert der[i] == 2
    rlen = der[i + 1]
    r = int.from_bytes(der[i + 2:i + 2 + rlen], "big")
    i += 2 + rlen
    assert der[i] == 2
    slen = der[i + 1]
    s = int.from_bytes(der[i + 2:i + 2 + slen], "big")
    return r.to_bytes(32, "big") + s.to_bytes(32, "big")


# Sentinel: send the issuer as the exchange's audience (Native SSO 1.0 §4.1).
ISSUER = object()


# ----------------------------------------------------------------------------- HTTP helpers

class HttpError(Exception):
    def __init__(self, status: int, body: str):
        super().__init__(f"HTTP {status}: {body[:300]}")
        self.status = status
        self.body = body
        try:
            self.json = json.loads(body)
        except Exception:
            self.json = {}


def request(method: str, url: str, data=None, headers=None, form=False, follow_redirects=True):
    headers = dict(headers or {})
    body = None
    if data is not None:
        if form:
            body = urllib.parse.urlencode(data).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    opener = urllib.request.build_opener(NoRedirect()) if not follow_redirects else urllib.request.build_opener()
    try:
        with opener.open(req, timeout=30) as resp:
            return resp.status, dict(resp.headers), resp.read().decode()
    except urllib.error.HTTPError as err:
        text = err.read().decode(errors="replace")
        if err.code in (301, 302, 303, 307, 308):
            return err.code, dict(err.headers), text
        raise HttpError(err.code, text)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


# ----------------------------------------------------------------------------- the flows

class Report:
    def __init__(self):
        self.rows = []

    def ok(self, name, detail=""):
        self.rows.append(("PASS", name, detail))
        print(f"  PASS  {name}  {detail}")

    def fail(self, name, detail=""):
        self.rows.append(("FAIL", name, detail))
        print(f"  FAIL  {name}  {detail}")

    def expect(self, cond, name, detail=""):
        (self.ok if cond else self.fail)(name, detail)
        return cond


class Esignet:
    def __init__(self, base: str):
        self.base = base
        _, _, body = request("GET", f"{base}/.well-known/openid-configuration")
        self.meta = json.loads(body)
        self.par = self.meta["pushed_authorization_request_endpoint"]
        self.authorize = self.meta["authorization_endpoint"]
        self.token = self.meta["token_endpoint"]
        self.userinfo = self.meta["userinfo_endpoint"]

    # --- super app: interactive login driven through the flow API ---------------------------
    def super_app_login(self, key: RsaClientKey, dpop: EcDpopKey, scope: str, redirect_uri: str,
                        individual_id: str, otp: str, claims: dict | None = None, log=print,
                        decline: set[str] | None = None) -> dict:
        verifier = b64url(os.urandom(32))
        form = {
            "client_id": key.client_id, "response_type": "code", "redirect_uri": redirect_uri,
            "scope": scope, "state": b64url(os.urandom(8)), "nonce": b64url(os.urandom(8)),
            "code_challenge": sha256_b64url(verifier), "code_challenge_method": "S256",
            "dpop_jkt": dpop.thumbprint(),
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            "client_assertion": key.assertion(self.meta["issuer"]),
        }
        if claims:
            form["claims"] = json.dumps(claims)
        # Always capture consent afresh so the run does not depend on what an earlier login stored.
        form["prompt"] = "consent"
        _, _, body = request("POST", self.par, form, {"DPoP": dpop.proof("POST", self.par)}, form=True)
        request_uri = json.loads(body)["request_uri"]
        log(f"    PAR ok: {request_uri[:60]}…")

        status, headers, _ = request("GET", f"{self.authorize}?client_id={key.client_id}&request_uri={urllib.parse.quote(request_uri)}",
                                     follow_redirects=False)
        loc = headers.get("Location") or headers.get("location")
        assert status in (302, 303, 307) and loc, f"authorize did not redirect ({status})"
        q = urllib.parse.parse_qs(urllib.parse.urlparse(loc).query)
        if "error" in q:
            raise RuntimeError(f"authorize error: {q}")
        auth_id, execution_id = q["authId"][0], q["executionId"][0]
        log(f"    authorize -> login UI, authId={auth_id[:12]}… executionId={execution_id[:12]}…")

        # Drive the declarative login flow the way oidc-ui does.
        state = {"executionId": execution_id}
        resp = self.flow(state)
        resp = self.flow(state, resp, inputs=None)  # select the first ACR (OTP)
        resp = self.flow(state, resp, inputs={"username": individual_id, "captcha_token": "test-captcha-token"})
        resp = self.flow(state, resp, inputs={"otp": otp})
        if resp.get("flowStatus") != "COMPLETE":
            resp = self.flow(state, resp, inputs={"consent_decisions": json.dumps(self.approve_all(resp, decline))})
        assert resp.get("flowStatus") == "COMPLETE", f"flow did not complete: {json.dumps(resp)[:400]}"
        log("    OTP login + consent complete")

        _, _, body = request("POST", f"{self.base}/oauth2/auth/callback", {"authId": auth_id, "assertion": resp["assertion"]})
        redirect = json.loads(body).get("redirect_uri") or json.loads(body).get("redirectUri")
        code = urllib.parse.parse_qs(urllib.parse.urlparse(redirect).query)["code"][0]
        log("    authorization code issued")

        form = {
            "grant_type": "authorization_code", "code": code, "client_id": key.client_id,
            "redirect_uri": redirect_uri, "code_verifier": verifier,
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            "client_assertion": key.assertion(self.meta["issuer"]),
        }
        _, _, body = request("POST", self.token, form, {"DPoP": dpop.proof("POST", self.token)}, form=True)
        return json.loads(body)

    def flow(self, state: dict, previous: dict | None = None, inputs: dict | None = None) -> dict:
        body = {"executionId": state["executionId"]}
        if previous:
            body["challengeToken"] = previous.get("challengeToken") or state.get("challengeToken")
            actions = (previous.get("data") or {}).get("actions") or []
            if actions:
                body["action"] = actions[0]["ref"]
            if inputs is not None:
                body["inputs"] = inputs
        _, _, text = request("POST", f"{self.base}/flow/execute", body)
        resp = json.loads(text)
        if os.environ.get("NATIVE_SSO_DEBUG"):
            print("    flow/execute <-", json.dumps(resp)[:3000])
        if resp.get("challengeToken"):
            state["challengeToken"] = resp["challengeToken"]
        return resp

    @staticmethod
    def approve_all(resp: dict, decline: set[str] | None = None) -> dict:
        """Builds consent decisions from the flow's consent prompt, approving every element except
        those in ``decline`` (optional claims the user leaves unticked)."""
        decline = decline or set()
        prompt = json.loads(((resp.get("data") or {}).get("additionalData") or {}).get("consentPrompt") or "[]")
        purposes = []
        for purpose in prompt:
            elements = []
            for el in (purpose.get("essential") or []) + (purpose.get("optional") or []):
                elements.append({"name": el["name"], "approved": el["name"] not in decline})
            purposes.append({"purposeName": purpose["purposeName"], "approved": True, "elements": elements})
        return {"approved": True, "purposes": purposes}

    # --- child app: token exchange ----------------------------------------------------------
    def exchange(self, key: RsaClientKey, id_token: str, device_secret: str, scope: str | None, dpop_proof: str,
                 actor_type: str = TT_DEVICE_SECRET, audience=ISSUER) -> dict:
        """Native SSO token exchange. ``scope=None`` omits the parameter; ``audience`` defaults to the
        issuer (REQUIRED by Native SSO 1.0 §4.1), ``None`` omits it."""
        form = {
            "grant_type": GRANT_TOKEN_EXCHANGE, "client_id": key.client_id,
            "subject_token": id_token, "subject_token_type": TT_ID_TOKEN,
            "actor_token": device_secret, "actor_token_type": actor_type,
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            "client_assertion": key.assertion(self.meta["issuer"]),
        }
        if scope is not None:
            form["scope"] = scope
        if audience is ISSUER:
            audience = self.meta["issuer"]
        if audience is not None:
            form["audience"] = audience
        _, _, body = request("POST", self.token, form, {"DPoP": dpop_proof}, form=True)
        return json.loads(body)

    # --- super app: refresh-token grant ------------------------------------------------------
    def refresh(self, key: RsaClientKey, refresh_token: str, dpop_proof: str, device_secret: str | None = None) -> dict:
        """Refresh-token grant of the first app. Native SSO 1.0 §3.4.3: the app may present the
        device_secret it holds; while device_sso stays in scope a valid one is kept, otherwise a
        new one is issued, and the refreshed ID token carries ds_hash and sid either way."""
        form = {
            "grant_type": "refresh_token", "refresh_token": refresh_token, "client_id": key.client_id,
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            "client_assertion": key.assertion(self.meta["issuer"]),
        }
        if device_secret is not None:
            form["device_secret"] = device_secret
        _, _, body = request("POST", self.token, form, {"DPoP": dpop_proof}, form=True)
        return json.loads(body)

    def user_info(self, access_token: str, dpop_proof: str) -> dict:
        _, _, body = request("GET", self.userinfo, headers={"Authorization": f"DPoP {access_token}", "DPoP": dpop_proof})
        return json.loads(body) if body.lstrip().startswith("{") else jwt_payload(body)


def expect_oauth_error(report: Report, name: str, fn, error: str, needle: str | None = None):
    try:
        fn()
        report.fail(name, "request unexpectedly succeeded")
    except HttpError as err:
        got = err.json.get("error")
        desc = err.json.get("error_description", "")
        ok = got == error and (needle is None or needle.lower() in desc.lower())
        report.expect(ok, name, f"{got}: {desc}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--esignet", default=os.environ.get("ESIGNET_BASE_URL", "http://localhost:8088"))
    parser.add_argument("--individual-id", default="1774231323", help="mock identity seeded by docker-compose/init.sql")
    parser.add_argument("--otp", default="111111")
    parser.add_argument("--report", default=os.path.join(ROOT, "tests", "results", "native_sso_e2e.json"))
    args = parser.parse_args()

    report = Report()
    es = Esignet(args.esignet)
    super_key = RsaClientKey(SUPER, KEYS[SUPER])
    child_key = RsaClientKey(CHILD, KEYS[CHILD])
    other_key = RsaClientKey(OTHER, KEYS[OTHER])
    key_a = EcDpopKey()  # the super app's hardware key, shared with child apps only as DPoP proofs

    print("== discovery")
    report.expect(GRANT_TOKEN_EXCHANGE in es.meta.get("grant_types_supported", []), "token exchange advertised")
    report.expect("device_sso" in es.meta.get("scopes_supported", []), "device_sso advertised")
    report.expect(es.meta.get("native_sso_supported") is True, "native_sso_supported advertised (§5)")

    print("== 1. super app login with device_sso")
    # The user approves everything except the optional "email" claim: the child app may later
    # reuse name silently, but asking for email needs fresh consent (bonus task).
    tokens = es.super_app_login(super_key, key_a, "openid profile email device_sso", "org.mosip.superapp://callback",
                                args.individual_id, args.otp,
                                claims={"userinfo": {"name": {"essential": True}, "email": {"essential": False}}},
                                decline={"email"})
    id_token, device_secret = tokens.get("id_token"), tokens.get("device_secret")
    report.expect(bool(tokens.get("access_token")), "access token issued", tokens.get("token_type", ""))
    report.expect(bool(id_token), "id_token issued")
    report.expect(bool(device_secret), "device_secret issued", f"{len(device_secret or '')} chars")
    report.expect(len((device_secret or "").split(".")) == 5, "device_secret is an encrypted JWE (5 segments)")
    idc = jwt_payload(id_token) if id_token else {}
    report.expect(idc.get("ds_hash") == sha256_b64url(device_secret or ""), "id_token ds_hash = SHA-256(device_secret)")
    report.expect(bool(idc.get("sid")), "id_token carries sid", idc.get("sid", ""))
    atc = jwt_payload(tokens["access_token"])
    report.expect((atc.get("cnf") or {}).get("jkt") == key_a.thumbprint(), "access token bound to Key A (cnf.jkt)")
    info = es.user_info(tokens["access_token"], key_a.proof("GET", es.userinfo, tokens["access_token"]))
    report.expect(bool(info.get("sub")), "super app userinfo", f"name={info.get('name')}")

    print("== 2. child app silent sign-in (token exchange)")
    child = es.exchange(child_key, id_token, device_secret, "openid profile", key_a.proof("POST", es.token))
    report.expect(bool(child.get("access_token")), "child access token issued", child.get("token_type", ""))
    report.expect(not child.get("device_secret"), "no device_secret on an exchange")
    cac = jwt_payload(child["access_token"])
    report.expect(cac.get("sub") == idc.get("sub"), "same subject as the super app")
    report.expect((cac.get("act") or {}).get("sub") == SUPER, "act claim names the super app", json.dumps(cac.get("act")))
    report.expect((cac.get("cnf") or {}).get("jkt") == key_a.thumbprint(), "child token bound to Key A (cnf.jkt)")
    cinfo = es.user_info(child["access_token"], key_a.proof("GET", es.userinfo, child["access_token"]))
    report.expect(cinfo.get("sub") == info.get("sub") and cinfo.get("name") == info.get("name"), "child app userinfo", f"name={cinfo.get('name')}")
    child2 = es.exchange(child_key, id_token, device_secret, "openid", key_a.proof("POST", es.token))
    report.expect(bool(child2.get("access_token")), "device secret is reusable for a second sign-in")

    print("== 3. negative cases")
    expect_oauth_error(report, "10.a scope escalation (phone was never granted)",
                       lambda: es.exchange(child_key, id_token, device_secret, "openid phone", key_a.proof("POST", es.token)),
                       "invalid_scope", "exceeds")
    expect_oauth_error(report, "10.b device_sso rejected on token exchange",
                       lambda: es.exchange(child_key, id_token, device_secret, "openid device_sso", key_a.proof("POST", es.token)),
                       "invalid_scope", "device_sso")
    expect_oauth_error(report, "vendor isolation: other vendor cannot redeem the secret",
                       lambda: es.exchange(other_key, id_token, device_secret, "openid", key_a.proof("POST", es.token)),
                       "invalid_grant", "vendor")
    key_b = EcDpopKey()
    expect_oauth_error(report, "DPoP proof from a different key is refused",
                       lambda: es.exchange(child_key, id_token, device_secret, "openid", key_b.proof("POST", es.token)),
                       "invalid_grant", "thumbprint")
    expect_oauth_error(report, "tampered device secret is refused",
                       lambda: es.exchange(child_key, id_token, device_secret[:-2] + "xx", "openid", key_a.proof("POST", es.token)),
                       "invalid_grant", "decrypt")
    expect_oauth_error(report, "device secret as subject_token type is refused",
                       lambda: es.exchange(child_key, id_token, device_secret, "openid", key_a.proof("POST", es.token), actor_type=TT_ID_TOKEN),
                       "invalid_request")
    expect_oauth_error(report, "bonus: email was never consented to the super app",
                       lambda: es.exchange(child_key, id_token, device_secret, "openid email", key_a.proof("POST", es.token)),
                       "interaction_required", "email")
    expect_oauth_error(report, "scope without openid is refused on an exchange",
                       lambda: es.exchange(child_key, id_token, device_secret, "profile", key_a.proof("POST", es.token)),
                       "invalid_scope", "openid")
    expect_oauth_error(report, "§4.1 audience missing is refused",
                       lambda: es.exchange(child_key, id_token, device_secret, "openid profile", key_a.proof("POST", es.token),
                                           audience=None),
                       "invalid_request", "audience")
    expect_oauth_error(report, "§4.1 audience other than the issuer is invalid_target",
                       lambda: es.exchange(child_key, id_token, device_secret, "openid profile", key_a.proof("POST", es.token),
                                           audience="https://rp.example.com"),
                       "invalid_target", "issuer")

    print("== 4. a second super-app login without device_sso issues no device secret")
    plain = es.super_app_login(super_key, key_a, "openid profile", "org.mosip.superapp://callback", args.individual_id, args.otp)
    report.expect(not plain.get("device_secret"), "no device_secret without the scope")
    report.expect("ds_hash" not in jwt_payload(plain["id_token"]), "no ds_hash without the scope")
    expect_oauth_error(report, "§3.4 device_sso without openid is refused",
                       lambda: es.super_app_login(super_key, key_a, "profile device_sso", "org.mosip.superapp://callback",
                                                  args.individual_id, args.otp, log=lambda *_: None),
                       "invalid_scope", "openid")

    print("== 5. a second device_sso login: inherited scopes and cross-login binding")
    second = es.super_app_login(super_key, key_a, "openid profile device_sso", "org.mosip.superapp://callback",
                                args.individual_id, args.otp)
    id_token2, device_secret2 = second.get("id_token"), second.get("device_secret")
    report.expect(bool(id_token2) and bool(device_secret2), "second login issues an id_token and a device_secret")
    try:
        inherited = es.exchange(child_key, id_token2, device_secret2, None, key_a.proof("POST", es.token))
        granted = set((inherited.get("scope") or "").split()) | set((jwt_payload(inherited["access_token"]).get("scope") or "").split())
        report.expect(bool(inherited.get("access_token")), "exchange without scope issues a token", " ".join(sorted(granted)))
        report.expect("device_sso" not in granted and "openid" in granted, "10.b exchange without scope does not pass on device_sso")
    except HttpError as err:
        report.fail("exchange without scope issues a token", str(err))
        report.fail("10.b exchange without scope does not pass on device_sso", "no token")
    expect_oauth_error(report, "id_token of one login with the device secret of another is refused",
                       lambda: es.exchange(child_key, id_token, device_secret2, "openid", key_a.proof("POST", es.token)),
                       "invalid_grant", "does not match")

    print("== 6. refresh-token grant keeps the Native SSO binding (§3.4.3)")
    refresh_token = second.get("refresh_token")
    report.expect(bool(refresh_token), "refresh_token issued to the super app")
    try:
        kept = es.refresh(super_key, refresh_token, key_a.proof("POST", es.token), device_secret=device_secret2)
        kac, kic = jwt_payload(kept["access_token"]), jwt_payload(kept["id_token"])
        report.expect(bool(kept.get("access_token")) and bool(kept.get("id_token")), "refresh issues new access and ID tokens")
        report.expect(kept.get("device_secret") == device_secret2, "a valid presented device_secret is kept")
        report.expect(kic.get("ds_hash") == sha256_b64url(device_secret2) and kic.get("sid") == jwt_payload(id_token2).get("sid"),
                      "refreshed id_token keeps ds_hash and sid")
        report.expect((kac.get("cnf") or {}).get("jkt") == key_a.thumbprint(), "refreshed access token bound to Key A (cnf.jkt)")
        report.expect("device_sso" not in (kac.get("scope") or "").split(), "device_sso stays off the refreshed access token's scope claim")
        replaced = es.refresh(super_key, kept.get("refresh_token") or refresh_token, key_a.proof("POST", es.token))
        new_secret = replaced.get("device_secret")
        report.expect(bool(new_secret) and new_secret != device_secret2, "refresh without a device_secret issues a new one")
        report.expect(jwt_payload(replaced["id_token"]).get("ds_hash") == sha256_b64url(new_secret or ""),
                      "refreshed id_token is bound to the new device_secret")
        redeemed = es.exchange(child_key, replaced["id_token"], new_secret, "openid", key_a.proof("POST", es.token))
        report.expect(bool(redeemed.get("access_token")), "child app redeems the refreshed id_token with the new device_secret")
    except HttpError as err:
        report.fail("refresh-token grant with device_secret", str(err)[:300])
    # The super app is a confidential client (private_key_jwt), so its refresh token is not DPoP-bound
    # (RFC 9449 §5) and a refresh with another key is a legitimate key rotation. What must not happen
    # is the old secret surviving: a presented secret bound to Key A is not kept for Key B's proof.
    try:
        rotated = es.refresh(super_key, refresh_token, key_b.proof("POST", es.token), device_secret=device_secret2)
        report.expect(bool(rotated.get("device_secret")) and rotated.get("device_secret") != device_secret2,
                      "a device_secret bound to another DPoP key is not kept on refresh")
        report.expect((jwt_payload(rotated["access_token"]).get("cnf") or {}).get("jkt") == key_b.thumbprint()
                      and jwt_payload(rotated["id_token"]).get("ds_hash") == sha256_b64url(rotated.get("device_secret") or ""),
                      "refreshed tokens and the new device_secret are bound to the presented key")
    except HttpError as err:
        report.fail("a device_secret bound to another DPoP key is not kept on refresh", str(err)[:300])

    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w") as fh:
        json.dump({"esignet": args.esignet, "ran_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                   "results": [{"status": s, "name": n, "detail": d} for s, n, d in report.rows]}, fh, indent=2)
    failed = [r for r in report.rows if r[0] == "FAIL"]
    print(f"\n{len(report.rows) - len(failed)}/{len(report.rows)} checks passed; report at {os.path.relpath(args.report, ROOT)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
