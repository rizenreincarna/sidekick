package com.rizencc.ui.components

import android.os.Build
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// ── Spacing & Shape Tokens ─────────────────────────────────────
// Use these everywhere instead of ad-hoc dp values for consistency.

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

// ── Glass Surfaces ──────────────────────────────────────────────

/**
 * Translucent blurred surface — the foundation of every container.
 * On Android 12+ uses real backdrop blur; older devices fall back to
 * a higher-alpha tint so text still reads.
 */
@Composable
fun GlassSurface(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = Radii.lg,
    shape: Shape? = null,
    blurEnabled: Boolean = true,
    content: @Composable () -> Unit
) {
    val s = shape ?: RoundedCornerShape(cornerRadius)
    val cs = MaterialTheme.colorScheme
    val alpha = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && blurEnabled) 0.45f else 0.85f
    val blurMod = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && blurEnabled) {
        Modifier.blur(24.dp)
    } else Modifier

    Box(modifier) {
        Box(Modifier.matchParentSize().then(blurMod).background(cs.surface.copy(alpha = alpha), s))
        // Subtle highlight border — 1px above-background tint
        Box(Modifier.matchParentSize().border(1.dp, cs.onSurface.copy(alpha = 0.10f), s))
        content()
    }
}

@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    padding: Dp = Spacing.lg,
    cornerRadius: Dp = Radii.lg,
    content: @Composable () -> Unit
) {
    GlassSurface(modifier, cornerRadius) {
        Box(Modifier.padding(padding)) { content() }
    }
}

/** Full-screen gradient backdrop. */
@Composable
fun GlassBackground(modifier: Modifier = Modifier) {
    val cs = MaterialTheme.colorScheme
    Box(
        modifier.fillMaxSize().background(
            Brush.verticalGradient(
                0f to cs.background,
                1f to cs.surfaceVariant.copy(alpha = 0.5f)
            )
        )
    )
}

// ── Recording pulse ────────────────────────────────────────────

@Composable
fun PulseAnimation(
    active: Boolean,
    content: @Composable (scale: Float, alpha: Float) -> Unit
) {
    val transition = if (active) rememberInfiniteTransition(label = "pulse") else null
    val scale by transition?.animateFloat(
        initialValue = 1f, targetValue = 1.18f,
        animationSpec = infiniteRepeatable(
            tween(700, easing = FastOutSlowInEasing),
            RepeatMode.Reverse
        ),
        label = "pulse-scale"
    ) ?: androidx.compose.runtime.mutableFloatStateOf(1f)
    val alpha by transition?.animateFloat(
        initialValue = 0.8f, targetValue = 0.3f,
        animationSpec = infiniteRepeatable(
            tween(700, easing = FastOutSlowInEasing),
            RepeatMode.Reverse
        ),
        label = "pulse-alpha"
    ) ?: androidx.compose.runtime.mutableFloatStateOf(1f)
    content(scale, alpha)
}

/**
 * Expanding ripple ring used behind the mic button while listening.
 * Renders N concentric circles pulsing outward.
 */
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
        // Two offset rings for a layered effect
        Box(
            Modifier
                .size(maxRadius * scale)
                .clip(CircleShape)
                .background(color.copy(alpha = alpha))
                .align(Alignment.Center)
        )
    }
}
