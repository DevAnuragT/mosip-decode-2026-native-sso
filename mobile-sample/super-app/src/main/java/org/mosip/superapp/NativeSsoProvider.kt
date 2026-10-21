package org.mosip.superapp

import android.content.ContentProvider
import android.content.ContentValues
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Binder
import android.os.Bundle
import android.util.Log
import org.mosip.nativesso.Codec
import org.mosip.nativesso.NativeSsoContract

/**
 * Hands the super app's ID token and device secret to same-vendor child apps and signs DPoP proofs
 * with Key A on their behalf ("Super App signs for child apps"). The manifest guards the provider
 * with a signature-level permission; this class re-checks the caller's signing certificate as a
 * second line of defence before releasing anything.
 */
class NativeSsoProvider : ContentProvider() {

    companion object {
        private const val TAG = "NativeSsoProvider"
    }

    override fun onCreate(): Boolean = true

    override fun call(method: String, arg: String?, extras: Bundle?): Bundle? {
        val ctx = context ?: return null
        val callerUid = Binder.getCallingUid()
        val callerPackages = ctx.packageManager.getPackagesForUid(callerUid)?.toList().orEmpty()
        if (callerPackages.none { ctx.packageManager.checkSignatures(ctx.packageName, it) == PackageManager.SIGNATURE_MATCH }) {
            Log.w(TAG, "Rejected $method from $callerPackages: signing certificate differs from ours")
            return Bundle().apply { putString(NativeSsoContract.EXTRA_ERROR, NativeSsoContract.ERROR_SIGNATURE) }
        }
        val repo = AuthRepository.get(ctx)
        val htm = extras?.getString(NativeSsoContract.EXTRA_HTM) ?: "POST"
        val htu = extras?.getString(NativeSsoContract.EXTRA_HTU)
            ?: return Bundle().apply { putString(NativeSsoContract.EXTRA_ERROR, "missing htu") }

        return when (method) {
            NativeSsoContract.METHOD_GET_SSO_CREDENTIALS -> {
                val tokens = repo.tokens
                val idToken = tokens?.idToken
                val deviceSecret = tokens?.deviceSecret
                if (idToken == null || deviceSecret == null) {
                    Log.i(TAG, "No active session for $callerPackages")
                    return Bundle().apply { putString(NativeSsoContract.EXTRA_ERROR, NativeSsoContract.ERROR_NO_SESSION) }
                }
                Log.i(TAG, "Releasing SSO credentials to $callerPackages for $htm $htu")
                Bundle().apply {
                    putString(NativeSsoContract.EXTRA_ID_TOKEN, idToken)
                    putString(NativeSsoContract.EXTRA_DEVICE_SECRET, deviceSecret)
                    // A fresh proof for exactly the child's token request: Key A never leaves this app.
                    putString(NativeSsoContract.EXTRA_DPOP_PROOF, repo.dpop.proof(htm, htu))
                    putString(NativeSsoContract.EXTRA_DPOP_JKT, repo.dpop.thumbprint())
                    putString(NativeSsoContract.EXTRA_SUBJECT, runCatching { Codec.jwtPayload(idToken).optString("sub") }.getOrNull())
                }
            }
            NativeSsoContract.METHOD_SIGN_DPOP -> Bundle().apply {
                putString(NativeSsoContract.EXTRA_DPOP_PROOF,
                    repo.dpop.proof(htm, htu, extras.getString(NativeSsoContract.EXTRA_ACCESS_TOKEN)))
                putString(NativeSsoContract.EXTRA_DPOP_JKT, repo.dpop.thumbprint())
            }
            else -> null
        }
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
