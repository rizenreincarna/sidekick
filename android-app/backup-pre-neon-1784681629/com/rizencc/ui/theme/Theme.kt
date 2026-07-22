package com.rizencc.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// ── Brand Palette ──────────────────────────────────────────────
// Extended from colors.xml — these are the source of truth.

// Accents
val AccentGreen = Color(0xFF34D399)   // healthy / positive / primary
val AccentAmber = Color(0xFFF59E0B)   // warning / secondary
val AccentRed   = Color(0xFFEF4444)   // critical / error
val AccentBlue  = Color(0xFF60A5FA)   // info / tertiary

// Dark-first backgrounds
val DarkBg     = Color(0xFF0B0F17)    // deep near-black navy
val DarkSurface = Color(0xFF111827)
val DarkElevated = Color(0xFF1A2030)

// Light variants
val LightBg     = Color(0xFFF8FAFC)
val LightSurface = Color(0xFFFFFFFF)
val LightElevated = Color(0xFFF1F5F9)

// Glass overlay tints
val GlassDark  = Color(0x1AFFFFFF)   // 10% white over dark
val GlassLight = Color(0x1A000000)   // 10% black over light

private val DarkColors = darkColorScheme(
    primary = AccentGreen,
    onPrimary = Color(0xFF01140B),
    secondary = AccentAmber,
    onSecondary = Color(0xFF1A1000),
    tertiary = AccentBlue,
    onTertiary = Color(0xFF001533),
    error = AccentRed,
    onError = Color(0xFF2B0606),

    background = DarkBg,
    onBackground = Color(0xFFE8EDF5),
    surface = DarkSurface,
    onSurface = Color(0xFFE8EDF5),
    surfaceVariant = DarkElevated,
    onSurfaceVariant = Color(0xFF9AA8BE),

    outline = Color(0xFF2D3850),
    outlineVariant = Color(0xFF1F2838),
    scrim = Color(0xF00B0F17),
    inverseSurface = Color(0xFFE8EDF5),
    inverseOnSurface = Color(0xFF111827),
)

private val LightColors = lightColorScheme(
    primary = AccentGreen,
    onPrimary = Color.White,
    secondary = AccentAmber,
    onSecondary = Color.White,
    tertiary = AccentBlue,
    onTertiary = Color.White,
    error = AccentRed,
    onError = Color.White,

    background = LightBg,
    onBackground = Color(0xFF1E293B),
    surface = LightSurface,
    onSurface = Color(0xFF1E293B),
    surfaceVariant = LightElevated,
    onSurfaceVariant = Color(0xFF64748B),

    outline = Color(0xFFCBD5E1),
    outlineVariant = Color(0xFFE2E8F0),
    scrim = Color(0xF0F8FAFC),
    inverseSurface = Color(0xFF1E293B),
    inverseOnSurface = Color(0xFFF8FAFC),
)

@Composable
fun RizenTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val cs = if (darkTheme) DarkColors else LightColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            WindowCompat.setDecorFitsSystemWindows(window, true)
            window.statusBarColor = cs.background.toArgb()
            window.navigationBarColor = cs.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = !darkTheme
        }
    }
    MaterialTheme(
        colorScheme = cs,
        typography = Typography,
        content = content
    )
}
