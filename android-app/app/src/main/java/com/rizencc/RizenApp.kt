package com.rizencc

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.content.getSystemService
import com.rizencc.util.Constants

class RizenApp : Application() {
    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        val nm = getSystemService<NotificationManager>() ?: return
        listOf(
            Triple("orders", "Orders", "Pickup notifications"),
            Triple("system", "System", "Server and agent alerts"),
            Triple("chat", "Chat", "Agent chat messages"),
        ).forEach { (id, name, desc) ->
            nm.createNotificationChannel(
                NotificationChannel(id, name, NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = desc
                    enableVibration(true)
                }
            )
        }
    }
}
