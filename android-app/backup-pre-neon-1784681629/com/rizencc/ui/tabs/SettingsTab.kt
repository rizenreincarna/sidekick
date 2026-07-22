package com.rizencc.ui.tabs

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.rizencc.ui.components.*
import com.rizencc.ui.theme.AccentAmber
import com.rizencc.ui.theme.AccentGreen
import com.rizencc.ui.viewmodel.RizenViewModel
import com.rizencc.util.Constants

@Composable
fun SettingsTab(
    contentPadding: PaddingValues,
    vm: RizenViewModel = viewModel(),
) {
    val tts by vm.tts.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(
                start = Spacing.lg, end = Spacing.lg,
                top = contentPadding.calculateTopPadding() + Spacing.md,
                bottom = contentPadding.calculateBottomPadding() + Spacing.xl
            ),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        // ── Screen title ──
        Text("Settings", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)

        // ── Section: TTS Provider ──
        SectionHeader("Voice Engine")
        GlassCard(Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.md)) {
                // Current provider + voice display
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        Modifier.size(40.dp).background(
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                            RoundedCornerShape(50)
                        ),
                        Alignment.Center
                    ) {
                        Icon(Icons.Default.GraphicEq, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    }
                    Spacer(Modifier.width(Spacing.md))
                    Column(Modifier.weight(1f)) {
                        Text("Provider", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        AnimatedContent(
                            targetState = tts.provider ?: "—",
                            transitionSpec = { fadeIn(tween(200)) togetherWith fadeOut(tween(150)) },
                            label = "provider-name"
                        ) { provider ->
                            Text(
                                provider.replaceFirstChar { it.uppercase() },
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("Voice", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            tts.voiceLabel ?: "—",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

                // Segmented provider picker
                Text("Active Engine", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs), modifier = Modifier.fillMaxWidth()) {
                    SegmentButton(
                        modifier = Modifier.weight(1f),
                        label = "Edge",
                        subLabel = "Cloud TTS",
                        selected = tts.provider == "edge",
                        onClick = { vm.setTtsProvider("edge") },
                        enabled = !tts.isToggling,
                        selectedColor = AccentGreen
                    )
                    SegmentButton(
                        modifier = Modifier.weight(1f),
                        label = "OmniVoice",
                        subLabel = "Neural clone",
                        selected = tts.provider == "omnivoice",
                        onClick = { vm.setTtsProvider("omnivoice") },
                        enabled = !tts.isToggling,
                        selectedColor = AccentAmber
                    )
                }

                // Quick toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("Toggle", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                        Text("Switch between edge ↔ omnivoice", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    FilledTonalIconButton(
                        onClick = { vm.toggleTts() },
                        enabled = !tts.isToggling,
                        shape = RoundedCornerShape(50)
                    ) {
                        if (tts.isToggling) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Default.GraphicEq, contentDescription = "Toggle")
                        }
                    }
                }
            }
        }

        // ── Section: Voice Lab ──
        SectionHeader("Voice Lab")
        Text(
            "Clone, design, and manage voices",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .height(400.dp),
            shape = RoundedCornerShape(Radii.md),
            color = MaterialTheme.colorScheme.surface
        ) {
            AuthWebView(url = Constants.VOICE_LAB_URL)
        }

        // ── Section: About ──
        SectionHeader("About")
        GlassCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(40.dp).background(
                        MaterialTheme.colorScheme.tertiary.copy(alpha = 0.12f),
                        RoundedCornerShape(50)
                    ),
                    Alignment.Center
                ) {
                    Icon(Icons.Default.SmartToy, contentDescription = null, tint = MaterialTheme.colorScheme.tertiary)
                }
                Spacer(Modifier.width(Spacing.md))
                Column {
                    Text("RizenCC", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Text("v1.0 — Mobile control center for Rizen", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = Spacing.sm)
    )
}

@Composable
private fun SegmentButton(
    modifier: Modifier = Modifier,
    label: String,
    subLabel: String,
    selected: Boolean,
    onClick: () -> Unit,
    enabled: Boolean,
    selectedColor: androidx.compose.ui.graphics.Color
) {
    val cs = MaterialTheme.colorScheme
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(Radii.sm),
        color = if (selected) selectedColor.copy(alpha = 0.12f) else cs.surfaceVariant.copy(alpha = 0.3f),
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            if (selected) selectedColor.copy(alpha = 0.5f) else cs.outlineVariant
        ),
        onClick = onClick,
        enabled = enabled,
    ) {
        Column(
            modifier = Modifier.padding(Spacing.md),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                label,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = if (selected) selectedColor else cs.onSurface
            )
            Text(subLabel, style = MaterialTheme.typography.labelSmall, color = cs.onSurfaceVariant)
        }
    }
}
