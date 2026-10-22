package org.mosip.nativesso

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import org.json.JSONObject
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.util.UUID

/**
 * Produces RFC 9449 DPoP proofs. The super app signs with Key A held in the Android Keystore;
 * a child app obtains proofs from the super app over IPC (see [NativeSsoContract]), so the
 * same key binds every token in the vendor family and the private key never leaves the super app.
 */
interface DpopSigner {
    /** RFC 7638 JWK thumbprint of the signing key (`cnf.jkt`, `dpop_jkt`). */
    fun thumbprint(): String

    /**
     * Builds a DPoP proof for an HTTP request. [accessToken] adds the `ath` claim for resource
     * requests; [nonce] echoes a server-provided DPoP nonce.
     */
    fun proof(htm: String, htu: String, accessToken: String? = null, nonce: String? = null): String
}

/** Key A: a hardware-backed EC P-256 key pair owned by the super app. */
class KeystoreDpopSigner(private val alias: String = DEFAULT_ALIAS) : DpopSigner {

    companion object {
        const val DEFAULT_ALIAS = "mosip_native_sso_key_a"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    }

    init {
        ensureKey()
    }

    private fun ensureKey() {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        if (ks.containsAlias(alias)) return
        // Prefer the StrongBox secure element (PS task 4.a.i); fall back to the TEE-backed keystore on
        // devices without one. Either way the private key is non-exportable.
        try {
            generate(strongBox = true)
        } catch (e: Exception) {
            if (e !is android.security.keystore.StrongBoxUnavailableException &&
                e.cause !is android.security.keystore.StrongBoxUnavailableException) throw e
            generate(strongBox = false)
        }
    }

    private fun generate(strongBox: Boolean) {
        val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
            .setAlgorithmParameterSpec(java.security.spec.ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            // Silent SSO must work without a user-presence prompt in the child app.
            .setUserAuthenticationRequired(false)
            .setIsStrongBoxBacked(strongBox)
            .build()
        KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE).run {
            initialize(spec)
            generateKeyPair()
        }
    }

    /** Where Key A lives: "StrongBox", "TEE" or "software" (shown on the Wallet's details card). */
    fun securityLevel(): String {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val key = ks.getKey(alias, null) ?: return "unknown"
        val factory = java.security.KeyFactory.getInstance(key.algorithm, ANDROID_KEYSTORE)
        val info = factory.getKeySpec(key, android.security.keystore.KeyInfo::class.java)
        return when {
            android.os.Build.VERSION.SDK_INT >= 31 -> when (info.securityLevel) {
                KeyProperties.SECURITY_LEVEL_STRONGBOX -> "StrongBox"
                KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "TEE"
                else -> "software"
            }
            @Suppress("DEPRECATION")
            info.isInsideSecureHardware -> "TEE"
            else -> "software"
        }
    }

    private fun privateKey(): PrivateKey {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        return ks.getKey(alias, null) as PrivateKey
    }

    /** Public JWK of Key A (members in RFC 7638 canonical order). */
    fun publicJwk(): JSONObject {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val pub = ks.getCertificate(alias).publicKey as ECPublicKey
        return JSONObject().apply {
            put("crv", "P-256")
            put("kty", "EC")
            put("x", Codec.b64url(Codec.unsignedBytes(pub.w.affineX, 32)))
            put("y", Codec.b64url(Codec.unsignedBytes(pub.w.affineY, 32)))
        }
    }

    override fun thumbprint(): String {
        val jwk = publicJwk()
        val canonical = """{"crv":"${jwk.getString("crv")}","kty":"${jwk.getString("kty")}","x":"${jwk.getString("x")}","y":"${jwk.getString("y")}"}"""
        return Codec.hashB64url(canonical)
    }

    override fun proof(htm: String, htu: String, accessToken: String?, nonce: String?): String {
        val header = JSONObject().apply {
            put("typ", "dpop+jwt")
            put("alg", "ES256")
            put("jwk", publicJwk())
        }
        val payload = JSONObject().apply {
            put("jti", UUID.randomUUID().toString())
            put("htm", htm.uppercase())
            put("htu", htu.substringBefore("?").substringBefore("#"))
            put("iat", System.currentTimeMillis() / 1000)
            if (accessToken != null) put("ath", Codec.hashB64url(accessToken))
            if (nonce != null) put("nonce", nonce)
        }
        val signingInput = "${Codec.b64url(header.toString())}.${Codec.b64url(payload.toString())}"
        val der = Signature.getInstance("SHA256withECDSA").run {
            initSign(privateKey())
            update(signingInput.toByteArray())
            sign()
        }
        return "$signingInput.${Codec.b64url(Codec.derToJose(der, 32))}"
    }
}
