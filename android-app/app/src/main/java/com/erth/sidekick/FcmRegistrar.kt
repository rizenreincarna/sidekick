package com.erth.sidekick

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Registers the FCM token with the Sidekick server and tracks whether FCM is available.
 *
 * FCM availability is detected at runtime by checking whether the Firebase
 * classes are on the classpath (they only are when google-services.json was
 * present at build time). This keeps the app buildable without Firebase.
 */
object FcmRegistrar {
    private const val TAG = "FcmRegistrar"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Optional callback invoked when a new FCM token is stored — used by MainActivity
     *  to re-inject the token into the WebView so the webapp can re-register it. */
    @Volatile
    var onTokenRefreshed: (() -> Unit)? = null

    /** True if Firebase Messaging classes are present at runtime. */
    fun isFcmAvailable(): Boolean = try {
        Class.forName("com.google.firebase.messaging.FirebaseMessaging")
        true
    } catch (e: ClassNotFoundException) {
        false
    }

    /** Persist token locally and register with server. Call after login + on token refresh.
     *  On rotation, the previously-stored token is sent as `previousToken` so the server
     *  can deactivate the superseded device token and avoid duplicate pushes. */
    fun storeTokenAndRegister(context: Context, token: String) {
        storeTokenAndStoreOnly(context, token)
        val prefs = context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
        val previous = prefs.getString(Constants.KEY_FCM_TOKEN, null)
        registerWithServer(context, previous?.takeIf { it != token })
    }

    /** Store the token locally + notify the activity, but skip the native server call
     *  (the WebView's same-origin fetch handles registration with the session cookie).
     *  Used on app launch token fetch. */
    fun storeTokenAndStoreOnly(context: Context, token: String) {
        val prefs = context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(Constants.KEY_FCM_TOKEN, token).apply()
        onTokenRefreshed?.invoke()
    }

    /** Send current token to server /api/devices/register. Best-effort. */
    fun registerWithServer(context: Context, previousToken: String? = null) {
        val prefs = context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
        val token = prefs.getString(Constants.KEY_FCM_TOKEN, null) ?: return
        val userId = prefs.getString(Constants.KEY_USER_ID, null)
        if (userId.isNullOrEmpty()) {
            Log.d(TAG, "No userId yet; skipping server registration")
            return
        }
        scope.launch {
            try {
                val url = URL("${Constants.WEBAPP_URL}/api/devices/register")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 15000
                    readTimeout = 15000
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                }
                val body = JSONObject().apply {
                    put("token", token)
                    put("userId", userId)
                    put("platform", "android")
                    if (!previousToken.isNullOrEmpty()) put("previousToken", previousToken)
                }.toString()
                conn.outputStream.use { it.write(body.toByteArray()) }
                val code = conn.responseCode
                Log.d(TAG, "Registered token with server: HTTP $code")
                conn.disconnect()
            } catch (e: Exception) {
                Log.w(TAG, "Server registration failed: ${e.message}")
            }
        }
    }
}