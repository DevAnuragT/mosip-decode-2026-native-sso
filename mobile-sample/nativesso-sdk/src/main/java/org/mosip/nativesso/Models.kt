package org.mosip.nativesso

import org.json.JSONObject

/** Endpoints read from `/.well-known/openid-configuration`. */
data class OidcDiscovery(
    val issuer: String,
    val authorizationEndpoint: String,
    val parEndpoint: String,
    val tokenEndpoint: String,
    val userinfoEndpoint: String,
    val jwksUri: String,
    val grantTypesSupported: List<String>,
    val scopesSupported: List<String>,
) {
    companion object {
        fun from(json: JSONObject) = OidcDiscovery(
            issuer = json.getString("issuer"),
            jwksUri = json.getString("jwks_uri"),
            authorizationEndpoint = json.getString("authorization_endpoint"),
            parEndpoint = json.getString("pushed_authorization_request_endpoint"),
            tokenEndpoint = json.getString("token_endpoint"),
            userinfoEndpoint = json.getString("userinfo_endpoint"),
            grantTypesSupported = json.optJSONArray("grant_types_supported")?.let { a -> List(a.length()) { a.getString(it) } } ?: emptyList(),
            scopesSupported = json.optJSONArray("scopes_supported")?.let { a -> List(a.length()) { a.getString(it) } } ?: emptyList(),
        )
    }
}

/** What the token endpoint returned. [deviceSecret] is only present on a `device_sso` grant. */
data class TokenSet(
    val accessToken: String,
    val tokenType: String,
    val expiresIn: Long,
    val scope: String?,
    val idToken: String?,
    val deviceSecret: String?,
    val issuedAtMillis: Long = System.currentTimeMillis(),
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("access_token", accessToken)
        put("token_type", tokenType)
        put("expires_in", expiresIn)
        put("scope", scope)
        put("id_token", idToken)
        put("device_secret", deviceSecret)
        put("issued_at", issuedAtMillis)
    }

    companion object {
        fun from(json: JSONObject) = TokenSet(
            accessToken = json.getString("access_token"),
            tokenType = json.optString("token_type", "DPoP"),
            expiresIn = json.optLong("expires_in", 0),
            scope = json.optString("scope").takeIf { it.isNotEmpty() },
            idToken = json.optString("id_token").takeIf { it.isNotEmpty() },
            deviceSecret = json.optString("device_secret").takeIf { it.isNotEmpty() },
            issuedAtMillis = json.optLong("issued_at", System.currentTimeMillis()),
        )
    }
}

/** An OAuth 2.0 error response (RFC 6749 §5.2) with the HTTP status it came with. */
class OAuthException(val error: String, val description: String?, val status: Int) :
    Exception("$error${description?.let { ": $it" } ?: ""} (HTTP $status)") {

    /** The exchange needs the user: the consent given to the super app does not cover this app. */
    val interactionRequired: Boolean get() = error == "interaction_required" || error == "consent_required"
}

/** A pending interactive authorization: what the app must remember until the redirect returns. */
data class PendingAuthorization(
    val state: String,
    val nonce: String,
    val codeVerifier: String,
    val redirectUri: String,
    val scope: String,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("state", state); put("nonce", nonce); put("code_verifier", codeVerifier)
        put("redirect_uri", redirectUri); put("scope", scope)
    }

    companion object {
        fun from(json: JSONObject) = PendingAuthorization(
            json.getString("state"), json.getString("nonce"), json.getString("code_verifier"),
            json.getString("redirect_uri"), json.getString("scope"),
        )
    }
}
