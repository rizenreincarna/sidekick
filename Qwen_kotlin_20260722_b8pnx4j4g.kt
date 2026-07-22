package com.rizencc.data

import com.rizencc.data.model.BalanceInfo
import com.rizencc.data.model.ChatRequest
import com.rizencc.data.model.ChatResponse
import com.rizencc.data.model.OrderStats
import com.rizencc.data.model.ServerStats
import com.rizencc.data.model.StatsHistoryPoint
import com.rizencc.data.model.TtsStatus
import com.rizencc.data.model.TtsToggleRequest
import com.rizencc.data.model.TtsToggleResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface RizenApi {
    // Chat
    @POST("chat-api/chat")
    suspend fun chat(@Body body: ChatRequest): Response<ChatResponse>

    // TTS
    @GET("tts-toggle-api/tts-status")
    suspend fun ttsStatus(): Response<TtsStatus>

    @POST("tts-toggle-api/tts-toggle")
    suspend fun ttsToggle(): Response<TtsToggleResponse>

    @POST("tts-toggle-api/tts-set")
    suspend fun ttsSet(@Body body: TtsToggleRequest): Response<TtsToggleResponse>

    // Order stats
    @GET("api/stats/public")
    suspend fun orderStats(): Response<OrderStats>

    // Server stats
    @GET("api/stats")
    suspend fun serverStats(): Response<ServerStats>

    // API balances
    @GET("api/stats/public/balances")
    suspend fun balances(): Response<List<BalanceInfo>>

    // Stats history for sparklines
    @GET("api/stats/history")
    suspend fun statsHistory(): Response<List<StatsHistoryPoint>>
}