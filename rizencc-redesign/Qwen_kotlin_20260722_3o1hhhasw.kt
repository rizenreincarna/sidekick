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
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.rizencc.ui.components.ListeningRings
import com.rizencc.ui.components.NeonCard
import com.rizencc.ui.components.NeonChip
import com.rizencc.ui.components.PulseAnimation
import com.rizencc.ui.components.Radii
import com.rizencc.ui.components.Spacing
import com.rizencc.ui.theme.NeonOk
import com.rizencc.ui.viewmodel.ChatMessage
import com.rizencc.ui.viewmodel.RizenViewModel
import com.rizencc.util.Constants
import kotlinx.coroutines.delay

private enum class MicState {
    IDLE,
    LISTENING,
    THINKING,
    SPEAKING
}

@Composable
fun VoiceTab(
    contentPadding: PaddingValues,
    vm: RizenViewModel = viewModel()
) {
    val chat by vm.chat.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val listState = rememberLazyListState()

    var input by remember { mutableStateOf("") }

    var hasMicPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    var isListening by remember { mutableStateOf(false) }
    var liveMode by remember { mutableStateOf(false) }
    var lastSpokeAt by remember { mutableStateOf(0L) }

    val micState = when {
        isListening -> MicState.LISTENING
        chat.isSending -> MicState.THINKING
        chat.isSpeaking -> MicState.SPEAKING
        else -> MicState.IDLE
    }

    LaunchedEffect(chat.isSpeaking) {
        if (!chat.isSpeaking) {
            lastSpokeAt = System.currentTimeMillis()
        }
    }

    val micLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasMicPermission = granted
    }

    val recognizer = remember {
        if (SpeechRecognizer.isRecognitionAvailable(context)) {
            SpeechRecognizer.createSpeechRecognizer(context)
        } else {
            null
        }
    }

    LaunchedEffect(chat.messages.size) {
        if (chat.messages.isNotEmpty()) {
            listState.animateScrollToItem(chat.messages.lastIndex)
        }
    }

    fun startListening() {
        if (!hasMicPermission) {
            micLauncher.launch(Manifest.permission.RECORD_AUDIO)
            return
        }

        val rec = recognizer ?: return

        isListening = true

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            )
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }

        rec.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}

            override fun onError(error: Int) {
                isListening = false
            }

            override fun onResults(results: Bundle?) {
                val texts = results?.getStringArrayList(
                    SpeechRecognizer.RESULTS_RECOGNITION
                )

                val text = texts?.firstOrNull().orEmpty()

                isListening = false

                if (text.isNotBlank()) {
                    vm.sendMessage(text)
                }
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val texts = partialResults?.getStringArrayList(
                    SpeechRecognizer.RESULTS_RECOGNITION
                )

                texts?.firstOrNull()?.let {
                    input = it
                }
            }

            override fun onEvent(eventType: Int, params: Bundle?) {}
        })

        rec.startListening(intent)
    }

    fun stopListening() {
        recognizer?.stopListening()
        isListening = false

        if (liveMode) {
            liveMode = false
        }
    }

    LaunchedEffect(liveMode) {
        while (liveMode) {
            val sinceLastSpoke = System.currentTimeMillis() - lastSpokeAt
            val echoBufferMs = if (lastSpokeAt == 0L) 0L else 300L

            if (
                !isListening &&
                !chat.isSending &&
                !chat.isSpeaking &&
                sinceLastSpoke > echoBufferMs
            ) {
                startListening()
            }

            delay(500)
        }
    }

    DisposableEffect(recognizer) {
        onDispose {
            recognizer?.destroy()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding)
    ) {
        NeonCard(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.md, vertical = Spacing.sm),
            cornerRadius = Radii.lg
        ) {
            Column(
                verticalArrangement = Arrangement.spacedBy(Spacing.sm)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(
                        Spacing.sm,
                        Alignment.CenterHorizontally
                    ),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Constants.AGENTS.forEach { agent ->
                        val selected = chat.activeAgent.equals(
                            agent.id,
                            ignoreCase = true
                        )

                        NeonChip(
                            text = "${agent.emoji} ${agent.name}",
                            color = if (selected) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            selected = selected,
                            onClick = { vm.selectAgent(agent.id) }
                        )
                    }

                    NeonChip(
                        text = "Live",
                        color = if (liveMode) NeonOk else MaterialTheme.colorScheme.onSurfaceVariant,
                        selected = liveMode,
                        onClick = { liveMode = !liveMode }
                    )
                }

                AnimatedContent(
                    targetState = micState,
                    transitionSpec = {
                        fadeIn(tween(200)) togetherWith fadeOut(tween(150))
                    },
                    label = "mic-state"
                ) { state ->
                    val text = when (state) {
                        MicState.IDLE -> ""
                        MicState.LISTENING -> "● listening"
                        MicState.THINKING -> "thinking…"
                        MicState.SPEAKING -> "🔊 speaking"
                    }

                    val color = when (state) {
                        MicState.IDLE -> MaterialTheme.colorScheme.onSurfaceVariant
                        MicState.LISTENING -> MaterialTheme.colorScheme.error
                        MicState.THINKING -> MaterialTheme.colorScheme.tertiary
                        MicState.SPEAKING -> MaterialTheme.colorScheme.secondary
                    }

                    if (text.isNotEmpty()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (state == MicState.THINKING) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(12.dp),
                                    strokeWidth = 2.dp,
                                    color = color
                                )

                                Spacer(Modifier.width(Spacing.xs))
                            }

                            Text(
                                text = text,
                                style = MaterialTheme.typography.labelSmall,
                                color = color
                            )
                        }
                    }
                }
            }
        }

        val activeMsgs = chat.messages.filter {
            it.agent == chat.activeAgent || it.agent == ""
        }

        if (activeMsgs.isEmpty()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(Spacing.xxl)
                ) {
                    Text(
                        text = "🎙️",
                        style = MaterialTheme.typography.displayMedium
                    )

                    Spacer(Modifier.height(Spacing.md))

                    Text(
                        text = "Talk to ${
                            Constants.AGENTS.firstOrNull {
                                it.id == chat.activeAgent
                            }?.name ?: "Marie"
                        }",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onBackground
                    )

                    Spacer(Modifier.height(Spacing.xs))

                    Text(
                        text = "Tap the mic to speak, or type a message below.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )
                }
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.md),
                verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                contentPadding = PaddingValues(vertical = Spacing.sm)
            ) {
                items(activeMsgs) { msg ->
                    ChatBubble(msg)
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm)
        ) {
            Box(
                modifier = Modifier.size(72.dp),
                contentAlignment = Alignment.Center
            ) {
                ListeningRings(
                    active = isListening,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.fillMaxSize()
                )

                PulseAnimation(active = isListening) { scale, _ ->
                    IconButton(
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
                            )
                    ) {
                        Icon(
                            imageVector = when (micState) {
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

            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                modifier = Modifier.weight(1f),
                placeholder = {
                    Text(
                        text = if (isListening) "Listening…" else "Message…"
                    )
                },
                shape = RoundedCornerShape(50),
                maxLines = 4
            )

            FilledIconButton(
                onClick = {
                    if (input.isNotBlank()) {
                        vm.sendMessage(input)
                        input = ""
                    }
                },
                enabled = !chat.isSending && input.isNotBlank(),
                shape = CircleShape,
                modifier = Modifier.size(48.dp)
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Send,
                    contentDescription = "Send"
                )
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
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        if (!isUser) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .background(cs.primary.copy(alpha = 0.15f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "🤖",
                    style = MaterialTheme.typography.bodySmall
                )
            }

            Spacer(Modifier.width(Spacing.xs))
        }

        Surface(
            color = if (isUser) {
                cs.primary.copy(alpha = 0.15f)
            } else {
                cs.surfaceVariant.copy(alpha = 0.5f)
            },
            shape = RoundedCornerShape(
                topStart = 16.dp,
                topEnd = 16.dp,
                bottomEnd = if (isUser) 4.dp else 16.dp,
                bottomStart = if (isUser) 16.dp else 4.dp
            ),
            border = BorderStroke(
                width = 1.dp,
                color = cs.onSurface.copy(alpha = 0.06f)
            ),
            modifier = Modifier.widthIn(max = 280.dp)
        ) {
            Text(
                text = msg.text,
                color = cs.onSurface,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(
                    horizontal = Spacing.md,
                    vertical = Spacing.sm
                )
            )
        }
    }
}