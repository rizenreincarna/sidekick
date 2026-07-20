package com.rizencc.data

import com.rizencc.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface RizenApi {
    // Tab 1: Chat
    @POST("chat-api/chat")
    suspend fun chat(@Body body: ChatRequest): Response<ChatResponse>

    // Tab 2: TTS
    @GET("tts-toggle-api/tts-status")
    suspend fun ttsStatus(): Response<TtsStatus>

    // toggle/set return {ok, message, provider} — use TtsToggleResponse
    @POST("tts-toggle-api/tts-toggle")
    suspend fun ttsToggle(): Response<TtsToggleResponse>

    @POST("tts-toggle-api/tts-set")
    suspend fun ttsSet(@Body body: TtsToggleRequest): Response<TtsToggleResponse>

    // Tab 2: Order stats
    @GET("api/stats/public")
    suspend fun orderStats(): Response<OrderStats>

    // Tab 3: Server stats
    @GET("api/stats")
    suspend fun serverStats(): Response<ServerStats>

    // API balances
    @GET("api/stats/public/balances")
    suspend fun balances(): Response<List<com.rizencc.data.model.BalanceInfo>>
}
