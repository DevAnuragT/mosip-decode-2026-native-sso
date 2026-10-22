package org.mosip.nativesso

import android.net.Uri
import android.util.Log
import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * A small OIDC/OAuth 2.0 client for eSignet implementing what a native app needs for Native SSO:
 * PAR + PKCE + DPoP authorization (the FAPI 2.0 profile eSignet enforces), the authorization-code
 * grant with the `device_sso` scope, and the RFC 8693 token exchange that redeems a device secret.
 */
class EsignetClient(
    private val baseUrl: String,
    private val clientId: String,
    private val clientKey: ClientKey,
    private val dpop: DpopSigner,
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build(),
) {
    companion object {
        private const val TAG = "EsignetClient"
        const val CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
        const val GRANT_TOKEN_EXCHANGE = "urn:ietf:params:oauth:grant-type:token-exchange"
        const val TOKEN_TYPE_ID_TOKEN = "urn:ietf:params:oauth:token-type:id_token"
        const val TOKEN_TYPE_DEVICE_SECRET = "urn:openid:params:token-type:device-secret"
        const val SCOPE_DEVICE_SSO = "device_sso"
    }

    @Volatile
    private var discovery: OidcDiscovery? = null

    fun discover(): OidcDiscovery {
        discovery?.let { return it }
        val req = Request.Builder().url("$baseUrl/.well-known/openid-configuration").get().build()
        http.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw OAuthException("discovery_failed", body.take(200), resp.code)
            return OidcDiscovery.from(JSONObject(body)).also { discovery = it }
        }
    }

    /**
     * Pushes the authorization request (RFC 9126) and returns the URL to open in a Custom Tab.
     * The request is bound to Key A through `dpop_jkt`, so the code can only be redeemed with a
     * DPoP proof from that key. [scope] should include `device_sso` for a super app login.
     */
    fun beginAuthorization(scope: String, redirectUri: String, claims: JSONObject? = null, prompt: String? = null): Pair<Uri, PendingAuthorization> {
        val d = discover()
        val pending = PendingAuthorization(
            state = Codec.randomB64url(16),
            nonce = Codec.randomB64url(16),
            codeVerifier = Codec.randomB64url(32),
            redirectUri = redirectUri,
            scope = scope,
        )
        val form = FormBody.Builder()
            .add("client_id", clientId)
            .add("response_type", "code")
            .add("redirect_uri", redirectUri)
            .add("scope", scope)
            .add("state", pending.state)
            .add("nonce", pending.nonce)
            .add("code_challenge", Codec.hashB64url(pending.codeVerifier))
            .add("code_challenge_method", "S256")
            .add("dpop_jkt", dpop.thumbprint())
            .add("client_assertion_type", CLIENT_ASSERTION_TYPE)
            .add("client_assertion", clientKey.clientAssertion(clientId, d.issuer))
        if (claims != null) form.add("claims", claims.toString())
        if (prompt != null) form.add("prompt", prompt)

        val req = Request.Builder().url(d.parEndpoint)
            .header("DPoP", dpop.proof("POST", d.parEndpoint))
            .post(form.build()).build()
        val json = execute(req)
        val requestUri = json.getString("request_uri")
        val url = Uri.parse(d.authorizationEndpoint).buildUpon()
            .appendQueryParameter("client_id", clientId)
            .appendQueryParameter("request_uri", requestUri)
            .build()
        return url to pending
    }

    /** Redeems the authorization code returned to [PendingAuthorization.redirectUri]. */
    fun redeemCode(code: String, pending: PendingAuthorization): TokenSet {
        val d = discover()
        val form = FormBody.Builder()
            .add("grant_type", "authorization_code")
            .add("code", code)
            .add("client_id", clientId)
            .add("redirect_uri", pending.redirectUri)
            .add("code_verifier", pending.codeVerifier)
            .add("client_assertion_type", CLIENT_ASSERTION_TYPE)
            .add("client_assertion", clientKey.clientAssertion(clientId, d.issuer))
            .build()
        val req = Request.Builder().url(d.tokenEndpoint)
            .header("DPoP", dpop.proof("POST", d.tokenEndpoint))
            .post(form).build()
        val tokens = TokenSet.from(execute(req))
        tokens.idToken?.let { verifyNonce(it, pending.nonce) }
        return tokens
    }

    /**
     * Silent sign-in (OpenID Connect Native SSO for Mobile Apps 1.0 §5): exchanges the super app's
     * ID token and device secret for this app's own access token. [dpopProof] must be signed by
     * Key A for `POST {token_endpoint}`; the super app produces it over IPC. [scope] must include
     * `openid`; the `audience` parameter is the issuer URL (Native SSO 1.0 §4.1).
     */
    fun exchangeDeviceSecret(idToken: String, deviceSecret: String, scope: String, dpopProof: String): TokenSet {
        val d = discover()
        require(!scope.split(" ").contains(SCOPE_DEVICE_SSO)) { "device_sso must not be requested on a token exchange" }
        val form = FormBody.Builder()
            .add("grant_type", GRANT_TOKEN_EXCHANGE)
            .add("client_id", clientId)
            .add("subject_token", idToken)
            .add("subject_token_type", TOKEN_TYPE_ID_TOKEN)
            .add("actor_token", deviceSecret)
            .add("actor_token_type", TOKEN_TYPE_DEVICE_SECRET)
            .add("scope", scope)
            .add("audience", d.issuer)
            .add("client_assertion_type", CLIENT_ASSERTION_TYPE)
            .add("client_assertion", clientKey.clientAssertion(clientId, d.issuer))
            .build()
        val req = Request.Builder().url(d.tokenEndpoint)
            .header("DPoP", dpopProof)
            .post(form).build()
        return TokenSet.from(execute(req))
    }

    /** Calls the userinfo endpoint with a DPoP-bound access token; [dpopProof] may come from the super app. */
    fun userInfo(accessToken: String, dpopProof: String? = null): JSONObject {
        val d = discover()
        val proof = dpopProof ?: dpop.proof("GET", d.userinfoEndpoint, accessToken)
        val req = Request.Builder().url(d.userinfoEndpoint)
            .header("Authorization", "DPoP $accessToken")
            .header("DPoP", proof)
            .get().build()
        http.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw parseError(resp, body)
            // eSignet returns userinfo as a signed (and possibly encrypted) JWT or as JSON.
            return if (body.trimStart().startsWith("{")) JSONObject(body) else Codec.jwtPayload(body)
        }
    }

    private fun verifyNonce(idToken: String, nonce: String) {
        val payload = Codec.jwtPayload(idToken)
        if (payload.optString("nonce") != nonce) throw OAuthException("invalid_id_token", "nonce mismatch", 200)
    }

    private fun execute(req: Request): JSONObject {
        http.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw parseError(resp, body)
            return JSONObject(body)
        }
    }

    private fun parseError(resp: Response, body: String): OAuthException {
        Log.w(TAG, "eSignet error ${resp.code}: $body")
        return try {
            val json = JSONObject(body)
            OAuthException(json.optString("error", "http_${resp.code}"), json.optString("error_description").ifEmpty { null }, resp.code)
        } catch (e: Exception) {
            OAuthException("http_${resp.code}", body.take(200), resp.code)
        }
    }
}
