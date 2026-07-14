package com.erth.sidekick

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives FCM push notifications from the Sidekick server.
 *
 * Data payload (sent by server):
 *   title, body, channel (orders|sos|system|chat), actionUrl, notifId
 *
 * The notification is posted via NotifPoster. A data-only payload also posts
 * a visible notification (we don't rely on FCM's automatic display).
 *
 * NOTE: This class is only compiled when app/google-services.json exists
 * (see app/build.gradle.kts sourceSets). Without Firebase configured the app
 * still builds and uses the polling fallback service.
 */
class SidekickFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM token refreshed")
        FcmRegistrar.storeTokenAndRegister(applicationContext, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val data = message.data
        val title = data["title"] ?: getString(R.string.app_name)
        val body = data["body"] ?: return
        val channel = data["channel"] ?: Constants.CHANNEL_SYSTEM
        val actionUrl = data["actionUrl"]
        val notifId = data["notifId"]?.toIntOrNull() ?: System.currentTimeMillis().toInt()
        Log.d(TAG, "Push received: channel=$channel title=$title")
        NotifPoster.post(this, channel, notifId, title, body, actionUrl)
    }

    companion object {
        private const val TAG = "SidekickFCM"
    }
}