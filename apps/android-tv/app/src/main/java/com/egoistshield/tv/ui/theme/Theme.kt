package com.egoistshield.tv.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private val ShieldColorScheme = darkColorScheme(
  primary = ShieldBrand,
  onPrimary = androidx.compose.ui.graphics.Color.White,
  secondary = ShieldAccent,
  tertiary = ShieldSuccess,
  background = ShieldVoid,
  onBackground = ShieldText,
  surface = ShieldSurface,
  onSurface = ShieldText,
  surfaceVariant = ShieldElevated,
  primaryContainer = ShieldSurfaceAlt,
  secondaryContainer = ShieldElevatedSoft,
  outline = ShieldOutline,
  error = ShieldDanger
)

private val ShieldTypography = Typography(
  displayLarge = TextStyle(
    fontWeight = FontWeight.Black,
    fontSize = 48.sp,
    lineHeight = 54.sp,
    letterSpacing = (-0.6).sp
  ),
  headlineLarge = TextStyle(
    fontWeight = FontWeight.Bold,
    fontSize = 32.sp,
    lineHeight = 38.sp,
    letterSpacing = (-0.3).sp
  ),
  headlineMedium = TextStyle(
    fontWeight = FontWeight.Bold,
    fontSize = 28.sp,
    lineHeight = 34.sp,
    letterSpacing = (-0.2).sp
  ),
  headlineSmall = TextStyle(
    fontWeight = FontWeight.SemiBold,
    fontSize = 24.sp,
    lineHeight = 30.sp
  ),
  titleLarge = TextStyle(
    fontWeight = FontWeight.SemiBold,
    fontSize = 24.sp,
    lineHeight = 30.sp,
    letterSpacing = (-0.2).sp
  ),
  titleMedium = TextStyle(
    fontWeight = FontWeight.SemiBold,
    fontSize = 20.sp,
    lineHeight = 26.sp
  ),
  bodyLarge = TextStyle(
    fontWeight = FontWeight.Normal,
    fontSize = 17.sp,
    lineHeight = 25.sp
  ),
  bodyMedium = TextStyle(
    fontWeight = FontWeight.Normal,
    fontSize = 15.sp,
    lineHeight = 22.sp
  ),
  bodySmall = TextStyle(
    fontWeight = FontWeight.Normal,
    fontSize = 13.sp,
    lineHeight = 19.sp
  ),
  labelLarge = TextStyle(
    fontWeight = FontWeight.Bold,
    fontSize = 15.sp,
    lineHeight = 20.sp
  ),
  labelMedium = TextStyle(
    fontWeight = FontWeight.SemiBold,
    fontSize = 12.sp,
    lineHeight = 16.sp,
    letterSpacing = 0.4.sp
  )
)

@Composable
fun EgoistShieldTvTheme(content: @Composable () -> Unit) {
  MaterialTheme(
    colorScheme = ShieldColorScheme,
    typography = ShieldTypography,
    content = content
  )
}
