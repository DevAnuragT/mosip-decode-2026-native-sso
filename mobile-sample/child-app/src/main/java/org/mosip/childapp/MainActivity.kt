package org.mosip.childapp

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
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** Child app home: one tap signs in silently through the super app's eSignet session. */
class MainActivity : AppCompatActivity() {

    private lateinit var repo: ChildAuthRepository
    private lateinit var statusChip: TextView
    private lateinit var status: TextView
    private lateinit var greeting: TextView
    private lateinit var profileCard: View
    private lateinit var claimsContainer: LinearLayout
    private lateinit var detailsContainer: LinearLayout
    private lateinit var signIn: MaterialButton
    private lateinit var signInMore: MaterialButton
    private lateinit var signOut: MaterialButton
    private var lastSilentMillis: Long? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        repo = ChildAuthRepository.get(this)
        statusChip = findViewById(R.id.statusChip)
        status = findViewById(R.id.status)
        greeting = findViewById(R.id.greeting)
        profileCard = findViewById(R.id.profileCard)
        claimsContainer = findViewById(R.id.claimsContainer)
        detailsContainer = findViewById(R.id.detailsContainer)
        signIn = findViewById(R.id.signIn)
        signInMore = findViewById(R.id.secondaryAction)
        signOut = findViewById(R.id.signOut)

        signIn.setOnClickListener { signIn(ChildAuthRepository.SCOPE_DEFAULT) }
        signInMore.setOnClickListener { signIn(ChildAuthRepository.SCOPE_EXTRA) }
        signOut.setOnClickListener { repo.signOut(); lastSilentMillis = null; render() }

        render()
        handleRedirect(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleRedirect(intent)
    }

    private fun signIn(scope: String) {
        signIn.isEnabled = false
        signInMore.isEnabled = false
        statusChip.text = getString(R.string.chip_busy)
        status.text = getString(R.string.status_working)
        lifecycleScope.launch {
            try {
                when (val outcome = withContext(Dispatchers.IO) { repo.signIn(scope) }) {
                    is ChildAuthRepository.Outcome.Silent -> {
                        lastSilentMillis = outcome.millis
                        render()
                        Snackbar.make(status, "Silent sign-in took ${outcome.millis} ms", Snackbar.LENGTH_LONG).show()
                    }
                    is ChildAuthRepository.Outcome.InteractionRequired -> {
                        status.text = getString(R.string.status_reconsent)
                        MaterialAlertDialogBuilder(this@MainActivity)
                            .setTitle("Your consent is needed")
                            .setMessage("Vendor Health needs more than you approved for Vendor Wallet, so eSignet " +
                                "will not sign you in silently. Continue to review and approve the extra claims " +
                                "in the browser.\n\nDetail from eSignet: ${outcome.reason}")
                            .setPositiveButton("Continue") { _, _ ->
                                CustomTabsIntent.Builder().build().launchUrl(this@MainActivity, outcome.browserUrl)
                            }
                            .setNegativeButton("Cancel") { _, _ -> render() }
                            .show()
                    }
                    is ChildAuthRepository.Outcome.NoSuperSession -> {
                        render()
                        MaterialAlertDialogBuilder(this@MainActivity)
                            .setTitle("Sign in to Vendor Wallet first")
                            .setMessage("No Native SSO session is available (${outcome.reason}). Open Vendor Wallet, sign in with eSignet, then come back.")
                            .setPositiveButton("OK", null)
                            .show()
                    }
                }
            } catch (e: Exception) {
                render()
                Snackbar.make(status, "Sign-in failed: ${e.message}", Snackbar.LENGTH_LONG).show()
            }
        }
    }

    private fun handleRedirect(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "org.mosip.childapp") return
        intent.data = null
        statusChip.text = getString(R.string.chip_busy)
        status.text = getString(R.string.status_working)
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) { repo.completeInteractive(data) }
                lastSilentMillis = null
                Snackbar.make(status, "Consent captured; signed in", Snackbar.LENGTH_LONG).show()
            } catch (e: Exception) {
                Snackbar.make(status, "Sign-in failed: ${e.message}", Snackbar.LENGTH_LONG).show()
            }
            render()
        }
    }

    private fun render() {
        val signedIn = repo.isSignedIn
        signIn.isEnabled = true
        signInMore.isEnabled = true
        signIn.visibility = if (signedIn) View.GONE else View.VISIBLE
        signInMore.visibility = if (signedIn) View.GONE else View.VISIBLE
        signOut.visibility = if (signedIn) View.VISIBLE else View.GONE
        statusChip.text = when {
            !signedIn -> getString(R.string.chip_signed_out)
            lastSilentMillis != null -> "Signed in silently in $lastSilentMillis ms"
            else -> getString(R.string.chip_signed_in)
        }
        status.text = getString(if (signedIn) R.string.status_signed_in else R.string.status_signed_out)

        val info: JSONObject? = if (signedIn) repo.userInfo() else null
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
