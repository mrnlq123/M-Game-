package com.worldarena.game.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val ObsidianBg = Color(0xFF070B14)
val NavySurface = Color(0xFF0D1526)
val NavyElevated = Color(0xFF131E36)
val ElectricBlue = Color(0xFF06B6D4)
val VoltPurple = Color(0xFF7C3AED)
val CrimsonRed = Color(0xFFF43F5E)

private val WorldArenaColorScheme = darkColorScheme(
    primary = ElectricBlue,
    secondary = VoltPurple,
    background = ObsidianBg,
    surface = NavySurface,
    surfaceVariant = NavyElevated,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onBackground = Color(0xFFF8FAFC),
    onSurface = Color(0xFFE2E8F0),
    error = CrimsonRed
)

@Composable
fun WorldArenaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = WorldArenaColorScheme,
        content = content
    )
}
