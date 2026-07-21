package com.rizencc.util

object Constants {
    // Backend
    const val BASE_URL = "https://work.rizen.space"
    const val BASIC_USER = "tars"
    const val BASIC_PASS = "sgnjhj9x6WpTitVM"
    
    // Endpoints (all behind nginx auth_basic)
    const val CHAT_API = "$BASE_URL/chat-api"        // POST /chat
    const val STATS_API = "$BASE_URL/api/stats"       // GET — system metrics
    const val SIDEKICK_STATS = "$BASE_URL/api/stats/public"  // GET — order stats
    const val TTS_API = "$BASE_URL/tts-toggle-api"   // GET /tts-status, POST /tts-toggle, /tts-set
    const val VOICE_LAB_URL = "$BASE_URL/voice-lab/"   // WebView
    const val VOFFICE_URL = "$BASE_URL/voffice/"      // WebView
    
    // Agents
    data class Agent(val id: String, val name: String, val emoji: String)
    val AGENTS = listOf(
        Agent("marie", "Marie", "🐱"),
        Agent("will", "Will", "🐕"),
    )
}
