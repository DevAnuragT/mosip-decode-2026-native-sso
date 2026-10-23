package org.mosip.childapp

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import org.mosip.nativesso.ClientKey
import org.mosip.nativesso.Codec
import org.mosip.nativesso.EsignetClient
import org.mosip.nativesso.NativeSsoContract
import org.mosip.nativesso.OAuthException
import org.mosip.nativesso.PendingAuthorization
import org.mosip.nativesso.SessionStore
import org.mosip.nativesso.TokenSet

/**
 * The child app's authentication: silent sign-in through the super app's device secret (Native
 * SSO tasks 7 and 8), with an interactive fallback when eSignet answers `interaction_required`
 * because the user never consented to what this app asks for (bonus task).
 *
 * The child app has no key of its own for DPoP: every proof is signed by the super app's Key A
 * over IPC, so its access token is bound to the same hardware key as the super app's.
 */
class ChildAuthRepository private constructor(private val context: Context) {

    val store = SessionStore(context, "child_app_session")
    private val clientKey = ClientKey(context.resources.openRawResource(R.raw.client_private_key).bufferedReader().readText())

    /** Result of a sign-in attempt, for the UI. */
    sealed class Outcome {
        data class Silent(val tokens: TokenSet, val millis: Long) : Outcome()
        data class InteractionRequired(val browserUrl: Uri, val reason: String?) : Outcome()
        data class NoSuperSession(val reason: String) : Outcome()
    }

    companion object {
        /** Default: a subset of what the wallet was granted, so consent is reused. */
        const val SCOPE_DEFAULT = "openid profile"
        /** Bonus demo: asks for a scope the wallet was never granted, so the silent path is refused. */
        const val SCOPE_EXTRA = "openid profile phone"

        @Volatile private var instance: ChildAuthRepository? = null
        fun get(context: Context): ChildAuthRepository =
            instance ?: synchronized(this) { instance ?: ChildAuthRepository(context.applicationContext).also { instance = it } }
    }

    val tokens: TokenSet? get() = store.tokens
    val isSignedIn: Boolean get() = store.tokens != null

    private var lastJkt: String? = null

    private fun client(jkt: String) = EsignetClient(
        baseUrl = BuildConfig.ESIGNET_BASE_URL,
        clientId = BuildConfig.CLIENT_ID,
        clientKey = clientKey,
        dpop = NativeSsoContract.RemoteDpopSigner(context, jkt),
    )

    /**
     * Silent SSO: fetch id_token + device_secret + a Key-A DPoP proof from the super app and
     * exchange them (RFC 8693) for this app's own DPoP-bound access token.
     */
    fun signIn(scope: String = SCOPE_DEFAULT): Outcome {
        val started = System.currentTimeMillis()
        // Discover the token endpoint before asking the super app for a proof bound to it.
        val probe = EsignetClient(BuildConfig.ESIGNET_BASE_URL, BuildConfig.CLIENT_ID, clientKey,
            NativeSsoContract.RemoteDpopSigner(context, ""))
        val discovery = probe.discover()

        val creds = try {
            NativeSsoContract.fetchCredentials(context, discovery.tokenEndpoint)
        } catch (e: NativeSsoContract.SuperAppException) {
            return Outcome.NoSuperSession(e.code)
        } catch (e: SecurityException) {
            return Outcome.NoSuperSession("permission denied: apps are not signed by the same vendor")
        } catch (e: IllegalStateException) {
            return Outcome.NoSuperSession(e.message ?: "super app unavailable")
        }
        lastJkt = creds.dpopJkt
        val esignet = client(creds.dpopJkt)
        return try {
            val tokens = esignet.exchangeDeviceSecret(creds.idToken, creds.deviceSecret, scope, creds.dpopProof)
            store.tokens = tokens
            store.userInfo = esignet.userInfo(tokens.accessToken)
            Outcome.Silent(tokens, System.currentTimeMillis() - started)
        } catch (e: OAuthException) {
            // interaction_required: the consent given to the wallet does not cover this app's claims.
            // invalid_scope: the scope exceeds what the wallet was granted (task 10.a). Both mean
            // the silent path is over and the user must consent interactively (bonus task).
            if (!e.interactionRequired && e.error != "invalid_scope") throw e
            // Ask for the claims this app needs as essential, so the consent screen presents them as
            // required rather than as voluntary toggles that default to off.
            val claims = JSONObject().put("userinfo", JSONObject().apply {
                put("name", JSONObject().put("essential", true))
                if (scope.split(" ").contains("phone")) put("phone_number", JSONObject().put("essential", true))
            })
            val (url, pending) = esignet.beginAuthorization(scope, BuildConfig.REDIRECT_URI, claims, prompt = "consent")
            store.pending = pending
            Outcome.InteractionRequired(url, e.description)
        }
    }

    /** Completes the interactive fallback from the redirect. */
    fun completeInteractive(redirect: Uri): TokenSet {
        val pending: PendingAuthorization = store.pending ?: throw IllegalStateException("No sign-in in progress")
        redirect.getQueryParameter("error")?.let { err ->
            throw IllegalStateException("$err: ${redirect.getQueryParameter("error_description")}")
        }
        if (redirect.getQueryParameter("state") != pending.state) throw IllegalStateException("state mismatch")
        val code = redirect.getQueryParameter("code") ?: throw IllegalStateException("missing code")
        val jkt = lastJkt ?: NativeSsoContract.fetchCredentials(context, "unused").dpopJkt
        val esignet = client(jkt)
        val tokens = esignet.redeemCode(code, pending)
        store.pending = null
        store.tokens = tokens
        store.userInfo = esignet.userInfo(tokens.accessToken)
        return tokens
    }

    fun signOut() = store.clear()

    /** Rows (label, value, monospace) describing the Native SSO binding, for the demo screen. */
    fun bindingDetails(): List<Triple<String, String, Boolean>> {
        val rows = mutableListOf(
            Triple("Client", BuildConfig.CLIENT_ID, false),
            Triple("eSignet", BuildConfig.ESIGNET_BASE_URL, false),
            Triple("How it works", "This app asks Vendor Wallet for its id_token, device_secret and a DPoP proof over a signature-protected IPC, then exchanges them (RFC 8693) for its own access token.", false),
        )
        val t = store.tokens ?: return rows
        val at = runCatching { Codec.jwtPayload(t.accessToken) }.getOrNull()
        rows += Triple("Token type · scope", "${t.tokenType} · ${t.scope}", false)
        rows += Triple("Actor (act.sub): the app that signed in", at?.optJSONObject("act")?.optString("sub") ?: "—", false)
        rows += Triple("Bound key (cnf.jkt) = Wallet's Key A", at?.optJSONObject("cnf")?.optString("jkt") ?: "—", true)
        rows += Triple("Device secret received on exchange", if (t.deviceSecret == null) "None: device_sso is never issued on a token exchange" else "Unexpected", false)
        return rows.map { Triple(it.first, it.second, it.third) }
    }

    fun userInfo(): JSONObject? = store.userInfo
}
