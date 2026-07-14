package com.erth.sidekick

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.provider.Settings
import android.util.Log
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

/**
 * Hosts the ERTH Sidekick webapp in a WebView. Acts as the native shell.
 *
 * - Persists cookies (NextAuth session) across launches.
 * - Bridges JS <-> native for auth state, FCM token, unread counts.
 * - Handles file upload (<input type=file>) from the webapp.
 * - Pull-to-refresh.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipe: SwipeRefreshLayout
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var notifPermissionLauncher: ActivityResultLauncher<String>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Request POST_NOTIFICATIONS on Android 13+
        notifPermissionLauncher = registerForActivityResult(
            ActivityResultContracts.RequestPermission()
        ) { granted ->
            if (!granted) Toast.makeText(this, R.string.permission_rationale, Toast.LENGTH_LONG).show()
        }
        ensureNotificationPermission()

        swipe = SwipeRefreshLayout(this).apply {
            setOnRefreshListener {
                webView.reload()
            }
        }
        webView = WebView(this).apply {
            layoutParams = android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        swipe.addView(webView)
        setContentView(swipe)

        configureWebView()
        webView.loadUrl(Constants.WEBAPP_URL)

        // Back navigation: webview history then exit
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else {
                    isEnabled = false
                    onBackPressed()
                }
            }
        })

        // Start background poll service (FCM fallback). It stops itself if FCM token present.
        NotificationPollService.start(this)

        // If Firebase is available, fetch the current FCM token so it's stored + injected
        // into the WebView for registration. onNewToken only fires on change, so we fetch
        // explicitly on each launch to ensure a token is present.
        if (FcmRegistrar.isFcmAvailable()) fetchFcmToken()
    }

    /** Fetch the FCM token via reflection (avoids a hard compile dependency on Firebase). */
    private fun fetchFcmToken() {
        try {
            val firebaseMessagingClass = Class.forName("com.google.firebase.messaging.FirebaseMessaging")
            val getInstance = firebaseMessagingClass.getMethod("getInstance")
            val instance = getInstance.invoke(null)
            val getToken = firebaseMessagingClass.getMethod("getToken")
            @Suppress("UNCHECKED_CAST")
            val task = getToken.invoke(instance) as com.google.android.gms.tasks.Task<out Any>
            task.addOnCompleteListener { t ->
                if (t.isSuccessful) {
                    val token = t.result?.toString()
                    if (!token.isNullOrEmpty()) {
                        FcmRegistrar.storeTokenAndStoreOnly(this, token)
                        runOnUiThread { injectJsBridge() }
                    }
                }
            }
        } catch (e: Exception) {
            Log.d("Sidekick", "FCM token fetch skipped: ${e.message}")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString HeroSidekick/1.0 (Android)"
            // Render at device width so the webapp's responsive layout + viewport meta work,
            // and so env(safe-area-inset-*) is reported correctly under edge-to-edge.
            useWideViewPort = true
            loadWithOverviewMode = true
            // Force the viewport meta to be honored (default true, but explicit for safety).
            setSupportZoom(false)
        }

        // Edge-to-edge: let the WebView fill the whole content area so the webapp's
        // safe-area-inset CSS receives the real system bar insets (instead of the
        // WebView being inset by the system, which causes fixed bars to be clipped).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
        }

        // Cookies: accept third-party so the NextAuth session persists within this WebView origin
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                val host = url.host
                // Exact host or subdomain of erthsidekick.xyz only; anything else opens externally.
                val isOurs = host != null && (host == "erthsidekick.xyz" || host.endsWith(".erthsidekick.xyz"))
                return if (isOurs) {
                    false
                } else {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                    true
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                swipe.isRefreshing = false
                CookieManager.getInstance().flush()
                // Inject bridge to expose FCM token + read auth/unread state
                injectJsBridge()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                wb: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback

                // Determine the accept types from the webapp's <input accept="...">.
                val acceptTypes = params?.acceptTypes ?: arrayOf("*/*")
                val isImageOnly = acceptTypes.isNotEmpty() &&
                    acceptTypes.all { it.equals("image/*", true) || it.startsWith("image/") }

                // Build a content-picker intent honoring the accept types.
                val getContent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = if (isImageOnly) "image/*" else "*/*"
                    addCategory(Intent.CATEGORY_OPENABLE)
                    if (params?.mode == FileChooserParams.MODE_OPEN_MULTIPLE) {
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    }
                }

                // For image inputs, also offer the camera so the user can take a photo.
                // We wrap both gallery + camera in a chooser so Android shows a selection sheet.
                val chooserIntent = Intent.createChooser(getContent, "Select photo").apply {
                    if (isImageOnly) {
                        val cameraIntents = cameraCaptureIntents()
                        if (cameraIntents.isNotEmpty()) {
                            putExtra(Intent.EXTRA_INITIAL_INTENTS, cameraIntents.toTypedArray())
                        }
                    }
                }

                try {
                    @Suppress("DEPRECATION")
                    startActivityForResult(chooserIntent, FILE_CHOOSER_CODE)
                } catch (e: Exception) {
                    filePathCallback = null
                    return false
                }
                return true
            }

            /** Gather camera apps that can capture an image, so the chooser offers "Camera". */
            private fun cameraCaptureIntents(): List<Intent> {
                val pm = packageManager
                val captureIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                val list = pm.queryIntentActivities(captureIntent, 0)
                return list.map { ri ->
                    Intent(captureIntent).setPackage(ri.activityInfo.packageName)
                }
            }
        }

        webView.addJavascriptInterface(NativeBridge(), "SidekickNative")

        // Re-inject the FCM token into the WebView whenever it's refreshed, so the
        // webapp can re-register it via its authenticated same-origin fetch.
        FcmRegistrar.onTokenRefreshed = {
            runOnUiThread { injectJsBridge() }
        }
    }

    @SuppressLint("Deprecation")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == FILE_CHOOSER_CODE) {
            val callback = filePathCallback ?: return
            val result: Array<android.net.Uri>? = if (resultCode == RESULT_OK) {
                when {
                    // Multiple selection (gallery multi-select)
                    data?.clipData != null -> {
                        val clip = data.clipData!!
                        Array(clip.itemCount) { i -> clip.getItemAt(i).uri }
                    }
                    // Single URI (gallery or camera-with-file)
                    data?.data != null -> arrayOf(data.data!!)
                    // Camera capture returns a Bitmap in extras (no URI) — persist to cache.
                    data?.extras?.get("data") is android.graphics.Bitmap -> {
                        val bmp = data.extras?.get("data") as android.graphics.Bitmap
                        val file = java.io.File(cacheDir, "capture_${System.currentTimeMillis()}.jpg")
                        cacheDir.mkdirs()
                        try {
                            java.io.FileOutputStream(file).use { out -> bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, out) }
                            arrayOf(android.net.Uri.fromFile(file))
                        } catch (e: Exception) { null }
                    }
                    else -> null
                }
            } else null
            callback.onReceiveValue(result)
            filePathCallback = null
        } else {
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    /** JS interface exposed to the webapp as window.SidekickNative.
     *  Deliberately minimal: no FCM token is exposed over the bridge (it would leak
     *  to any JS running in the WebView, incl. XSS/iframes). Auth state is the only
     *  call we accept, and only from our trusted origin. */
    inner class NativeBridge {
        @JavascriptInterface
        fun onAuthState(userId: String?) {
            getSharedPreferences(Constants.PREFS_NAME, MODE_PRIVATE).edit()
                .putString(Constants.KEY_USER_ID, userId)
                .apply()
            // When user logs in, try to register FCM token with server.
            if (!userId.isNullOrEmpty()) FcmRegistrar.registerWithServer(this@MainActivity)
        }
    }

    private fun injectJsBridge() {
        // Inject the FCM token as a JS variable (one-way, not a callable bridge method) so
        // the webapp can register it via its own authenticated same-origin fetch. This avoids
        // the native HTTP call that lacked the WebView session cookie (which caused 401).
        val fcmToken = getSharedPreferences(Constants.PREFS_NAME, MODE_PRIVATE)
            .getString(Constants.KEY_FCM_TOKEN, null)
        val tokenJs = if (fcmToken != null) "\"${fcmToken.replace("\"", "\\\"")}\"" else "null"

        val js = """
            (function(){
              if (window.__sidekickBridgeInstalled) return;
              window.__sidekickBridgeInstalled = true;
              window.__sidekickFcmToken = $tokenJs;
              // When logged in, register the FCM token with the server (same-origin fetch
              // carries the NextAuth session cookie that the native call lacked).
              function registerToken(userId) {
                if (!window.__sidekickFcmToken) return;
                fetch('/api/devices/register', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ token: window.__sidekickFcmToken, platform: 'android' })
                }).then(r => { if (r.ok) console.log('[sidekick] FCM token registered'); })
                  .catch(e => console.warn('[sidekick] FCM register failed', e));
              }
              try {
                fetch('/api/auth/session').then(r=>r.json()).then(s=>{
                  if (window.SidekickNative && s && s.user && s.user.id) {
                    SidekickNative.onAuthState(String(s.user.id));
                    registerToken(s.user.id);
                  } else if (window.SidekickNative) {
                    SidekickNative.onAuthState(null);
                  }
                }).catch(()=>{});
              } catch(e) {}
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    private fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    override fun onResume() {
        super.onResume()
        // Clear active notifications (user is now looking at the app)
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancelAll()
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val FILE_CHOOSER_CODE = 54321
    }
}