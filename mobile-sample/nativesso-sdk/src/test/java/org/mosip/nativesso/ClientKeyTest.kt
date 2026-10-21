package org.mosip.nativesso

import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.security.interfaces.RSAPublicKey
import java.security.spec.MGF1ParameterSpec
import java.security.spec.PSSParameterSpec
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ClientKeyTest {
    init {
        // ClientKey uses Android's algorithm name "SHA256withRSA/PSS"; provide it on the JVM via BouncyCastle.
        if (java.security.Security.getProvider("BC") == null) java.security.Security.addProvider(org.bouncycastle.jce.provider.BouncyCastleProvider())
    }

    private val b64 = Base64.getUrlEncoder().withoutPadding()

    private fun unsigned(v: java.math.BigInteger): ByteArray {
        val raw = v.toByteArray()
        return if (raw[0].toInt() == 0) raw.copyOfRange(1, raw.size) else raw
    }

    @Test
    fun keyIdAndAssertion() {
        val kp = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
        val pub = kp.public as RSAPublicKey
        val pem = "-----BEGIN PRIVATE KEY-----\n" +
            Base64.getMimeEncoder(64, "\n".toByteArray()).encodeToString(kp.private.encoded) +
            "\n-----END PRIVATE KEY-----\n"

        val key = ClientKey(pem)

        val n = b64.encodeToString(unsigned(pub.modulus))
        val e = b64.encodeToString(unsigned(pub.publicExponent))
        val thumb = b64.encodeToString(
            MessageDigest.getInstance("SHA-256").digest("""{"e":"$e","kty":"RSA","n":"$n"}""".toByteArray())
        )
        assertEquals(thumb, key.keyId)

        val jwt = key.clientAssertion("client-1", "https://issuer.example", 60)
        val parts = jwt.split(".")
        assertEquals(3, parts.size)
        val dec = Base64.getUrlDecoder()
        val header = JSONObject(String(dec.decode(parts[0]), StandardCharsets.UTF_8))
        val payload = JSONObject(String(dec.decode(parts[1]), StandardCharsets.UTF_8))
        assertEquals("PS256", header.getString("alg"))
        assertEquals(key.keyId, header.getString("kid"))
        assertEquals("client-1", payload.getString("iss"))
        assertEquals("client-1", payload.getString("sub"))
        assertEquals("https://issuer.example", payload.getString("aud"))
        assertTrue(payload.getLong("exp") > payload.getLong("iat"))
        assertEquals(60, payload.getLong("exp") - payload.getLong("iat"))

        val ok = Signature.getInstance("RSASSA-PSS").run {
            setParameter(PSSParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, 32, 1))
            initVerify(kp.public)
            update("${parts[0]}.${parts[1]}".toByteArray())
            verify(dec.decode(parts[2]))
        }
        assertTrue(ok)
    }
}
