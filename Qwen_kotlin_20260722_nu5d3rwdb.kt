package com.rizencc.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// ── Neon Cockpit Palette ───────────────────────────────────────
val NeonTeal = Color(0xFF2DD4BF)
val NeonCyan = Color(0xFF22D3EE)
val NeonViolet = Color(0xFFA78BFA)

val NeonOk = Color(0xFF34D399)
val NeonWarn = Color(0xFFFBBF24)
val NeonErr = Color(0xFFFB7185)

val NeonBg = Color(0xFF04070B)
val NeonSurface = Color(0xFF0A121A)
val NeonElevated = Color(0xFF0D1822)

val NeonText = Color(0xFFE8FBF7)
val NeonMuted = Color(0xFF8AA8A3)

// Backward-compatible aliases for any existing references.
val AccentGreen = NeonOk
val AccentAmber = NeonWarn
val AccentRed = NeonErr
val AccentBlue = NeonCyan

private val NeonDarkColors = darkColorScheme(
    primary = NeonTeal,
    onPrimary = Color(0xFF03201C),

    secondary = NeonCyan,
    onSecondary = Color(0xFF03222B),

    tertiary = NeonViolet,
    onTertiary = Color(0xFF120B2E),

    error = NeonErr,
    onError = Color(0xFF2B060D),

    background = NeonBg,
    onBackground = NeonText,

    surface = NeonSurface,
    onSurface = NeonText,

    surfaceVariant = NeonElevated,
    onSurfaceVariant = NeonMuted,

    outline = Color(0x1F5EEAD4),
    outlineVariant = Color(0x2494A3B8),

    scrim = Color(0xF004070B),
    inverseSurface = NeonText,
    inverseOnSurface = NeonBg,
)

@Composable
fun RizenTheme(
    content: @Composable () -> Unit
) {
    val view = LocalView.current

    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect

            window.statusBarColor = NeonBg.toArgb()
            window.navigationBarColor = NeonBg.toArgb()

            WindowCompat.setDecorFitsSystemWindows(window, true)

            WindowCompat.getInsetsController(window, view)
                .isAppearanceLightStatusBars = false

            WindowCompat.getInsetsController(window, view)
                .isAppearanceLightNavigationBars = false
        }
    }

    MaterialTheme(
        colorScheme = NeonDarkColors,
        typography = Typography,
        content = content
    )
}