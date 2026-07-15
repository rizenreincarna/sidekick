package com.erth.sidekick

object Constants {
    // Base URL — override via BuildConfig.BASE_URL at build time.
    // Defaults to erthsidekick.xyz which follows DNS after cutover.
    // For pre-DNS testing on new VPS, pass:
    //   ./gradlew assembleRelease -PBASE_URL=https://NEW_VPS_IP:3001
    const val WEBAPP_URL = "https://sidekick.rizen.space"

    // Notification channels
    const val CHANNEL_ORDERS = "orders"
    const val CHANNEL_SOS = "sos"
    const val CHANNEL_SYSTEM = "system"
    const val CHANNEL_CHAT = "chat"
    const val CHANNEL_POLL = "poll"

    // Shared prefs keys
    const val PREFS_NAME = "sidekick_prefs"
    const val KEY_FCM_TOKEN = "fcm_token"
    const val KEY_LAST_SEEN_NOTIF_ID = "last_seen_notif_id"
    const val KEY_USER_ID = "user_id"
    const val KEY_POLL_ENABLED = "poll_enabled"
}