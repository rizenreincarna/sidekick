package com.erth.sidekick

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

/**
 * Application class — creates notification channels on startup.
 *
 * Channels:
 *  - orders   : new orders assigned
 *  - sos      : urgent SOS requests
 *  - system   : system alerts
 *  - chat     : AI chat / admin messages
 *  - poll     : foreground sync service (low importance)
 */
class SidekickApp : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val channels = listOf(
            Triple(Constants.CHANNEL_ORDERS, getString(R.string.channel_orders), NotificationManager.IMPORTANCE_HIGH),
            Triple(Constants.CHANNEL_SOS, getString(R.string.channel_sos), NotificationManager.IMPORTANCE_HIGH),
            Triple(Constants.CHANNEL_SYSTEM, getString(R.string.channel_system), NotificationManager.IMPORTANCE_DEFAULT),
            Triple(Constants.CHANNEL_CHAT, getString(R.string.channel_chat), NotificationManager.IMPORTANCE_DEFAULT),
            Triple(Constants.CHANNEL_POLL, getString(R.string.poll_channel), NotificationManager.IMPORTANCE_LOW),
        )

        for ((id, name, importance) in channels) {
            val channel = NotificationChannel(id, name, importance).apply {
                description = when (id) {
                    Constants.CHANNEL_ORDERS -> getString(R.string.channel_orders_desc)
                    Constants.CHANNEL_SOS -> getString(R.string.channel_sos_desc)
                    Constants.CHANNEL_SYSTEM -> getString(R.string.channel_system_desc)
                    Constants.CHANNEL_CHAT -> getString(R.string.channel_chat_desc)
                    else -> getString(R.string.poll_channel_desc)
                }
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 200, 100, 200)
            }
            nm.createNotificationChannel(channel)
        }
    }
}