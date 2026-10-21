package org.mosip.nativesso

import java.math.BigInteger
import java.nio.charset.StandardCharsets
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class CodecTest {
    @Test
    fun b64urlRoundTripHasNoPadding() {
        for (len in 0..9) {
            val bytes = ByteArray(len) { (it * 37 + 250).toByte() }
            val enc = Codec.b64url(bytes)
            assertFalse(enc.contains("="))
            assertFalse(enc.contains("+") || enc.contains("/"))
            assertContentEquals(bytes, Codec.b64urlDecode(enc))
        }
        assertEquals("_-8", Codec.b64url(byteArrayOf(0xff.toByte(), 0xef.toByte())))
        assertEquals(Codec.b64url("héllo".toByteArray(StandardCharsets.UTF_8)), Codec.b64url("héllo"))
    }

    @Test
    fun sha256MatchesMessageDigest() {
        val expected = MessageDigest.getInstance("SHA-256").digest("abc".toByteArray())
        assertContentEquals(expected, Codec.sha256("abc"))
        assertContentEquals(expected, Codec.sha256("abc".toByteArray()))
        assertEquals(Base64.getUrlEncoder().withoutPadding().encodeToString(expected), Codec.hashB64url("abc"))
    }

    @Test
    fun randomB64urlHasRequestedEntropy() {
        val a = Codec.randomB64url(32)
        assertEquals(32, Codec.b64urlDecode(a).size)
        assertEquals(16, Codec.b64urlDecode(Codec.randomB64url(16)).size)
        assertNotEquals(a, Codec.randomB64url(32))
    }

    @Test
    fun unsignedBytesPadsAndStripsLeadingZero() {
        assertContentEquals(byteArrayOf(0, 0, 0, 5), Codec.unsignedBytes(BigInteger.valueOf(5), 4))
        // 0x80 serialises as 00 80 in two's complement
        assertContentEquals(byteArrayOf(0x80.toByte()), Codec.unsignedBytes(BigInteger.valueOf(0x80), 1))
        assertContentEquals(byteArrayOf(0, 0x80.toByte()), Codec.unsignedBytes(BigInteger.valueOf(0x80), 2))
    }

    @Test
    fun derToJoseProducesVerifiableRawSignature() {
        val kp = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        val data = "payload".toByteArray()
        repeat(20) {
            val der = Signature.getInstance("SHA256withECDSA").run { initSign(kp.private); update(data); sign() }
            val jose = Codec.derToJose(der, 32)
            assertEquals(64, jose.size)
            val ok = Signature.getInstance("SHA256withECDSAinP1363Format").run {
                initVerify(kp.public); update(data); verify(jose)
            }
            assertTrue(ok)
        }
    }

    @Test
    fun jwtPayloadDecodesHandBuiltJws() {
        val jws = listOf(
            Codec.b64url("""{"alg":"none"}"""),
            Codec.b64url("""{"sub":"u1","sid":"s1","n":3}"""),
            Codec.b64url("sig"),
        ).joinToString(".")
        val p = Codec.jwtPayload(jws)
        assertEquals("u1", p.getString("sub"))
        assertEquals("s1", p.getString("sid"))
        assertEquals(3, p.getInt("n"))
        assertFailsWith<IllegalArgumentException> { Codec.jwtPayload("a.b") }
    }
}
