package org.mosip.nativesso

import android.util.Base64
import org.json.JSONObject
import java.math.BigInteger
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom

/** Base64url, hashing and JSON helpers shared by the SDK. */
object Codec {
    private const val B64 = Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP

    fun b64url(bytes: ByteArray): String = Base64.encodeToString(bytes, B64)
    fun b64url(text: String): String = b64url(text.toByteArray(StandardCharsets.UTF_8))
    fun b64urlDecode(text: String): ByteArray = Base64.decode(text, B64)

    fun sha256(bytes: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(bytes)
    fun sha256(text: String): ByteArray = sha256(text.toByteArray(StandardCharsets.UTF_8))

    /** Hash used by DPoP `ath` and the ID token's `ds_hash`: BASE64URL(SHA-256(value)). */
    fun hashB64url(value: String): String = b64url(sha256(value))

    fun randomB64url(bytes: Int = 32): String {
        val buf = ByteArray(bytes)
        SecureRandom().nextBytes(buf)
        return b64url(buf)
    }

    /** Big-endian unsigned bytes of [value] left-padded to [length] (for EC coordinates). */
    fun unsignedBytes(value: BigInteger, length: Int): ByteArray {
        val raw = value.toByteArray()
        val out = ByteArray(length)
        val src = if (raw.size > length && raw[0].toInt() == 0) 1 else 0
        val copy = minOf(raw.size - src, length)
        System.arraycopy(raw, src, out, length - copy, copy)
        return out
    }

    /** Decodes the payload of a compact JWS without verifying it (for display and `ds_hash`/`sid` checks). */
    fun jwtPayload(jwt: String): JSONObject {
        val parts = jwt.split(".")
        require(parts.size == 3) { "not a compact JWS" }
        return JSONObject(String(b64urlDecode(parts[1]), StandardCharsets.UTF_8))
    }

    /** Converts an ASN.1 DER ECDSA signature to the raw R||S form JOSE expects. */
    fun derToJose(der: ByteArray, partLength: Int): ByteArray {
        var offset = 2
        if (der[1].toInt() and 0x80 != 0) offset += der[1].toInt() and 0x7f
        require(der[offset].toInt() == 0x02) { "malformed DER signature" }
        val rLen = der[offset + 1].toInt()
        val r = der.copyOfRange(offset + 2, offset + 2 + rLen)
        offset += 2 + rLen
        require(der[offset].toInt() == 0x02) { "malformed DER signature" }
        val sLen = der[offset + 1].toInt()
        val s = der.copyOfRange(offset + 2, offset + 2 + sLen)
        val out = ByteArray(partLength * 2)
        System.arraycopy(unsignedBytes(BigInteger(1, r), partLength), 0, out, 0, partLength)
        System.arraycopy(unsignedBytes(BigInteger(1, s), partLength), 0, out, partLength, partLength)
        return out
    }
}
