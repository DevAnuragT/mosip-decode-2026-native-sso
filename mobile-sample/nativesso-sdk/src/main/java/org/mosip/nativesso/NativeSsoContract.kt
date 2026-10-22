package org.mosip.nativesso

import android.content.Context
import android.net.Uri
import android.os.Bundle

/**
 * The app-to-app contract between a super app and its child apps (Native SSO task 7).
 *
 * The super app exports a ContentProvider guarded by a `signature`-level permission, so only apps
 * signed with the same vendor certificate can call it. Two methods are offered:
 *
 *  - [METHOD_GET_SSO_CREDENTIALS]: returns the super app's `id_token`, `device_secret` and a DPoP
 *    proof signed by Key A for the child's `POST {token_endpoint}` request.
 *  - [METHOD_SIGN_DPOP]: signs a DPoP proof with Key A for any later request (for example the
 *    child's userinfo call), since the child's access token is bound to Key A too.
 */
object NativeSsoContract {
    const val PERMISSION = "org.mosip.superapp.permission.NATIVE_SSO"
    const val AUTHORITY = "org.mosip.superapp.sso"
    val PROVIDER_URI: Uri = Uri.parse("content://$AUTHORITY")

    const val METHOD_GET_SSO_CREDENTIALS = "GET_SSO_CREDENTIALS"
    const val METHOD_SIGN_DPOP = "SIGN_DPOP"

    const val EXTRA_HTM = "htm"
    const val EXTRA_HTU = "htu"
    const val EXTRA_ACCESS_TOKEN = "access_token"
    const val EXTRA_ID_TOKEN = "id_token"
    const val EXTRA_DEVICE_SECRET = "device_secret"
    const val EXTRA_DPOP_PROOF = "dpop_proof"
    const val EXTRA_DPOP_JKT = "dpop_jkt"
    const val EXTRA_SUBJECT = "subject"
    const val EXTRA_ERROR = "error"

    const val ERROR_NO_SESSION = "NO_ACTIVE_SESSION"
    const val ERROR_SIGNATURE = "CALLER_SIGNATURE_MISMATCH"
    /** The super app refuses to sign a proof for an `htu` that is not an eSignet endpoint. */
    const val ERROR_HTU = "htu_not_allowed"

    /** Credentials the super app hands a sibling for one token exchange. */
    data class SsoCredentials(val idToken: String, val deviceSecret: String, val dpopProof: String, val dpopJkt: String, val subject: String?)

    /** Asks the super app for the credentials to redeem at [tokenEndpoint]. */
    fun fetchCredentials(context: Context, tokenEndpoint: String): SsoCredentials {
        val extras = Bundle().apply {
            putString(EXTRA_HTM, "POST")
            putString(EXTRA_HTU, tokenEndpoint)
        }
        val result = context.contentResolver.call(PROVIDER_URI, METHOD_GET_SSO_CREDENTIALS, null, extras)
            ?: throw IllegalStateException("Super app is not installed or did not answer")
        result.getString(EXTRA_ERROR)?.let { throw SuperAppException(it) }
        return SsoCredentials(
            idToken = result.getString(EXTRA_ID_TOKEN) ?: throw SuperAppException("missing id_token"),
            deviceSecret = result.getString(EXTRA_DEVICE_SECRET) ?: throw SuperAppException("missing device_secret"),
            dpopProof = result.getString(EXTRA_DPOP_PROOF) ?: throw SuperAppException("missing dpop_proof"),
            dpopJkt = result.getString(EXTRA_DPOP_JKT).orEmpty(),
            subject = result.getString(EXTRA_SUBJECT),
        )
    }

    /** Asks the super app to sign a DPoP proof with Key A. */
    fun signDpop(context: Context, htm: String, htu: String, accessToken: String? = null): String {
        val extras = Bundle().apply {
            putString(EXTRA_HTM, htm)
            putString(EXTRA_HTU, htu)
            if (accessToken != null) putString(EXTRA_ACCESS_TOKEN, accessToken)
        }
        val result = context.contentResolver.call(PROVIDER_URI, METHOD_SIGN_DPOP, null, extras)
            ?: throw IllegalStateException("Super app is not installed or did not answer")
        result.getString(EXTRA_ERROR)?.let { throw SuperAppException(it) }
        return result.getString(EXTRA_DPOP_PROOF) ?: throw SuperAppException("missing dpop_proof")
    }

    /** A [DpopSigner] that delegates to the super app, for a child app's own requests. */
    class RemoteDpopSigner(private val context: Context, private val jkt: String) : DpopSigner {
        override fun thumbprint(): String = jkt
        override fun proof(htm: String, htu: String, accessToken: String?, nonce: String?): String =
            signDpop(context, htm, htu, accessToken)
    }

    class SuperAppException(val code: String) : Exception("Super app reported: $code")
}
