package org.mosip.nativesso

import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.Security
import java.security.Signature
import java.security.interfaces.RSAPublicKey
import java.security.spec.MGF1ParameterSpec
import java.security.spec.PSSParameterSpec
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class IdTokenVerifierTest {
    private val issuer = "http://localhost:8088"
    private val clientId = "mosip-super-app"
    private val now = 1_800_000_000L
    private val keyPair = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
    private val jwks: JSONObject

    init {
        Security.addProvider(BouncyCastleProvider())
        val pub = keyPair.public as RSAPublicKey
        jwks = JSONObject().put("keys", JSONArray().put(JSONObject()
            .put("kty", "RSA").put("kid", "k1").put("use", "sig")
            .put("n", Codec.b64url(Codec.unsignedBytes(pub.modulus, 256)))
            .put("e", Codec.b64url(pub.publicExponent.toByteArray().let { if (it[0] == 0.toByte()) it.copyOfRange(1, it.size) else it }))))
    }

    private fun token(alg: String = "PS256", kid: String = "k1", mutate: (JSONObject) -> Unit = {}): String {
        val header = JSONObject().put("alg", alg).put("kid", kid).put("typ", "JWT")
        val payload = JSONObject().put("iss", issuer).put("aud", clientId).put("sub", "u1").put("nonce", "n1")
            .put("iat", now - 10).put("exp", now + 120)
        mutate(payload)
        val input = Codec.b64url(header.toString()) + "." + Codec.b64url(payload.toString())
        val sig = when (alg) {
            "PS256" -> Signature.getInstance("SHA256withRSA/PSS", "BC").apply {
                setParameter(PSSParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, 32, 1)) }
            else -> Signature.getInstance("SHA256withRSA")
        }.apply { initSign(keyPair.private); update(input.toByteArray()) }.sign()
        return "$input." + Codec.b64url(sig)
    }

    private fun verifier() = IdTokenVerifier(issuer, clientId, jwks, now = { now })

    @Test fun `accepts a valid PS256 token`() { assertEquals("u1", verifier().verify(token(), "n1").getString("sub")) }
    @Test fun `accepts a valid RS256 token`() { assertEquals("u1", verifier().verify(token("RS256"), "n1").getString("sub")) }
    @Test fun `rejects a tampered payload`() {
        val t = token(); val parts = t.split(".")
        val forged = parts[0] + "." + Codec.b64url(JSONObject().put("iss", issuer).put("aud", clientId).put("sub", "attacker")
            .put("exp", now + 120).put("nonce", "n1").toString()) + "." + parts[2]
        assertEquals("signature invalid", assertFailsWith<OAuthException> { verifier().verify(forged, "n1") }.description)
    }
    @Test fun `rejects a wrong issuer`() {
        assertEquals("issuer mismatch", assertFailsWith<OAuthException> { verifier().verify(token { it.put("iss", "http://evil") }, "n1") }.description)
    }
    @Test fun `rejects a wrong audience`() {
        assertEquals("audience mismatch", assertFailsWith<OAuthException> { verifier().verify(token { it.put("aud", "other") }, "n1") }.description)
    }
    @Test fun `rejects an expired token`() {
        assertEquals("expired", assertFailsWith<OAuthException> { verifier().verify(token { it.put("exp", now - 500) }, "n1") }.description)
    }
    @Test fun `rejects a nonce mismatch`() {
        assertEquals("nonce mismatch", assertFailsWith<OAuthException> { verifier().verify(token(), "other") }.description)
    }
    @Test fun `rejects an unknown kid`() {
        val d = assertFailsWith<OAuthException> { verifier().verify(token(kid = "k2"), "n1") }.description.orEmpty()
        assert(d.startsWith("no JWK")) { d }
    }
}
