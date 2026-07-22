package com.rizencc.ui.tabs

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.rizencc.ui.components.*
import com.rizencc.ui.viewmodel.ChatMessage
import com.rizencc.ui.viewmodel.RizenViewModel
import com.rizencc.util.Constants
import kotlinx.coroutines.delay

// Mic interaction state
private enum class MicState { IDLE, LISTENING, THINKING, SPEAKING }

@Composable
fun VoiceTab(
    contentPadding: PaddingValues,
    vm: RizenViewModel = viewModel(),
) {
    val chat by vm.chat.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val listState = rememberLazyListState()
    var input by remember { mutableStateOf("") }
    var hasMicPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        )
    }
    var isListening by remember { mutableStateOf(false) }
    var liveMode by remember { mutableStateOf(false) }
    var lastSpokeAt by remember { mutableStateOf(0L) }

    // Derive MicState from chat + listening flags
    val micState = when {
        isListening -> MicState.LISTENING
        chat.isSending -> MicState.THINKING
        chat.isSpeaking -> MicState.SPEAKING
        else -> MicState.IDLE
    }

    // TTS ended → start a brief cooldown so residual echo dissipates before
    // the mic reopens. The real guard is chat.isSpeaking (now driven by
    // MediaPlayer.onCompletionListener, not a fire-and-forget coroutine).
    LaunchedEffect(chat.isSpeaking) {
        if (!chat.isSpeaking) {
            lastSpokeAt = System.currentTimeMillis()
        }
    }

    val micLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> hasMicPermission = granted }

    val recognizer = remember {
        if (SpeechRecognizer.isRecognitionAvailable(context)) {
            SpeechRecognizer.createSpeechRecognizer(context)
        } else null
    }

    LaunchedEffect(chat.messages.size) {
        if (chat.messages.isNotEmpty()) listState.animateScrollToItem(chat.messages.lastIndex)
    }

    fun startListening() {
        if (!hasMicPermission) { micLauncher.launch(Manifest.permission.RECORD_AUDIO); return }
        if (recognizer == null) return
        isListening = true
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }
        recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(p: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rms: Float) {}
            override fun onBufferReceived(b: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onError(e: Int) { isListening = false }
            override fun onResults(results: Bundle?) {
                val texts = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val text = texts?.firstOrNull() ?: ""
                isListening = false
                if (text.isNotBlank()) vm.sendMessage(text)
            }
            override fun onPartialResults(p: Bundle?) {
                val texts = p?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                texts?.firstOrNull()?.let { input = it }
            }
            override fun onEvent(t: Int, b: Bundle?) {}
        })
        recognizer.startListening(intent)
    }

    fun stopListening() {
        recognizer?.stopListening()
        isListening = false
        // Exit Live mode so the loop doesn't immediately restart listening
        if (liveMode) liveMode = false
    }

    LaunchedEffect(liveMode) {
        while (liveMode) {
            val sinceLastSpoke = System.currentTimeMillis() - lastSpokeAt
            // The primary guard is chat.isSpeaking (accurate: tied to
            // MediaPlayer.onCompletion). A 300 ms echo buffer after
            // onCompletion fires ensures residual audio has decayed.
            val echoBufferMs = if (lastSpokeAt == 0L) 0L else 300L
            if (!isListening && !chat.isSending && !chat.isSpeaking
                && sinceLastSpoke > echoBufferMs) {
                startListening()
            }
            kotlinx.coroutines.delay(500)
        }
    }

    DisposableEffect(recognizer) {
        onDispose { recognizer?.destroy() }
    }

    Column(modifier = Modifier.fillMaxSize().padding(contentPadding)) {
        // ── Header: agent selector + live mode in ONE compact row ├──
        GlassCard(
            modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.md, vertical = Spacing.sm),
            cornerRadius = Radii.lg
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                // Single row: agent chips + Live toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.sm, Alignment.CenterHorizontally),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Constants.AGENTS.forEach { agent ->
                        FilterChip(
                            selected = chat.activeAgent.equals(agent.id, ignoreCase = true),
                            onClick = { vm.selectAgent(agent.id) },
                            leadingIcon = { Text(agent.emoji) },
                            label = { Text(agent.name) },
                            shape = RoundedCornerShape(50),
                        )
                    }
                    // Live toggle inline with agent chips
                    FilterChip(
                        selected = liveMode,
                        onClick = { liveMode = !liveMode },
                        leadingIcon = {
                            Icon(Icons.Default.GraphicEq, contentDescription = null, modifier = Modifier.size(16.dp))
                        },
                        label = { Text("Live") },
                        shape = RoundedCornerShape(50),
                    )
                }
                // State pill row (below chips, centered)
                AnimatedContent(
                    targetState = micState,
                    transitionSpec = { fadeIn(tween(200)) togetherWith fadeOut(tween(150)) },
                    label = "mic-state"
                ) { state ->
                    val (text, color) = when (state) {
                        MicState.IDLE -> "" to MaterialTheme.colorScheme.onSurfaceVariant
                        MicState.LISTENING -> "● listening" to MaterialTheme.colorScheme.error
                        MicState.THINKING -> "thinking…" to MaterialTheme.colorScheme.tertiary
                        MicState.SPEAKING -> "🔊 speaking" to MaterialTheme.colorScheme.secondary
                    }
                    if (text.isNotEmpty()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            if (state == MicState.THINKING) {
                                Spacer(Modifier.width(Spacing.xs))
                                CircularProgressIndicator(modifier = Modifier.size(12.dp), strokeWidth = 2.dp, color = color)
                                Spacer(Modifier.width(Spacing.xs))
                            }
                            Text(text, style = MaterialTheme.typography.labelSmall, color = color)
                        }
                    }
                }
            }
        }

        // ── Transcript ──
        val activeMsgs = chat.messages.filter { it.agent == chat.activeAgent || it.agent == "" }
        if (activeMsgs.isEmpty()) {
            // Empty state
            Box(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(Spacing.xxl)
                ) {
                    Text("🎙️", style = MaterialTheme.typography.displayMedium)
                    Spacer(Modifier.height(Spacing.md))
                    Text(
                        "Talk to ${Constants.AGENTS.firstOrNull { it.id == chat.activeAgent }?.name ?: "Marie"}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Spacer(Modifier.height(Spacing.xs))
                    Text(
                        "Tap the mic to speak, or type a message below.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )
                }
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = Spacing.md),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                contentPadding = PaddingValues(vertical = Spacing.sm),
            ) {
                items(activeMsgs) { msg ->
                    ChatBubble(msg)
                }
            }
        }

        // ── Input row with pulsing mic button ──
        Row(
            modifier = Modifier.fillMaxWidth().padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            // Pulsing mic button
            Box(
                modifier = Modifier.size(72.dp),
                Alignment.Center
            ) {
                // Expanding rings while listening
                ListeningRings(
                    active = isListening,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.fillMaxSize()
                )

                // Pulsing scale on the button itself
                PulseAnimation(active = isListening) { scale, _ ->
                    FilledIconButton(
                        onClick = {
                            if (isListening) stopListening() else startListening()
                        },
                        modifier = Modifier
                            .size(56.dp * scale)
                            .background(
                                when (micState) {
                                    MicState.LISTENING -> MaterialTheme.colorScheme.error
                                    MicState.THINKING -> MaterialTheme.colorScheme.tertiary
                                    MicState.SPEAKING -> MaterialTheme.colorScheme.secondary
                                    MicState.IDLE -> MaterialTheme.colorScheme.primary
                                },
                                CircleShape
                            ),
                        shape = CircleShape
                    ) {
                        Icon(
                            when (micState) {
                                MicState.LISTENING -> Icons.Default.Stop
                                MicState.THINKING -> Icons.Default.GraphicEq
                                MicState.SPEAKING -> Icons.Default.GraphicEq
                                MicState.IDLE -> Icons.Default.Mic
                            },
                            contentDescription = when (micState) {
                                MicState.LISTENING -> "Stop"
                                MicState.THINKING -> "Processing"
                                MicState.SPEAKING -> "Speaking"
                                MicState.IDLE -> "Talk"
                            },
                            tint = when (micState) {
                                MicState.LISTENING -> MaterialTheme.colorScheme.onError
                                else -> MaterialTheme.colorScheme.onPrimary
                            },
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }
            }

            // Text input
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text(if (isListening) "Listening…" else "Message…") },
                shape = RoundedCornerShape(50),
                maxLines = 4,
            )

            // Send
            FilledIconButton(
                onClick = {
                    if (input.isNotBlank()) { vm.sendMessage(input); input = "" }
                },
                enabled = !chat.isSending && input.isNotBlank(),
                shape = CircleShape,
                modifier = Modifier.size(48.dp)
            ) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
            }
        }
    }
}

@Composable
private fun ChatBubble(msg: ChatMessage) {
    val cs = MaterialTheme.colorScheme
    val isUser = msg.sender.equals("user", ignoreCase = true)

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        // Agent avatar circle (only for agent messages)
        if (!isUser) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .background(cs.primary.copy(alpha = 0.15f), CircleShape),
                Alignment.Center
            ) {
                Text("🤖", style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.width(Spacing.xs))
        }

        Surface(
            color = if (isUser) cs.primary.copy(alpha = 0.15f) else cs.surfaceVariant.copy(alpha = 0.5f),
            shape = RoundedCornerShape(
                topStart = 16.dp, topEnd = 16.dp,
                bottomEnd = if (isUser) 4.dp else 16.dp,
                bottomStart = if (isUser) 16.dp else 4.dp
            ),
            border = androidx.compose.foundation.BorderStroke(1.dp, cs.onSurface.copy(alpha = 0.06f)),
            modifier = Modifier.widthIn(max = 280.dp)
        ) {
            Text(
                text = msg.text,
                color = cs.onSurface,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.sm)
            )
        }
    }
}
