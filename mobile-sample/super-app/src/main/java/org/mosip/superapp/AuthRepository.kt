package org.mosip.superapp

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import org.mosip.nativesso.ClientKey
import org.mosip.nativesso.Codec
import org.mosip.nativesso.EsignetClient
import org.mosip.nativesso.KeystoreDpopSigner
import org.mosip.nativesso.PendingAuthorization
import org.mosip.nativesso.SessionStore
import org.mosip.nativesso.TokenSet

/**
 * The super app's authentication state: Key A, the OIDC client and the encrypted session store.
 * The sign-in asks for `device_sso`, so the token response carries a device secret bound to Key A.
 */
class AuthRepository private constructor(context: Context) {

    val dpop = KeystoreDpopSigner()
    val store = SessionStore(context, "super_app_session")
    val client = EsignetClient(
        baseUrl = BuildConfig.ESIGNET_BASE_URL,
        clientId = BuildConfig.CLIENT_ID,
        clientKey = ClientKey(context.resources.openRawResource(R.raw.client_private_key).bufferedReader().readText()),
        dpop = dpop,
    )

    companion object {
        const val SCOPE = "openid profile email ${EsignetClient.SCOPE_DEVICE_SSO}"

        @Volatile private var instance: AuthRepository? = null
        fun get(context: Context): AuthRepository =
            instance ?: synchronized(this) { instance ?: AuthRepository(context.applicationContext).also { instance = it } }
    }

    val tokens: TokenSet? get() = store.tokens
    val isSignedIn: Boolean get() = store.tokens?.deviceSecret != null

    /**
     * True for the eSignet endpoints a sibling may need a Key A proof for: `POST` PAR (its
     * interactive fallback binds the code to Key A with `dpop_jkt`), `POST` token and `GET` userinfo.
     */
    fun isEsignetEndpoint(htm: String, htu: String): Boolean {
        val d = client.discover()
        return (htm == "POST" && (htu == d.tokenEndpoint || htu == d.parEndpoint)) ||
            (htm == "GET" && htu == d.userinfoEndpoint)
    }

    /** Starts a PAR + PKCE + DPoP authorization and returns the browser URL. */
    fun beginSignIn(): Uri {
        val claims = JSONObject().put("userinfo", JSONObject()
            .put("name", JSONObject().put("essential", true))
            .put("email", JSONObject().put("essential", false))
            .put("picture", JSONObject.NULL))
        val (url, pending) = client.beginAuthorization(SCOPE, BuildConfig.REDIRECT_URI, claims)
        store.pending = pending
        return url
    }

    /** Completes the sign-in from the redirect: validates state, redeems the code, stores the tokens. */
    fun completeSignIn(redirect: Uri): TokenSet {
        val pending: PendingAuthorization = store.pending ?: throw IllegalStateException("No sign-in in progress")
        redirect.getQueryParameter("error")?.let { err ->
            throw IllegalStateException("$err: ${redirect.getQueryParameter("error_description")}")
        }
        if (redirect.getQueryParameter("state") != pending.state) throw IllegalStateException("state mismatch")
        val code = redirect.getQueryParameter("code") ?: throw IllegalStateException("missing code")
        val tokens = client.redeemCode(code, pending)
        store.pending = null
        store.tokens = tokens
        return tokens
    }

    fun fetchUserInfo(): JSONObject {
        val t = store.tokens ?: throw IllegalStateException("not signed in")
        return client.userInfo(t.accessToken).also { store.userInfo = it }
    }

    fun signOut() = store.clear()

    /** Rows (label, value, monospace) describing the Native SSO binding, for the demo screen. */
    fun bindingDetails(): List<Triple<String, String, Boolean>> {
        val rows = mutableListOf(
            Triple("Client", BuildConfig.CLIENT_ID, false),
            Triple("eSignet", BuildConfig.ESIGNET_BASE_URL, false),
            Triple("Key A (hardware DPoP key) thumbprint", dpop.thumbprint(), true),
            Triple("Key A security level", runCatching { dpop.securityLevel() }.getOrDefault("unknown"), false),
        )
        val t = store.tokens ?: return rows + Triple("Session", "No session: sign in to receive a device secret", false)
        val id = t.idToken?.let { runCatching { Codec.jwtPayload(it) }.getOrNull() }
        val dsHash = t.deviceSecret?.let { Codec.hashB64url(it) }
        rows += Triple("Token type · scope", "${t.tokenType} · ${t.scope}", false)
        rows += Triple("Session id (sid, shared with the device secret)", id?.optString("sid") ?: "", true)
        rows += Triple("ds_hash in id_token", id?.optString("ds_hash") ?: "", true)
        rows += Triple("SHA-256 of stored device_secret", dsHash ?: "", true)
        rows += Triple("Binding check", if (dsHash != null && dsHash == id?.optString("ds_hash")) "✓ id_token is bound to this device secret" else "✗ mismatch", false)
        rows += Triple("Device secret", "Encrypted JWE, ${t.deviceSecret?.length ?: 0} chars, opaque to this app", false)
        return rows
    }
}
