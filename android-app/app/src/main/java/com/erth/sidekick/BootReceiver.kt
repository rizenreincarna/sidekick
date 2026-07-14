package com.erth.sidekick

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/** Restarts the notification poll service after device boot (FCM fallback only). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(Intent(context, NotificationPollService::class.java))
            } else {
                context.startService(Intent(context, NotificationPollService::class.java))
            }
        }
    }
}