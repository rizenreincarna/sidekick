package com.rizencc.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.rizencc.ui.theme.NeonErr
import com.rizencc.ui.theme.NeonOk
import com.rizencc.ui.theme.NeonWarn

// ── Background ─────────────────────────────────────────────────
object Spacing {
    val xs = 4.dp   // tight gaps
    val sm = 8.dp   // standard chip / icon gap
    val md = 12.dp  // inner content padding
    val lg = 16.dp  // card padding
    val xl = 24.dp  // section spacing
    val xxl = 32.dp // screen-edge padding
}

object Radii {
    val sm = 12.dp  // chips, small buttons
    val md = 16.dp  // cards
    val lg = 20.dp  // large cards
    val xl = 28.dp  // bottom nav pill
    val pill = 50   // percentage for fully rounded pill
}

@Composable
fun NeonBackground(
    modifier: Modifier = Modifier
) {
    val cs = MaterialTheme.colorScheme

    Box(
        modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(0f to cs.background,
                        0.45f to cs.surface.copy(alpha = 0.35f),
                        1f to cs.background)
            )
    )
}

// ── Surfaces ───────────────────────────────────────────────────
@Composable
fun NeonSurface(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = Radii.lg,
    content: @Composable BoxScope.() -> Unit
) {
    val cs = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(cornerRadius)

    Box(
        modifier
            .clip(shape)
            .background(cs.surface.copy(alpha = 0.92f))
            .border(1.dp, cs.outline, shape)
    ) {
        content()
    }
}

@Composable
fun NeonCard(
    modifier: Modifier = Modifier,
    padding: Dp = Spacing.lg,
    cornerRadius: Dp = Radii.lg,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val cs = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(cornerRadius)

    Surface(
        modifier = modifier.then(
            if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier
        ),
        shape = shape,
        color = cs.surface.copy(alpha = 0.94f),
        border = BorderStroke(1.dp, cs.outline),
        tonalElevation = 0.dp
    ) {
        Column(
            modifier = Modifier.padding(padding)
        ) {
            content()
        }
    }
}

@Composable
fun NeonHeroCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    val cs = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(Radii.lg)

    Box(
        modifier
            .clip(shape)
            .background(
                Brush.linearGradient(0f to cs.primary.copy(alpha = 0.16f),
                        0.55f to cs.secondary.copy(alpha = 0.08f),
                        1f to cs.surface.copy(alpha = 0.94f))
            )
            .border(
                width = 1.dp,
                color = cs.primary.copy(alpha = 0.18f),
                shape = shape
            )
            .padding(Spacing.lg)
    ) {
        Column {
            content()
        }
    }
}

// ── Headers ────────────────────────────────────────────────────
@Composable
fun NeonSectionHeader(
    title: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier,
    action: @Composable (RowScope.() -> Unit)? = null
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(
            modifier = Modifier.weight(1f)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )

            if (subtitle != null) {
                Spacer(Modifier.height(2.dp))

                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        action?.invoke(this)
    }
}

// ── Chips ──────────────────────────────────────────────────────
@Composable
fun NeonChip(
    text: String,
    color: Color,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    onClick: (() -> Unit)? = null
) {
    val shape = RoundedCornerShape(50)

    Row(
        modifier = modifier
            .then(
                if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier
            )
            .clip(shape)
            .background(color.copy(alpha = if (selected) 0.16f else 0.08f))
            .border(
                width = 1.dp,
                color = color.copy(alpha = if (selected) 0.45f else 0.22f),
                shape = shape
            )
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = color
        )
    }
}

// ── Pulse dot ──────────────────────────────────────────────────
@Composable
fun PulseDot(
    color: Color = MaterialTheme.colorScheme.primary,
    modifier: Modifier = Modifier
) {
    val transition = rememberInfiniteTransition(label = "pulse")

    val alpha by transition.animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse-alpha"
    )

    Box(
        modifier
            .size(8.dp)
            .clip(CircleShape)
            .background(color.copy(alpha = alpha))
    )
}

// ── Progress ───────────────────────────────────────────────────
@Composable
fun NeonProgress(
    percent: Float,
    color: Color,
    modifier: Modifier = Modifier
) {
    LinearProgressIndicator(
        progress = { percent.coerceIn(0f, 1f) },
        color = color,
        trackColor = color.copy(alpha = 0.12f),
        modifier = modifier
            .fillMaxWidth()
            .height(8.dp)
            .clip(RoundedCornerShape(50))
    )
}

// ── Quick action ───────────────────────────────────────────────
@Composable
fun NeonQuickAction(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    NeonCard(
        modifier = modifier,
        padding = Spacing.md,
        onClick = onClick
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = Spacing.sm),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp)
            )

            Spacer(Modifier.height(8.dp))

            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

// ── Stat tile ──────────────────────────────────────────────────
@Composable
fun NeonStatTile(
    label: String,
    value: String,
    sub: String? = null,
    color: Color,
    modifier: Modifier = Modifier,
    progress: Float? = null
) {
    NeonCard(
        modifier = modifier,
        padding = Spacing.md
    ) {
        Column(
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = label.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.Bold
            )

            Spacer(Modifier.height(8.dp))

            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = color
            )

            if (sub != null) {
                Spacer(Modifier.height(4.dp))

                Text(
                    text = sub,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (progress != null) {
                Spacer(Modifier.height(10.dp))

                NeonProgress(
                    percent = progress,
                    color = color
                )
            }
        }
    }
}

// ── Key/value ──────────────────────────────────────────────────
@Composable
fun NeonKeyValue(
    key: String,
    value: String,
    modifier: Modifier = Modifier
) {
    NeonCard(
        modifier = modifier,
        padding = Spacing.md
    ) {
        Text(
            text = key.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.Bold
        )

        Spacer(Modifier.height(6.dp))

        Text(
            text = value,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold
        )
    }
}

// ── Top bar ────────────────────────────────────────────────────
@Composable
fun NeonTopBar(
    title: String,
    subtitle: String,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    val cs = MaterialTheme.colorScheme

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(cs.background.copy(alpha = 0.88f))
            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(cs.primary.copy(alpha = 0.14f))
                .border(
                    width = 1.dp,
                    color = cs.primary.copy(alpha = 0.22f),
                    shape = RoundedCornerShape(14.dp)
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "⬡",
                color = cs.primary,
                style = MaterialTheme.typography.titleMedium
            )
        }

        Spacer(Modifier.width(12.dp))

        Column(
            modifier = Modifier.weight(1f)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )

            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                PulseDot()

                Spacer(Modifier.width(6.dp))

                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = cs.onSurfaceVariant
                )
            }
        }

        IconButton(onClick = onRefresh) {
            Icon(
                imageVector = Icons.Default.Refresh,
                contentDescription = "Refresh",
                tint = cs.primary
            )
        }
    }
}

// ── Bottom bar ─────────────────────────────────────────────────
@Composable
fun NeonBottomBar(
    items: List<Pair<String, ImageVector>>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val cs = MaterialTheme.colorScheme

    NeonSurface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.md, vertical = Spacing.sm),
        cornerRadius = Radii.xl
    ) {
        Row(
            modifier = Modifier
                .padding(6.dp)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceAround,
            verticalAlignment = Alignment.CenterVertically
        ) {
            items.forEachIndexed { index, item ->
                val selected = selectedIndex == index

                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { onSelect(index) }
                        .padding(vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        imageVector = item.second,
                        contentDescription = item.first,
                        tint = if (selected) cs.primary else cs.onSurfaceVariant,
                        modifier = Modifier.size(if (selected) 24.dp else 20.dp)
                    )

                    Spacer(Modifier.height(4.dp))

                    Text(
                        text = item.first,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = if (selected) cs.primary else cs.onSurfaceVariant
                    )
                }
            }
        }
    }
}

// ── Segment button ─────────────────────────────────────────────
@Composable
fun NeonSegmentButton(
    label: String,
    subLabel: String,
    selected: Boolean,
    onClick: () -> Unit,
    enabled: Boolean,
    selectedColor: Color,
    modifier: Modifier = Modifier
) {
    val cs = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(Radii.sm)

    Box(
        modifier = modifier
            .clip(shape)
            .background(
                if (selected) selectedColor.copy(alpha = 0.12f)
                else cs.surfaceVariant.copy(alpha = 0.3f)
            )
            .border(
                width = 1.dp,
                color = if (selected) selectedColor.copy(alpha = 0.5f) else cs.outlineVariant,
                shape = shape
            )
            .clickable(
                enabled = enabled,
                onClick = onClick
            )
            .padding(Spacing.md),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = if (selected) selectedColor else cs.onSurface
            )

            Text(
                text = subLabel,
                style = MaterialTheme.typography.labelSmall,
                color = cs.onSurfaceVariant
            )
        }
    }
}

// ── Loading / error ────────────────────────────────────────────
@Composable
fun NeonLoadingCard(
    modifier: Modifier = Modifier
) {
    NeonCard(modifier) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.xl),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(32.dp),
                strokeWidth = 2.dp
            )
        }
    }
}

@Composable
fun NeonErrorCard(
    message: String,
    modifier: Modifier = Modifier
) {
    NeonCard(modifier) {
        Text(
            text = "Error: $message",
            style = MaterialTheme.typography.labelSmall,
            color = NeonErr
        )
    }
}

// ── Helper color logic ─────────────────────────────────────────
fun neonUsageColor(percent: Double): Color {
    return when {
        percent >= 85.0 -> NeonErr
        percent >= 60.0 -> NeonWarn
        else -> NeonOk
    }
}

fun neonLoadColor(value: Double, cores: Int): Color {
    val ratio = (value / cores).coerceIn(0.0, 2.0)

    return when {
        ratio > 0.8 -> NeonErr
        ratio > 0.5 -> NeonWarn
        else -> NeonOk
    }
}

// ── Recording pulse (used by Voice tab) ──────────────────────────
@Composable
fun PulseAnimation(
    active: Boolean,
    content: @Composable (scale: Float, alpha: Float) -> Unit
) {
    val transition = if (active) rememberInfiniteTransition(label = "pulse") else null
    val scale by transition?.animateFloat(
        initialValue = 1f, targetValue = 1.18f,
        animationSpec = infiniteRepeatable(tween(700, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "pulse-scale"
    ) ?: androidx.compose.runtime.mutableFloatStateOf(1f)
    val alpha by transition?.animateFloat(
        initialValue = 0.8f, targetValue = 0.3f,
        animationSpec = infiniteRepeatable(tween(700, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "pulse-alpha"
    ) ?: androidx.compose.runtime.mutableFloatStateOf(1f)
    content(scale, alpha)
}

@Composable
fun ListeningRings(
    active: Boolean,
    color: Color,
    modifier: Modifier = Modifier,
    maxRadius: Dp = 72.dp
) {
    if (!active) return
    val transition = rememberInfiniteTransition(label = "rings")
    val scale by transition.animateFloat(
        initialValue = 0.6f, targetValue = 1.4f,
        animationSpec = infiniteRepeatable(tween(1200, easing = LinearEasing), RepeatMode.Restart),
        label = "ring-scale"
    )
    val alpha by transition.animateFloat(
        initialValue = 0.5f, targetValue = 0f,
        animationSpec = infiniteRepeatable(tween(1200, easing = LinearEasing), RepeatMode.Restart),
        label = "ring-alpha"
    )
    Box(modifier) {
        Box(
            Modifier.size(maxRadius * scale).clip(CircleShape).background(color.copy(alpha = alpha)).align(Alignment.Center)
        )
    }
}
