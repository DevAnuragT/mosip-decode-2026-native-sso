package org.mosip.nativesso

import org.json.JSONObject
import java.security.KeyFactory
import java.security.PrivateKey
import java.security.Signature
import java.security.interfaces.RSAPrivateCrtKey
import java.security.spec.MGF1ParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.PSSParameterSpec
import java.util.UUID

/**
 * The OIDC client's own RSA key, used for `private_key_jwt` client authentication (the only
 * client authentication method eSignet accepts). The reference apps bundle a PKCS#8 PEM generated
 * by `scripts/register-clients.py`; a production app keeps this key in hardware or on its backend.
 */
class ClientKey(pkcs8Pem: String) {

    private val privateKey: PrivateKey

    /** RFC 7638 thumbprint of the public key: the `kid` the client was registered with. */
    val keyId: String

    init {
        val der = Codec.b64urlDecode(
            pkcs8Pem.lineSequence()
                .filterNot { it.startsWith("-----") }
                .joinToString("")
                .replace('+', '-').replace('/', '_').trimEnd('=')
        )
        privateKey = KeyFactory.getInstance("RSA").generatePrivate(PKCS8EncodedKeySpec(der))
        val crt = privateKey as RSAPrivateCrtKey
        val n = Codec.b64url(Codec.unsignedBytes(crt.modulus, (crt.modulus.bitLength() + 7) / 8))
        val e = Codec.b64url(Codec.unsignedBytes(crt.publicExponent, (crt.publicExponent.bitLength() + 7) / 8))
        keyId = Codec.hashB64url("""{"e":"$e","kty":"RSA","n":"$n"}""")
    }

    /**
     * PS256 client assertion (RFC 7523). Per FAPI 2.0 §5.3.2.1 [audience] is the issuer. eSignet's
     * FAPI 2.0 profile accepts PS256/ES256/ES256K/EdDSA for private_key_jwt, not RS256.
     */
    fun clientAssertion(clientId: String, audience: String, lifetimeSeconds: Long = 120): String {
        val now = System.currentTimeMillis() / 1000
        val header = JSONObject().apply {
            put("alg", "PS256")
            put("typ", "JWT")
            put("kid", keyId)
        }
        val payload = JSONObject().apply {
            put("iss", clientId)
            put("sub", clientId)
            put("aud", audience)
            put("iat", now)
            put("nbf", now)
            put("exp", now + lifetimeSeconds)
            put("jti", UUID.randomUUID().toString())
        }
        val signingInput = "${Codec.b64url(header.toString())}.${Codec.b64url(payload.toString())}"
        val sig = Signature.getInstance("SHA256withRSA/PSS").run {
            setParameter(PSSParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, 32, 1))
            initSign(privateKey)
            update(signingInput.toByteArray())
            sign()
        }
        return "$signingInput.${Codec.b64url(sig)}"
    }
}
