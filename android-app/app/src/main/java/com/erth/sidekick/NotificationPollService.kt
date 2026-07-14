package com.erth.sidekick

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Foreground service that polls /api/notifications for new items.
 *
 * This is the fallback when FCM is NOT configured. When FCM is available
 * (google-services.json present), the service still starts but short-circuits
 * itself and stops, letting FCM handle delivery.
 *
 * Polling cadence: 60s. The service uses the auth cookie stored in the WebView's
 * CookieManager (the user logged in via the WebView). Because this runs in the
 * app process, we re-read the cookie each cycle.
 */
class NotificationPollService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var pollJob: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundCompat()
        if (FcmRegistrar.isFcmAvailable()) {
            Log.d(TAG, "FCM available; stopping poll service")
            stopSelf()
            return START_NOT_STICKY
        }
        if (!isPollEnabled()) {
            Log.d(TAG, "Poll disabled; stopping")
            stopSelf()
            return START_NOT_STICKY
        }
        startPolling()
        return START_STICKY
    }

    private fun startPolling() {
        if (pollJob?.isActive == true) return
        pollJob = scope.launch {
            // Bootstrap: on first run (lastSeen == 0) do one silent fetch to set the
            // high-water mark WITHOUT posting, so we don't fire a storm of historical
            // unread notifications on install/reinstall.
            var lastSeen = getLastSeenId()
            var booted = lastSeen > 0
            var idleCycles = 0
            delay(5000)
            while (true) {
                try {
                    val cookie = readAuthCookie()
                    if (cookie != null) {
                        val resp = fetchNotifications(cookie)
                        val notifs = resp?.optJSONArray("notifications")
                        if (notifs != null && notifs.length() > 0) {
                            val ids = (0 until notifs.length()).map { notifs.optJSONObject(it)?.optInt("id") ?: 0 }
                            val maxId = ids.maxOrNull() ?: lastSeen
                            if (!booted) {
                                // First run: just record high-water mark, don't post history.
                                lastSeen = maxId
                                saveLastSeenId(lastSeen)
                                booted = true
                            } else {
                                for (i in 0 until notifs.length()) {
                                    val n = notifs.optJSONObject(i) ?: continue
                                    val id = n.optInt("id")
                                    if (id > lastSeen && !n.optBoolean("isRead", false)) {
                                        val title = n.optString("title", "HERO Sidekick")
                                        val body = n.optString("message", "")
                                        val channel = resolveChannel(n)
                                        NotifPoster.post(
                                            this@NotificationPollService,
                                            channel, id, title, body, null
                                        )
                                    }
                                }
                                lastSeen = maxOf(lastSeen, maxId).also { saveLastSeenId(it) }
                            }
                            idleCycles = 0
                        } else {
                            idleCycles++
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "poll error: ${e.message}")
                }
                // Adaptive backoff: stretch interval when idle for a while (battery).
                val interval = when {
                    idleCycles >= 6 -> POLL_INTERVAL_MS * 4   // ~4 min after ~6 idle cycles
                    idleCycles >= 3 -> POLL_INTERVAL_MS * 2   // ~2 min
                    else -> POLL_INTERVAL_MS
                }
                delay(interval)
            }
        }
    }

    /**
     * Resolve a notification channel. Prefers the explicit `channel` field if the
     * API provides it; otherwise falls back to the notification `type` (system vs
     * normal) rather than fragile substring matching of free text.
     */
    private fun resolveChannel(n: org.json.JSONObject): String {
        val explicit = n.optString("channel", "")
        if (explicit.isNotEmpty()) return when (explicit) {
            "orders" -> Constants.CHANNEL_ORDERS
            "sos" -> Constants.CHANNEL_SOS
            "system" -> Constants.CHANNEL_SYSTEM
            "chat" -> Constants.CHANNEL_CHAT
            else -> Constants.CHANNEL_SYSTEM
        }
        // Fallback: system notifications are high-priority; normal ones route to chat.
        val type = n.optString("type", "normal")
        return if (type == "system") Constants.CHANNEL_SYSTEM else Constants.CHANNEL_CHAT
    }

    private fun readAuthCookie(): String? {
        val cm = android.webkit.CookieManager.getInstance()
        val cookies = cm.getCookie(Constants.WEBAPP_URL) ?: return null
        // find the NextAuth session cookie (commonly __Secure-next-auth.session-token
        // or next-auth.session-token)
        val token = cookies.split(";")
            .map { it.trim() }
            .firstOrNull { it.startsWith("next-auth.session-token=") || it.startsWith("__Secure-next-auth.session-token=") }
            ?: return null
        return token
    }

    private fun fetchNotifications(cookie: String): JSONObject? {
        val url = URL("${Constants.WEBAPP_URL}/api/notifications?limit=20")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 15000
            readTimeout = 15000
            setRequestProperty("Cookie", cookie)
        }
        return try {
            if (conn.responseCode == 200) {
                val text = conn.inputStream.bufferedReader().readText()
                JSONObject(text)
            } else null
        } finally {
            conn.disconnect()
        }
    }

    private fun startForegroundCompat() {
        val notif = NotificationCompat.Builder(this, Constants.CHANNEL_POLL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(getString(R.string.poll_notification_title))
            .setContentText(getString(R.string.poll_notification_text))
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    private fun isPollEnabled(): Boolean =
        getSharedPreferences(Constants.PREFS_NAME, MODE_PRIVATE)
            .getBoolean(Constants.KEY_POLL_ENABLED, true)

    private fun getLastSeenId(): Int =
        getSharedPreferences(Constants.PREFS_NAME, MODE_PRIVATE)
            .getInt(Constants.KEY_LAST_SEEN_NOTIF_ID, 0)

    private fun saveLastSeenId(id: Int) {
        getSharedPreferences(Constants.PREFS_NAME, MODE_PRIVATE)
            .edit().putInt(Constants.KEY_LAST_SEEN_NOTIF_ID, id).apply()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "PollService"
        private const val NOTIF_ID = 9001
        private const val POLL_INTERVAL_MS = 60_000L

        fun start(context: Context) {
            val intent = Intent(context, NotificationPollService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}