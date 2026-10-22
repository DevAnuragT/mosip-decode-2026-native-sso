package org.mosip.nativesso

import org.json.JSONObject
import java.math.BigInteger
import java.nio.charset.StandardCharsets
import java.security.KeyFactory
import java.security.PublicKey
import java.security.Signature
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import java.security.spec.MGF1ParameterSpec
import java.security.spec.PSSParameterSpec
import java.security.spec.RSAPublicKeySpec

/**
 * Validates an ID token the way OpenID Connect Core §3.1.3.7 asks a native client to: JWS
 * signature against the issuer's JWKS, `iss`, `aud` (this client), `exp` and `nonce`.
 * [jwks] is the parsed `jwks_uri` document; the caller fetches it (and may cache it).
 */
class IdTokenVerifier(private val issuer: String, private val clientId: String, private val jwks: JSONObject,
                      private val clockSkewSeconds: Long = 120, private val now: () -> Long = { System.currentTimeMillis() / 1000 }) {

    /** Returns the verified payload or throws [OAuthException] with `invalid_id_token`. */
    fun verify(idToken: String, expectedNonce: String? = null): JSONObject {
        val parts = idToken.split(".")
        if (parts.size != 3) fail("not a compact JWS")
        val header = JSONObject(String(Codec.b64urlDecode(parts[0]), StandardCharsets.UTF_8))
        val payload = JSONObject(String(Codec.b64urlDecode(parts[1]), StandardCharsets.UTF_8))
        val alg = header.optString("alg")
        val key = findKey(header.optString("kid"), alg) ?: fail("no JWK for kid=${header.optString("kid")} alg=$alg")
        if (!verifySignature(alg, key, "${parts[0]}.${parts[1]}", Codec.b64urlDecode(parts[2]))) fail("signature invalid")
        if (payload.optString("iss") != issuer) fail("issuer mismatch")
        if (!audiences(payload).contains(clientId)) fail("audience mismatch")
        val exp = payload.optLong("exp", 0)
        if (exp == 0L || exp + clockSkewSeconds < now()) fail("expired")
        val iat = payload.optLong("iat", 0)
        if (iat != 0L && iat - clockSkewSeconds > now()) fail("issued in the future")
        if (expectedNonce != null && payload.optString("nonce") != expectedNonce) fail("nonce mismatch")
        return payload
    }

    private fun audiences(payload: JSONObject): List<String> {
        val aud = payload.opt("aud") ?: return emptyList()
        return if (aud is org.json.JSONArray) List(aud.length()) { aud.getString(it) } else listOf(aud.toString())
    }

    private fun findKey(kid: String, alg: String): PublicKey? {
        val keys = jwks.optJSONArray("keys") ?: return null
        for (i in 0 until keys.length()) {
            val k = keys.getJSONObject(i)
            if (kid.isNotEmpty() && k.optString("kid") != kid) continue
            if (k.has("use") && k.getString("use") != "sig") continue
            return when (k.optString("kty")) {
                "RSA" -> if (alg.startsWith("RS") || alg.startsWith("PS")) rsaKey(k) else continue
                "EC" -> if (alg == "ES256") ecKey(k) else continue
                else -> continue
            }
        }
        return null
    }

    private fun rsaKey(k: JSONObject): PublicKey = KeyFactory.getInstance("RSA").generatePublic(
        RSAPublicKeySpec(BigInteger(1, Codec.b64urlDecode(k.getString("n"))), BigInteger(1, Codec.b64urlDecode(k.getString("e")))))

    private fun ecKey(k: JSONObject): PublicKey {
        val params = java.security.AlgorithmParameters.getInstance("EC").apply { init(java.security.spec.ECGenParameterSpec("secp256r1")) }
        val spec = params.getParameterSpec(java.security.spec.ECParameterSpec::class.java)
        val point = ECPoint(BigInteger(1, Codec.b64urlDecode(k.getString("x"))), BigInteger(1, Codec.b64urlDecode(k.getString("y"))))
        return KeyFactory.getInstance("EC").generatePublic(ECPublicKeySpec(point, spec))
    }

    private fun verifySignature(alg: String, key: PublicKey, signingInput: String, sig: ByteArray): Boolean {
        val verifier = when (alg) {
            "RS256" -> Signature.getInstance("SHA256withRSA")
            "PS256" -> Signature.getInstance("SHA256withRSA/PSS").apply {
                setParameter(PSSParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, 32, 1))
            }
            "ES256" -> Signature.getInstance("SHA256withECDSA")
            else -> fail("unsupported alg $alg")
        }
        verifier.initVerify(key)
        verifier.update(signingInput.toByteArray(StandardCharsets.UTF_8))
        val raw = if (alg == "ES256") joseToDer(sig) else sig
        return runCatching { verifier.verify(raw) }.getOrDefault(false)
    }

    /** Converts a JOSE R||S ECDSA signature to the DER form the JCA verifier expects. */
    private fun joseToDer(sig: ByteArray): ByteArray {
        val half = sig.size / 2
        fun int(bytes: ByteArray): ByteArray {
            val v = BigInteger(1, bytes).toByteArray()
            return byteArrayOf(0x02, v.size.toByte()) + v
        }
        val r = int(sig.copyOfRange(0, half)); val s = int(sig.copyOfRange(half, sig.size))
        return byteArrayOf(0x30, (r.size + s.size).toByte()) + r + s
    }

    private fun fail(reason: String): Nothing = throw OAuthException("invalid_id_token", reason, 200)
}
