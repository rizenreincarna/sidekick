package com.rizencc.ui.viewmodel

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.util.Base64
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rizencc.data.ApiClient
import com.rizencc.data.RizenApi
import com.rizencc.data.model.ChatRequest
import com.rizencc.data.model.ChatResponse
import com.rizencc.data.model.OrderStats
import com.rizencc.data.model.ServerStats
import com.rizencc.data.model.TtsStatus
import com.rizencc.data.model.TtsToggleRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import retrofit2.Response

// ── Chat ──────────────────────────────────────────────────────

/** A single chat bubble. sender="user" for user, or the agent id for agent. */
data class ChatMessage(
    val sender: String,
    val text: String,
    val agent: String = "",  // target agent id this message belongs to
    val timestamp: Long = System.currentTimeMillis(),
)

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val activeAgent: String = "Marie",
    val isSending: Boolean = false,
    val isSpeaking: Boolean = false,
)

// ── TTS ──────────────────────────────────────────────────────

data class TtsUiState(
    val provider: String? = null,
    val voiceLabel: String? = null,
    val isToggling: Boolean = false,
)

// ── Stats ─────────────────────────────────────────────────────

data class OrderStatsUiState(
    val stats: OrderStats? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
)

data class ServerStatsUiState(
    val stats: ServerStats? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
)

// ── ViewModel ─────────────────────────────────────────────────

/**
 * Single shared ViewModel for the RizenCC app. Hoisted to activity scope
 * (each tab calls `viewModel()` and gets the same instance) so state
 * survives tab switches. Exposes four independent state slices:
 *   - chat       : messages + active agent + sending flag
 *   - tts        : current provider/voice + toggle flag
 *   - orderStats : order dashboard stats (data + isLoading + error)
 *   - serverStats: server metrics (data + isLoading + error)
 *
 * All network calls go through ApiClient.retrofit.create(RizenApi) on Dispatchers.IO.
 */
class RizenViewModel : ViewModel() {

    private val api: RizenApi = ApiClient.retrofit.create(RizenApi::class.java)

    // ── Chat ───────────────────────────────────────────────────
    private val _chat = MutableStateFlow(ChatUiState())
    val chat: StateFlow<ChatUiState> = _chat.asStateFlow()

    // ── TTS ────────────────────────────────────────────────────
    private val _tts = MutableStateFlow(TtsUiState())
    val tts: StateFlow<TtsUiState> = _tts.asStateFlow()

    // ── Order stats ───────────────────────────────────────────
    private val _orderStats = MutableStateFlow(OrderStatsUiState())
    val orderStats: StateFlow<OrderStatsUiState> = _orderStats.asStateFlow()

    // ── Server stats ──────────────────────────────────────────
    private val _serverStats = MutableStateFlow(ServerStatsUiState())
    val serverStats: StateFlow<ServerStatsUiState> = _serverStats.asStateFlow()

    // ── API balances ──────────────────────────────────────────
    private val _balances = MutableStateFlow<List<com.rizencc.data.model.BalanceInfo>>(emptyList())
    val balances: StateFlow<List<com.rizencc.data.model.BalanceInfo>> = _balances.asStateFlow()

    init {
        refreshTts()
        refreshStats()
        refreshServer()
        refreshBalances()
    }

    // ── Chat ───────────────────────────────────────────────────

    /** Switch active agent. Accepts either an id (e.g. "marie") or a display name ("Marie"). */
    fun selectAgent(name: String) {
        _chat.update { it.copy(activeAgent = name) }
    }

    /** Send a chat message to the active agent, appending user + reply bubbles optimistically. */
    fun sendMessage(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return

        _chat.update { state ->
            state.copy(
                messages = state.messages + ChatMessage(sender = "user", text = trimmed, agent = state.activeAgent),
                isSending = true,
            )
        }

        val agent = _chat.value.activeAgent
        viewModelScope.launch {
            try {
                val resp: Response<ChatResponse> = withContext(Dispatchers.IO) {
                    api.chat(ChatRequest(agentIdOf(agent), trimmed))
                }
                if (resp.isSuccessful) {
                    val body = resp.body()
                    val reply = body?.reply?.takeIf { it.isNotBlank() } ?: "(no reply)"
                    _chat.update { state ->
                        state.copy(
                            messages = state.messages + ChatMessage(
                                sender = body?.agent ?: agent,
                                text = reply,
                                agent = agent,
                            ),
                            isSending = false,
                        )
                    }
                    // Play audio reply if present.  Set isSpeaking
                    // SYNCHRONOUSLY — the live loop checks every 500 ms and
                    // will grab the mic if all flags are false.  If we only
                    // set it inside the IO coroutine there is a race window
                    // where the mic opens and kills the TTS audio.
                    body?.audio?.let { audioBase64 ->
                        _chat.update { it.copy(isSpeaking = true) }
                        playAudioBase64(audioBase64)
                    }
                } else {
                    appendAgentError(agent, "⚠️ ${resp.code()} ${resp.message()}")
                }
            } catch (t: Throwable) {
                appendAgentError(agent, "⚠️ ${t.message ?: "network error"}")
            }
        }
    }

    /** Decode base64 WAV and play it via MediaPlayer.
     *  isSpeaking is set to true by the caller BEFORE this function
     *  (synchronously, to prevent a race with the live-mode loop).
     *  We only clear it in onCompletion (or on error). */
    private fun playAudioBase64(b64: String) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val wav = Base64.decode(b64, Base64.DEFAULT)
                val tmpFile = java.io.File.createTempFile("tts", ".wav")
                tmpFile.writeBytes(wav)
                val mp = MediaPlayer().apply {
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    )
                    setDataSource(tmpFile.absolutePath)
                    prepare()
                    setOnCompletionListener {
                        release()
                        tmpFile.delete()
                        _chat.update { it.copy(isSpeaking = false) }
                    }
                }
                mp.start()
            } catch (_: Exception) {
                _chat.update { it.copy(isSpeaking = false) }
            }
        }
    }

    private fun appendAgentError(agent: String, message: String) {
        _chat.update { state ->
            state.copy(
                messages = state.messages + ChatMessage(sender = agent, text = message),
                isSending = false,
            )
        }
    }

    // ── TTS ────────────────────────────────────────────────────

    /** Fetch current TTS status (provider + active voice). Best-effort. */
    fun refreshTts() {
        viewModelScope.launch {
            try {
                val s = withContext(Dispatchers.IO) { api.ttsStatus() }.body()
                _tts.update { it.copy(provider = s?.provider, voiceLabel = voiceLabelOf(s)) }
            } catch (_: Throwable) {
                // Status is best-effort — surface nothing on failure.
            }
        }
    }

    /** Toggle TTS provider (edge ↔ omnivoice). Refreshes status after. */
    fun toggleTts() {
        viewModelScope.launch {
            _tts.update { it.copy(isToggling = true) }
            try {
                withContext(Dispatchers.IO) { api.ttsToggle() }
                // The toggle endpoint returns {ok, message, provider} — not TtsStatus.
                // Re-fetch the full status to get provider + voice label.
                val s = withContext(Dispatchers.IO) { api.ttsStatus() }.body()
                _tts.update { it.copy(provider = s?.provider, voiceLabel = voiceLabelOf(s)) }
            } catch (_: Throwable) { /* ignore */ } finally {
                _tts.update { it.copy(isToggling = false) }
            }
        }
    }

    /** Switch TTS provider (e.g. "edge" or "omnivoice"). Refreshes status after. */
    fun setTtsProvider(name: String) {
        viewModelScope.launch {
            _tts.update { it.copy(isToggling = true) }
            try {
                withContext(Dispatchers.IO) { api.ttsSet(TtsToggleRequest(name)) }
                // Re-fetch the full status to get provider + voice label.
                val s = withContext(Dispatchers.IO) { api.ttsStatus() }.body()
                _tts.update { it.copy(provider = s?.provider, voiceLabel = voiceLabelOf(s)) }
            } catch (_: Throwable) { /* ignore */ } finally {
                _tts.update { it.copy(isToggling = false) }
            }
        }
    }

    /** Resolve a human-readable voice label from the status payload. */
    private fun voiceLabelOf(s: TtsStatus?): String? {
        s ?: return null
        return when (s.provider?.lowercase()) {
            "edge" -> s.edgeVoice
            "pc", "omnivoice", "omni" -> s.pcVoice
            else -> s.edgeVoice ?: s.pcVoice
        }
    }

    // ── Order stats ───────────────────────────────────────────

    fun refreshStats() {
        _orderStats.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val resp = withContext(Dispatchers.IO) { api.orderStats() }
                if (resp.isSuccessful) {
                    _orderStats.update { it.copy(stats = resp.body(), isLoading = false) }
                } else {
                    _orderStats.update {
                        it.copy(isLoading = false, error = "${resp.code()} ${resp.message()}")
                    }
                }
            } catch (t: Throwable) {
                _orderStats.update { it.copy(isLoading = false, error = t.message ?: "network error") }
            }
        }
    }

    // ── Server stats ──────────────────────────────────────────

    fun refreshServer() {
        _serverStats.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val resp = withContext(Dispatchers.IO) { api.serverStats() }
                if (resp.isSuccessful) {
                    _serverStats.update { it.copy(stats = resp.body(), isLoading = false) }
                } else {
                    _serverStats.update {
                        it.copy(isLoading = false, error = "${resp.code()} ${resp.message()}")
                    }
                }
            } catch (t: Throwable) {
                _serverStats.update { it.copy(isLoading = false, error = t.message ?: "network error") }
            }
        }
    }

    fun refreshBalances() {
        viewModelScope.launch {
            try {
                val resp = withContext(Dispatchers.IO) { api.balances() }
                if (resp.isSuccessful) {
                    _balances.value = resp.body() ?: emptyList()
                }
            } catch (_: Throwable) { }
        }
    }

    // ── Helpers ───────────────────────────────────────────────

    /** Normalize an agent (case-insensitive) to its lowercase id. */
    private fun agentIdOf(agent: String): String = agent.trim().lowercase()
}
