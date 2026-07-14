package com.erth.sidekick

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Posts a visible notification to the appropriate channel.
 * Used by both the FCM service and the fallback poll service.
 */
object NotifPoster {

    fun post(
        context: Context,
        channel: String,
        notifId: Int,
        title: String,
        body: String,
        actionUrl: String? = null
    ) {
        val channelId = when (channel) {
            "orders" -> Constants.CHANNEL_ORDERS
            "sos" -> Constants.CHANNEL_SOS
            "system" -> Constants.CHANNEL_SYSTEM
            "chat" -> Constants.CHANNEL_CHAT
            else -> Constants.CHANNEL_SYSTEM
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (!actionUrl.isNullOrEmpty()) {
                val full = if (actionUrl.startsWith("http")) actionUrl
                else "${Constants.WEBAPP_URL}${if (actionUrl.startsWith("/")) "" else "/"}$actionUrl"
                data = android.net.Uri.parse(full)
            }
        }
        val pi = PendingIntent.getActivity(
            context, notifId, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val priority = if (channel == "sos" || channel == "orders")
            NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(priority)
            .setContentIntent(pi)

        try {
            NotificationManagerCompat.from(context).notify(notifId, builder.build())
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS not granted on Android 13+; ignore silently.
        }
    }
}