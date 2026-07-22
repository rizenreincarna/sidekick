package com.rizencc.ui.tabs

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.rizencc.ui.components.AuthWebView
import com.rizencc.ui.components.NeonCard
import com.rizencc.ui.components.NeonSectionHeader
import com.rizencc.ui.components.NeonSegmentButton
import com.rizencc.ui.components.Radii
import com.rizencc.ui.components.Spacing
import com.rizencc.ui.theme.NeonOk
import com.rizencc.ui.theme.NeonWarn
import com.rizencc.ui.viewmodel.RizenViewModel
import com.rizencc.util.Constants

@Composable
fun SettingsTab(
    contentPadding: PaddingValues,
    vm: RizenViewModel = viewModel()
) {
    val tts by vm.tts.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(
                start = Spacing.lg,
                end = Spacing.lg,
                top = contentPadding.calculateTopPadding() + Spacing.md,
                bottom = contentPadding.calculateBottomPadding() + Spacing.xl
            ),
        verticalArrangement = Arrangement.spacedBy(Spacing.md)
    ) {
        NeonSectionHeader(
            title = "Settings",
            subtitle = "Voice engine, voice lab and app info"
        )

        NeonSectionHeader(
            title = "Voice Engine",
            subtitle = "Provider and voice output"
        )

        NeonCard(
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                verticalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .background(
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                                RoundedCornerShape(50)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.GraphicEq,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }

                    Spacer(Modifier.width(Spacing.md))

                    Column(
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(
                            text = "Provider",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        AnimatedContent(
                            targetState = tts.provider ?: "—",
                            transitionSpec = {
                                fadeIn(tween(200)) togetherWith fadeOut(tween(150))
                            },
                            label = "provider-name"
                        ) { provider ->
                            Text(
                                text = provider.replaceFirstChar { it.uppercase() },
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }

                    Column(
                        horizontalAlignment = Alignment.End
                    ) {
                        Text(
                            text = "Voice",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        Text(
                            text = tts.voiceLabel ?: "—",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                HorizontalDivider(
                    color = MaterialTheme.colorScheme.outlineVariant
                )

                Text(
                    text = "Active Engine",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Row(
                    horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    NeonSegmentButton(
                        modifier = Modifier.weight(1f),
                        label = "Edge",
                        subLabel = "Cloud TTS",
                        selected = tts.provider == "edge",
                        onClick = { vm.setTtsProvider("edge") },
                        enabled = !tts.isToggling,
                        selectedColor = NeonOk
                    )

                    NeonSegmentButton(
                        modifier = Modifier.weight(1f),
                        label = "OmniVoice",
                        subLabel = "Neural clone",
                        selected = tts.provider == "omnivoice",
                        onClick = { vm.setTtsProvider("omnivoice") },
                        enabled = !tts.isToggling,
                        selectedColor = NeonWarn
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Toggle",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium
                        )

                        Text(
                            text = "Switch between edge ↔ omnivoice",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    FilledTonalIconButton(
                        onClick = { vm.toggleTts() },
                        enabled = !tts.isToggling,
                        shape = RoundedCornerShape(50)
                    ) {
                        if (tts.isToggling) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.GraphicEq,
                                contentDescription = "Toggle"
                            )
                        }
                    }
                }
            }
        }

        NeonSectionHeader(
            title = "Voice Lab",
            subtitle = "Clone, design, and manage voices"
        )

        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .height(400.dp),
            shape = RoundedCornerShape(Radii.md),
            color = MaterialTheme.colorScheme.surface
        ) {
            AuthWebView(
                url = Constants.VOICE_LAB_URL
            )
        }

        NeonSectionHeader(
            title = "About"
        )

        NeonCard(
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .background(
                            MaterialTheme.colorScheme.tertiary.copy(alpha = 0.12f),
                            RoundedCornerShape(50)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.SmartToy,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.tertiary
                    )
                }

                Spacer(Modifier.width(Spacing.md))

                Column {
                    Text(
                        text = "RizenCC",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold
                    )

                    Text(
                        text = "v1.0 — Neon Cockpit control center for Rizen",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}