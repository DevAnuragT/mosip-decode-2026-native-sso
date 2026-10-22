package org.mosip.nativesso

import org.json.JSONObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ModelsTest {
    @Test
    fun tokenSetRoundTrip() {
        val t = TokenSet("at", "DPoP", 300, "openid profile", "idt", "ds", 1234L)
        assertEquals(t, TokenSet.from(JSONObject(t.toJson().toString())))
    }

    @Test
    fun tokenSetOptionalFieldsAndDefaults() {
        val t = TokenSet.from(JSONObject("""{"access_token":"at"}"""))
        assertEquals("DPoP", t.tokenType)
        assertEquals(0, t.expiresIn)
        assertNull(t.scope); assertNull(t.idToken); assertNull(t.deviceSecret)
    }

    @Test
    fun pendingAuthorizationRoundTrip() {
        val p = PendingAuthorization("st", "no", "cv", "app://cb", "openid device_sso")
        assertEquals(p, PendingAuthorization.from(JSONObject(p.toJson().toString())))
    }

    @Test
    fun oauthExceptionInteractionRequired() {
        assertTrue(OAuthException("interaction_required", null, 400).interactionRequired)
        assertTrue(OAuthException("consent_required", "x", 400).interactionRequired)
        assertFalse(OAuthException("invalid_scope", "x", 400).interactionRequired)
        assertEquals("invalid_scope: bad (HTTP 400)", OAuthException("invalid_scope", "bad", 400).message)
    }

    @Test
    fun discoveryFromMinimalJson() {
        val d = OidcDiscovery.from(JSONObject("""{
            "issuer":"https://i","authorization_endpoint":"https://i/a",
            "pushed_authorization_request_endpoint":"https://i/par",
            "token_endpoint":"https://i/t","userinfo_endpoint":"https://i/u", "jwks_uri": "https://i/u/.well-known/jwks.json"}"""))
        assertEquals("https://i/par", d.parEndpoint)
        assertEquals(emptyList(), d.grantTypesSupported)
        val d2 = OidcDiscovery.from(JSONObject("""{
            "issuer":"i","authorization_endpoint":"a","pushed_authorization_request_endpoint":"p",
            "token_endpoint":"t","userinfo_endpoint":"u", "jwks_uri": "u/.well-known/jwks.json","scopes_supported":["openid","device_sso"]}"""))
        assertEquals(listOf("openid", "device_sso"), d2.scopesSupported)
    }
}
