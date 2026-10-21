#!/usr/bin/env python3
"""Builds the Native SSO Postman collection and environment.

The collection reuses the FAPI 2.0 request scripts of the upstream eSignet collection
(`repos/esignet-go/postman-collection/Go-eSignet.postman_collection.json`): PKCE, a DPoP key
("Key A") and PS256 private_key_jwt assertions are all generated in Postman pre-request scripts
with WebCrypto. On top of that it adds the Native SSO requests: the super app login asking for
`device_sso`, the child app's token exchange, its userinfo call, and the negative cases.

The environment carries the demo clients registered by `mobile-sample/scripts/register_clients.py`
with their private keys as JWKs (read from the PEM files), so the collection can be run top to
bottom against a local eSignet without any manual key handling.

Usage: python3 postman/build_collection.py
"""
import base64
import copy
import hashlib
import json
import os
import re
import subprocess
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPSTREAM = os.path.join(ROOT, "repos", "esignet-go", "postman-collection", "Go-eSignet.postman_collection.json")
OUT_COLLECTION = os.path.join(ROOT, "postman", "mosip_esignet_native_sso.postman_collection.json")
OUT_ENV = os.path.join(ROOT, "postman", "mosip_esignet_native_sso_local.postman_environment.json")
KEYS = {
    "super": os.path.join(ROOT, "mobile-sample", "super-app", "src", "main", "res", "raw", "client_private_key.pem"),
    "child": os.path.join(ROOT, "mobile-sample", "child-app", "src", "main", "res", "raw", "client_private_key.pem"),
    "other": os.path.join(ROOT, "mobile-sample", "scripts", "keys", "other-vendor-app.pem"),
}
CLIENT_IDS = {"super": "mosip-super-app", "child": "mosip-child-app", "other": "other-vendor-app"}


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def private_jwk(pem_path: str) -> dict:
    """RSA private JWK (RFC 7518 §6.3) from a PKCS#8 PEM, via `openssl rsa -text`."""
    text = subprocess.run(["openssl", "rsa", "-in", pem_path, "-text", "-noout"], check=True,
                          capture_output=True, text=True).stdout
    fields = {}
    current = None
    for line in text.splitlines():
        m = re.match(r"^([a-zA-Z]+[0-9]*):\s*(.*)$", line)
        if m and not line.startswith(" "):
            current = m.group(1)
            fields[current] = m.group(2).strip()
            continue
        if current and line.startswith("    "):
            fields[current] += line.strip()
    def num(name):
        raw = fields[name]
        m = re.match(r"^(\d+)\s*\(0x[0-9a-fA-F]+\)$", raw.strip())
        if m:  # small values are printed as "65537 (0x10001)"
            return int(m.group(1))
        return int(raw.replace(":", ""), 16)
    def enc(value: int) -> str:
        return b64url(value.to_bytes((value.bit_length() + 7) // 8, "big"))
    e = num("publicExponent")
    n = num("modulus")
    jwk = {
        "kty": "RSA", "n": enc(n), "e": enc(e), "d": enc(num("privateExponent")),
        "p": enc(num("prime1")), "q": enc(num("prime2")), "dp": enc(num("exponent1")),
        "dq": enc(num("exponent2")), "qi": enc(num("coefficient")),
    }
    canonical = json.dumps({"e": jwk["e"], "kty": "RSA", "n": jwk["n"]}, separators=(",", ":"))
    jwk["kid"] = b64url(hashlib.sha256(canonical.encode()).digest())
    return jwk


def public_jwk(jwk: dict) -> dict:
    return {"kty": "RSA", "n": jwk["n"], "e": jwk["e"], "kid": jwk["kid"], "use": "sig"}


def find(items, name):
    for item in items:
        if item["name"] == name:
            return item
        if "item" in item:
            found = find(item["item"], name)
            if found:
                return found
    return None


def script(listen, lines):
    return {"listen": listen, "script": {"type": "text/javascript", "exec": lines}}


def form_request(name, url, fields, prerequest=None, tests=None, headers=None, description=""):
    item = {
        "name": name,
        "request": {
            "method": "POST",
            "header": [{"key": "Content-Type", "value": "application/x-www-form-urlencoded"}] + (headers or []),
            "body": {"mode": "urlencoded", "urlencoded": [{"key": k, "value": v, "type": "text"} for k, v in fields]},
            "url": {"raw": url, "host": ["{{baseUrl}}"], "path": url.replace("{{baseUrl}}/", "").split("/")},
            "description": description,
        },
        "event": [],
    }
    if prerequest:
        item["event"].append(script("prerequest", prerequest))
    if tests:
        item["event"].append(script("test", tests))
    return item


# JavaScript helpers shared by the Native SSO requests (mirrors the upstream scripts).
JS_HELPERS = [
    "function b64url(bytes) { const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); }",
    "function b64urlStr(str) { return b64url(new TextEncoder().encode(str)); }",
    "async function sha256b64url(input) { const data = typeof input === 'string' ? new TextEncoder().encode(input) : input; return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', data))); }",
    "async function generateJKT(jwk) { return await sha256b64url(JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n })); }",
    "async function dpopProof(privateJwkStr, publicJwkStr, htm, htu, ath) {",
    "  const privateJwk = JSON.parse(privateJwkStr), publicJwk = JSON.parse(publicJwkStr);",
    "  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'RSA-PSS', hash: 'SHA-256' }, false, ['sign']);",
    "  const header = { typ: 'dpop+jwt', alg: 'PS256', jwk: { e: publicJwk.e, kty: publicJwk.kty, n: publicJwk.n } };",
    "  const payload = { jti: crypto.randomUUID(), htm, htu, iat: Math.floor(Date.now() / 1000) };",
    "  if (ath) payload.ath = await sha256b64url(ath);",
    "  const input = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(payload))}`;",
    "  const sig = await crypto.subtle.sign({ name: 'RSA-PSS', saltLength: 32 }, key, new TextEncoder().encode(input));",
    "  return `${input}.${b64url(new Uint8Array(sig))}`;",
    "}",
    "async function clientAssertion(privateJwkStr, clientId) {",
    "  const privateJwk = JSON.parse(privateJwkStr);",
    "  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'RSA-PSS', hash: 'SHA-256' }, false, ['sign']);",
    "  const kid = privateJwk.kid || await generateJKT(privateJwk);",
    "  const now = Math.floor(Date.now() / 1000);",
    "  const header = { alg: 'PS256', typ: 'JWT', kid };",
    "  // FAPI 2.0 §5.3.2.1: the audience is the issuer.",
    "  const payload = { iss: clientId, sub: clientId, aud: pm.environment.get('baseUrl'), jti: crypto.randomUUID(), iat: now, exp: now + 120 };",
    "  const input = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(payload))}`;",
    "  const sig = await crypto.subtle.sign({ name: 'RSA-PSS', saltLength: 32 }, key, new TextEncoder().encode(input));",
    "  return `${input}.${b64url(new Uint8Array(sig))}`;",
    "}",
]


def exchange_prerequest(client_key_var, client_id_var, dpop_private="dpop_private_key", dpop_public="dpop_public_key"):
    return JS_HELPERS + [
        "await (async () => {",
        f"  pm.request.headers.upsert({{ key: 'DPoP', value: await dpopProof(pm.environment.get('{dpop_private}'), pm.environment.get('{dpop_public}'), 'POST', `${{pm.environment.get('baseUrl')}}/oauth2/token`) }});",
        f"  pm.collectionVariables.set('child_client_assertion', await clientAssertion(pm.environment.get('{client_key_var}'), pm.environment.get('{client_id_var}')));",
        "})();",
    ]


def userinfo_prerequest(token_var):
    return JS_HELPERS + [
        "await (async () => {",
        f"  pm.request.headers.upsert({{ key: 'DPoP', value: await dpopProof(pm.environment.get('dpop_private_key'), pm.environment.get('dpop_public_key'), 'GET', `${{pm.environment.get('baseUrl')}}/oauth2/userinfo`, pm.environment.get('{token_var}')) }});",
        f"  pm.request.headers.upsert({{ key: 'Authorization', value: `DPoP ${{pm.environment.get('{token_var}')}}` }});",
        "})();",
    ]


def exchange_fields(scope, client_id="{{child_client_id}}", actor="{{device_secret}}", actor_type="urn:openid:params:token-type:device-secret"):
    return [
        ("grant_type", "urn:ietf:params:oauth:grant-type:token-exchange"),
        ("client_id", client_id),
        ("subject_token", "{{id_token}}"),
        ("subject_token_type", "urn:ietf:params:oauth:token-type:id_token"),
        ("actor_token", actor),
        ("actor_token_type", actor_type),
        ("scope", scope),
        ("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"),
        ("client_assertion", "{{child_client_assertion}}"),
    ]


def expect_error(error, needle=None):
    lines = [
        f"pm.test('rejected with {error}', () => {{",
        "  pm.expect(pm.response.code).to.be.oneOf([400, 401]);",
        f"  pm.expect(pm.response.json().error).to.eql('{error}');",
        "});",
    ]
    if needle:
        lines.append(f"pm.test('reason mentions {needle}', () => pm.expect(pm.response.json().error_description || '').to.include('{needle}'));")
    lines.append("console.log('response:', pm.response.text());")
    return lines


def main():
    upstream = json.load(open(UPSTREAM))
    fapi = find(upstream["item"], "FAPI2.0 flow")
    get = lambda name: copy.deepcopy(find(fapi["item"], name))

    # --- 1. super app login --------------------------------------------------------------
    par = get("Initiate PAR")
    par["name"] = "1.1 Super app: PAR with device_sso (PKCE, DPoP Key A, private_key_jwt)"
    par["request"]["description"] = ("The super app pushes its authorization request. `scope` includes `device_sso`; "
                                     "`dpop_jkt` binds the request to Key A, generated here and reused by every later request.")
    for p in par["request"]["body"]["urlencoded"]:
        if p["key"] == "scope":
            p["value"] = "{{super_scope}}"
        if p["key"] == "client_id":
            p["value"] = "{{client_id}}"
    authorize = get("Initiate Authorization")
    authorize["name"] = "1.2 Super app: authorize (redirects to the login UI)"
    steps = [
        ("Flow execute — start", "1.3 Login flow: start"),
        ("Flow execute — select acr", "1.4 Login flow: choose OTP"),
        ("Flow execute — enter uin", "1.5 Login flow: enter UIN (mock identity 1774231323)"),
        ("Flow execute — enter OTP", "1.6 Login flow: enter OTP (111111)"),
    ]
    flow_items = []
    for src, name in steps:
        item = get(src)
        item["name"] = name
        flow_items.append(item)
    consent = get("Flow execute — consent")
    consent["name"] = "1.7 Login flow: consent (everything except picture)"
    consent["request"]["body"]["raw"] = json.dumps({
        "executionId": "{{execution_id}}", "challengeToken": "{{challenge_token}}", "action": "{{action_ref}}",
        "inputs": {"consent_decisions": "{{consent_decisions}}"},
    }, indent=2)
    consent["event"] = [script("prerequest", [
        "// Approve every prompted claim except the optional `picture`, so the child app's later",
        "// request for `profile` (which releases picture) demonstrates interaction_required.",
        "const prompt = JSON.parse(pm.environment.get('consent_prompt') || '[]');",
        "const decisions = { approved: true, purposes: prompt.map(p => ({ purposeName: p.purposeName, approved: true,",
        "  elements: [...(p.essential || []), ...(p.optional || [])].map(e => ({ name: e.name, approved: e.name !== 'picture' })) })) };",
        "pm.environment.set('consent_decisions', JSON.stringify(decisions));",
    ]), script("test", [
        "pm.test('consent 200', () => pm.response.to.have.status(200));",
        "const j = pm.response.json();",
        "if (j.challengeToken) pm.environment.set('challenge_token', j.challengeToken);",
        "pm.test('flow COMPLETE', () => pm.expect(j.flowStatus).to.eql('COMPLETE'));",
        "if (j.assertion) pm.environment.set('assertion', j.assertion);",
    ])]
    # The OTP step either completes the flow (consent already stored) or prompts for consent.
    otp = flow_items[-1]
    otp["event"] = [e for e in otp["event"] if e["listen"] != "test"] + [script("test", [
        "pm.test('otp submit 200', () => pm.response.to.have.status(200));",
        "const j = pm.response.json();",
        "if (j.challengeToken) pm.environment.set('challenge_token', j.challengeToken);",
        "if (j.flowStatus === 'COMPLETE') { pm.environment.set('assertion', j.assertion); pm.environment.set('consent_prompt', '[]'); }",
        "else {",
        "  if (j.data && j.data.actions && j.data.actions[0]) pm.environment.set('action_ref', j.data.actions[0].ref);",
        "  pm.environment.set('consent_prompt', (j.data && j.data.additionalData && j.data.additionalData.consentPrompt) || '[]');",
        "}",
    ])]
    callback = get("Auth callback")
    callback["name"] = "1.8 Auth callback (authorization code)"
    token = get("Exchange Code for Token")
    token["name"] = "1.9 Super app: token (authorization_code) → access_token + id_token + device_secret"
    token["event"] = [e for e in token["event"] if e["listen"] != "test"] + [script("test", [
        "pm.test('token 200', () => pm.response.to.have.status(200));",
        "const t = pm.response.json();",
        "pm.environment.set('access_token', t.access_token);",
        "pm.environment.set('id_token', t.id_token);",
        "pm.environment.set('device_secret', t.device_secret);",
        "pm.test('device_secret issued (JWE, 5 segments)', () => pm.expect(t.device_secret.split('.').length).to.eql(5));",
        "function payload(jwt) { return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }",
        "const id = payload(t.id_token);",
        "pm.test('id_token carries sid', () => pm.expect(id.sid).to.be.a('string').and.not.empty);",
        "pm.environment.set('sid', id.sid);",
        "crypto.subtle.digest('SHA-256', new TextEncoder().encode(t.device_secret)).then(h => {",
        "  const dsHash = btoa(String.fromCharCode(...new Uint8Array(h))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');",
        "  pm.test('id_token ds_hash = SHA-256(device_secret)', () => pm.expect(id.ds_hash).to.eql(dsHash));",
        "});",
        "const at = payload(t.access_token);",
        "pm.test('access token bound to Key A (cnf.jkt)', () => pm.expect(at.cnf.jkt).to.eql(pm.environment.get('dpop_jkt')));",
    ])]
    super_userinfo = get("Exchange Token for Userinfo")
    super_userinfo["name"] = "1.10 Super app: userinfo"
    super_folder = {"name": "1. Super app: login with device_sso", "item": [par, authorize] + flow_items + [consent, callback, token, super_userinfo]}

    # --- 2. child app ----------------------------------------------------------------------
    exchange = form_request(
        "2.1 Child app: token exchange (silent sign-in)", "{{baseUrl}}/oauth2/token", exchange_fields("openid email"),
        prerequest=exchange_prerequest("child_client_private_key", "child_client_id"),
        tests=[
            "pm.test('exchange 200', () => pm.response.to.have.status(200));",
            "const t = pm.response.json();",
            "pm.environment.set('child_access_token', t.access_token);",
            "pm.test('DPoP-bound access token', () => pm.expect(t.token_type).to.eql('DPoP'));",
            "pm.test('no device_secret on an exchange', () => pm.expect(t.device_secret).to.be.undefined);",
            "const at = JSON.parse(atob(t.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));",
            "pm.test('act.sub is the super app', () => pm.expect(at.act.sub).to.eql(pm.environment.get('client_id')));",
            "pm.test('bound to Key A', () => pm.expect(at.cnf.jkt).to.eql(pm.environment.get('dpop_jkt')));",
        ],
        description="The child app presents the super app's id_token (subject) and device_secret (actor) with a DPoP proof "
                    "signed by Key A, which the super app produced for it over IPC. The requested scope is a subset of the "
                    "super app's grant and is covered by the user's consent, so no interaction is needed.",
    )
    child_userinfo = form_request("2.2 Child app: userinfo with the exchanged token", "{{baseUrl}}/oauth2/userinfo", [],
                                  prerequest=userinfo_prerequest("child_access_token"),
                                  tests=["pm.test('userinfo 200', () => pm.response.to.have.status(200));",
                                         "console.log('child userinfo:', pm.response.text());"])
    child_userinfo["request"]["method"] = "GET"
    child_userinfo["request"]["body"] = None
    reuse = form_request("2.3 Child app: a second exchange reuses the same device secret", "{{baseUrl}}/oauth2/token",
                         exchange_fields("openid"), prerequest=exchange_prerequest("child_client_private_key", "child_client_id"),
                         tests=["pm.test('exchange 200', () => pm.response.to.have.status(200));"])
    child_folder = {"name": "2. Child app: silent sign-in via token exchange", "item": [exchange, child_userinfo, reuse]}

    # --- 3. negative tests -----------------------------------------------------------------
    neg = []
    neg.append(form_request("3.1 Scope escalation: phone was never granted (task 10.a)", "{{baseUrl}}/oauth2/token",
                            exchange_fields("openid phone"), prerequest=exchange_prerequest("child_client_private_key", "child_client_id"),
                            tests=expect_error("invalid_scope", "exceeds")))
    neg.append(form_request("3.2 device_sso on a token exchange (task 10.b)", "{{baseUrl}}/oauth2/token",
                            exchange_fields("openid device_sso"), prerequest=exchange_prerequest("child_client_private_key", "child_client_id"),
                            tests=expect_error("invalid_scope", "device_sso")))
    neg.append(form_request("3.3 Another vendor cannot redeem the secret", "{{baseUrl}}/oauth2/token",
                            exchange_fields("openid", client_id="{{other_client_id}}"),
                            prerequest=exchange_prerequest("other_client_private_key", "other_client_id"),
                            tests=expect_error("invalid_grant", "vendor")))
    wrong_key = form_request("3.4 DPoP proof from a different key than cnf.jkt", "{{baseUrl}}/oauth2/token",
                             exchange_fields("openid"),
                             prerequest=JS_HELPERS + [
                                 "await (async () => {",
                                 "  const kp = await crypto.subtle.generateKey({ name: 'RSA-PSS', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);",
                                 "  const priv = JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey)), pub = JSON.stringify(await crypto.subtle.exportKey('jwk', kp.publicKey));",
                                 "  pm.request.headers.upsert({ key: 'DPoP', value: await dpopProof(priv, pub, 'POST', `${pm.environment.get('baseUrl')}/oauth2/token`) });",
                                 "  pm.collectionVariables.set('child_client_assertion', await clientAssertion(pm.environment.get('child_client_private_key'), pm.environment.get('child_client_id')));",
                                 "})();",
                             ],
                             tests=expect_error("invalid_grant", "thumbprint"))
    neg.append(wrong_key)
    tampered = form_request("3.5 Tampered device secret", "{{baseUrl}}/oauth2/token",
                            exchange_fields("openid", actor="{{tampered_device_secret}}"),
                            prerequest=exchange_prerequest("child_client_private_key", "child_client_id") + [
                                "const ds = pm.environment.get('device_secret'); pm.environment.set('tampered_device_secret', ds.slice(0, -2) + 'xx');"],
                            tests=expect_error("invalid_grant", "decrypt"))
    neg.append(tampered)
    neg.append(form_request("3.6 Bonus: profile needs picture, never consented → interaction_required", "{{baseUrl}}/oauth2/token",
                            exchange_fields("openid profile"), prerequest=exchange_prerequest("child_client_private_key", "child_client_id"),
                            tests=expect_error("interaction_required", "picture")))
    neg_folder = {"name": "3. Security and consent checks", "item": neg}

    # --- 0. discovery ------------------------------------------------------------------------
    discovery = {
        "name": "0.1 Discovery advertises token exchange and device_sso",
        "request": {"method": "GET", "header": [], "url": {"raw": "{{baseUrl}}/.well-known/openid-configuration",
                                                           "host": ["{{baseUrl}}"], "path": [".well-known", "openid-configuration"]}},
        "event": [script("test", [
            "const d = pm.response.json();",
            "pm.test('token exchange grant', () => pm.expect(d.grant_types_supported).to.include('urn:ietf:params:oauth:grant-type:token-exchange'));",
            "pm.test('device_sso scope', () => pm.expect(d.scopes_supported).to.include('device_sso'));",
        ])],
    }
    setup_folder = {"name": "0. Setup", "item": [discovery],
                    "description": "Register the demo clients first: `python3 mobile-sample/scripts/register_clients.py` (keys in the environment match)."}

    collection = {
        "info": {
            "_postman_id": str(uuid.uuid4()),
            "name": "MOSIP eSignet (Go) — Native SSO for Mobile Apps",
            "description": "OpenID Connect Native SSO for Mobile Apps on eSignet (Go) + ThunderID: super app login with device_sso, "
                           "child app silent sign-in by RFC 8693 token exchange, and the security/consent checks. "
                           "Run top to bottom with the matching environment against a local eSignet (docker-compose + make.sh run). "
                           "Keys (client assertions, DPoP Key A) are generated in pre-request scripts with WebCrypto.",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "item": [setup_folder, super_folder, child_folder, neg_folder],
        "variable": [{"key": "par_client_assertion", "value": ""}, {"key": "client_assertion", "value": ""},
                     {"key": "child_client_assertion", "value": ""}],
    }

    keys = {k: private_jwk(v) for k, v in KEYS.items()}
    env_values = [
        ("baseUrl", "http://localhost:8088"),
        ("par_audience", "http://localhost:8088"), ("audience", "http://localhost:8088"),
        ("userinfo_audience", "http://localhost:8088/oauth2/userinfo"),
        ("client_id", CLIENT_IDS["super"]), ("client_private_key", json.dumps(keys["super"])),
        ("client_public_key", json.dumps(public_jwk(keys["super"]))),
        ("child_client_id", CLIENT_IDS["child"]), ("child_client_private_key", json.dumps(keys["child"])),
        ("other_client_id", CLIENT_IDS["other"]), ("other_client_private_key", json.dumps(keys["other"])),
        ("redirect_uri", "org.mosip.superapp://callback"),
        ("super_scope", "openid profile email device_sso"),
        ("scope", "openid profile email device_sso"),
        ("individual_id", "1774231323"), ("otp", "111111"),
        ("mock_identity_system_url", "http://localhost:8082"),
    ]
    env = {"id": str(uuid.uuid4()), "name": "MOSIP eSignet Native SSO (local)",
           "values": [{"key": k, "value": v, "enabled": True} for k, v in env_values]}
    with open(OUT_COLLECTION, "w") as fh:
        json.dump(collection, fh, indent=2)
    with open(OUT_ENV, "w") as fh:
        json.dump(env, fh, indent=2)
    print(f"wrote {os.path.relpath(OUT_COLLECTION, ROOT)} and {os.path.relpath(OUT_ENV, ROOT)}")


if __name__ == "__main__":
    main()
