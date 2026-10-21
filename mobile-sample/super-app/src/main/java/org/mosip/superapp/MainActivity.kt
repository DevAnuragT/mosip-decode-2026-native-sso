package org.mosip.superapp

import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** Super app home: "Sign in with eSignet", then the signed-in user's claims and the SSO binding. */
class MainActivity : AppCompatActivity() {

    private lateinit var repo: AuthRepository
    private lateinit var statusChip: TextView
    private lateinit var status: TextView
    private lateinit var greeting: TextView
    private lateinit var profileCard: View
    private lateinit var claimsContainer: LinearLayout
    private lateinit var detailsContainer: LinearLayout
    private lateinit var signIn: MaterialButton
    private lateinit var signOut: MaterialButton
    private lateinit var secondaryAction: MaterialButton

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        repo = AuthRepository.get(this)
        statusChip = findViewById(R.id.statusChip)
        status = findViewById(R.id.status)
        greeting = findViewById(R.id.greeting)
        profileCard = findViewById(R.id.profileCard)
        claimsContainer = findViewById(R.id.claimsContainer)
        detailsContainer = findViewById(R.id.detailsContainer)
        signIn = findViewById(R.id.signIn)
        signOut = findViewById(R.id.signOut)
        secondaryAction = findViewById(R.id.secondaryAction)

        signIn.setOnClickListener { startSignIn() }
        signOut.setOnClickListener { repo.signOut(); render() }
        secondaryAction.setOnClickListener { loadUserInfo() }

        render()
        handleRedirect(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleRedirect(intent)
    }

    private fun startSignIn() {
        signIn.isEnabled = false
        busy(getString(R.string.status_waiting))
        lifecycleScope.launch {
            try {
                val url = withContext(Dispatchers.IO) { repo.beginSignIn() }
                CustomTabsIntent.Builder().build().launchUrl(this@MainActivity, url)
            } catch (e: Exception) {
                showError("Could not start sign-in: ${e.message}")
                render()
            }
        }
    }

    private fun handleRedirect(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "org.mosip.superapp") return
        intent.data = null
        busy(getString(R.string.status_waiting))
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    repo.completeSignIn(data)
                    repo.fetchUserInfo()
                }
                Snackbar.make(status, "Signed in with eSignet; device secret issued", Snackbar.LENGTH_LONG).show()
            } catch (e: Exception) {
                showError("Sign-in failed: ${e.message}")
            }
            render()
        }
    }

    private fun loadUserInfo() {
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.fetchUserInfo() }
            } catch (e: Exception) {
                showError("userinfo failed: ${e.message}")
            }
            render()
        }
    }

    private fun busy(message: String) {
        statusChip.text = getString(R.string.chip_busy)
        status.text = message
    }

    private fun render() {
        val signedIn = repo.isSignedIn
        signIn.isEnabled = true
        signIn.visibility = if (signedIn) View.GONE else View.VISIBLE
        signOut.visibility = if (signedIn) View.VISIBLE else View.GONE
        secondaryAction.visibility = if (signedIn) View.VISIBLE else View.GONE
        statusChip.text = getString(if (signedIn) R.string.chip_signed_in else R.string.chip_signed_out)
        status.text = getString(if (signedIn) R.string.status_signed_in else R.string.status_signed_out)

        val info: JSONObject? = if (signedIn) repo.store.userInfo else null
        profileCard.visibility = if (info != null) View.VISIBLE else View.GONE
        claimsContainer.removeAllViews()
        if (info != null) {
            greeting.text = "Hello, ${info.optString("name").ifEmpty { "there" }}"
            for (key in info.keys().asSequence().sorted()) {
                if (key in setOf("sub", "iss", "aud", "name", "exp", "iat", "nbf", "jti")) continue
                val value = info.opt(key)?.toString().orEmpty()
                addRow(claimsContainer, Claims.label(key), if (value.startsWith("data:image")) "(photo received)" else value)
            }
            addRow(claimsContainer, "Subject (sub)", info.optString("sub"), mono = true)
        }

        detailsContainer.removeAllViews()
        for ((label, value, mono) in runCatching { repo.bindingDetails() }.getOrElse { listOf(Triple("Error", it.message.orEmpty(), false)) }) {
            addRow(detailsContainer, label, value, mono)
        }
    }

    private fun addRow(container: LinearLayout, label: String, value: String?, mono: Boolean = false) {
        val row = layoutInflater.inflate(R.layout.row_key_value, container, false)
        row.findViewById<TextView>(R.id.rowLabel).text = label
        row.findViewById<TextView>(R.id.rowValue).apply {
            text = value?.takeIf { it.isNotBlank() } ?: "—"
            if (mono) typeface = Typeface.MONOSPACE
        }
        container.addView(row)
    }

    private fun showError(message: String) {
        Snackbar.make(status, message, Snackbar.LENGTH_LONG).show()
    }
}

/** Friendly labels for OIDC standard claims. */
object Claims {
    private val labels = mapOf(
        "email" to "Email", "phone_number" to "Phone", "birthdate" to "Date of birth", "gender" to "Gender",
        "picture" to "Photo", "given_name" to "Given name", "family_name" to "Family name", "address" to "Address",
        "email_verified" to "Email verified", "phone_number_verified" to "Phone verified",
    )
    fun label(claim: String): String = labels[claim] ?: claim.replace('_', ' ').replaceFirstChar { it.uppercase() }
}
