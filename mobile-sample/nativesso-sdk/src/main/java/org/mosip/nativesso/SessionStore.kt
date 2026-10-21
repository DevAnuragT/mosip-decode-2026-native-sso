package org.mosip.nativesso

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject

/**
 * Encrypted on-device storage for the app's tokens. The super app keeps its ID token and device
 * secret here; they never leave the device except on the token exchange the child app performs.
 */
class SessionStore(context: Context, name: String = "native_sso_session") {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(
            context, name, masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    var tokens: TokenSet?
        get() = prefs.getString(KEY_TOKENS, null)?.let { TokenSet.from(JSONObject(it)) }
        set(value) {
            prefs.edit().apply {
                if (value == null) remove(KEY_TOKENS) else putString(KEY_TOKENS, value.toJson().toString())
            }.apply()
        }

    var pending: PendingAuthorization?
        get() = prefs.getString(KEY_PENDING, null)?.let { PendingAuthorization.from(JSONObject(it)) }
        set(value) {
            prefs.edit().apply {
                if (value == null) remove(KEY_PENDING) else putString(KEY_PENDING, value.toJson().toString())
            }.apply()
        }

    var userInfo: JSONObject?
        get() = prefs.getString(KEY_USERINFO, null)?.let { JSONObject(it) }
        set(value) {
            prefs.edit().apply {
                if (value == null) remove(KEY_USERINFO) else putString(KEY_USERINFO, value.toString())
            }.apply()
        }

    fun clear() = prefs.edit().clear().apply()

    private companion object {
        const val KEY_TOKENS = "tokens"
        const val KEY_PENDING = "pending"
        const val KEY_USERINFO = "userinfo"
    }
}
