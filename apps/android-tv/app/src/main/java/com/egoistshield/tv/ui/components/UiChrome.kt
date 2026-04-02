package com.egoistshield.tv.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Dns
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.TravelExplore
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.egoistshield.tv.R
import com.egoistshield.tv.model.AppDestination
import com.egoistshield.tv.ui.theme.ShieldAccent
import com.egoistshield.tv.ui.theme.ShieldBrand
import com.egoistshield.tv.ui.theme.ShieldBrandLight
import com.egoistshield.tv.ui.theme.ShieldElevated
import com.egoistshield.tv.ui.theme.ShieldElevatedSoft
import com.egoistshield.tv.ui.theme.ShieldOutline
import com.egoistshield.tv.ui.theme.ShieldSuccess
import com.egoistshield.tv.ui.theme.ShieldSurface
import com.egoistshield.tv.ui.theme.ShieldSurfaceAlt
import com.egoistshield.tv.ui.theme.ShieldTextMuted
import com.egoistshield.tv.ui.theme.ShieldVoid

@Composable
fun AppBackdrop(modifier: Modifier = Modifier) {
  Box(
    modifier = modifier
      .fillMaxSize()
      .background(
        Brush.linearGradient(
          colors = listOf(
            ShieldVoid,
            ShieldSurface,
            ShieldSurfaceAlt,
            ShieldVoid
          )
        )
      )
  ) {
    Box(
      modifier = Modifier
        .fillMaxSize()
        .background(
          Brush.verticalGradient(
            colors = listOf(
              Color.White.copy(alpha = 0.015f),
              Color.Transparent,
              ShieldBrand.copy(alpha = 0.03f)
            )
          )
        )
    )
    Box(
      modifier = Modifier
        .align(Alignment.TopEnd)
        .padding(top = 42.dp, end = 84.dp)
        .size(420.dp)
        .clip(CircleShape)
        .background(Brush.radialGradient(colors = listOf(ShieldBrand.copy(alpha = 0.22f), Color.Transparent)))
    )
    Box(
      modifier = Modifier
        .align(Alignment.TopStart)
        .padding(top = 96.dp, start = 28.dp)
        .size(240.dp)
        .clip(CircleShape)
        .background(Brush.radialGradient(colors = listOf(ShieldBrandLight.copy(alpha = 0.1f), Color.Transparent)))
    )
    Box(
      modifier = Modifier
        .align(Alignment.BottomStart)
        .padding(start = 56.dp, bottom = 48.dp)
        .size(340.dp)
        .clip(CircleShape)
        .background(Brush.radialGradient(colors = listOf(ShieldAccent.copy(alpha = 0.14f), Color.Transparent)))
    )
  }
}

@Composable
fun AppNavigationRail(
  current: AppDestination,
  onSelect: (AppDestination) -> Unit,
  modifier: Modifier = Modifier,
  subtitle: String = "Android клиент"
) {
  Surface(
    modifier = modifier.width(184.dp),
    color = ShieldSurface.copy(alpha = 0.88f),
    contentColor = MaterialTheme.colorScheme.onSurface,
    shape = RoundedCornerShape(32.dp),
    border = BorderStroke(1.dp, ShieldOutline.copy(alpha = 0.8f))
  ) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(horizontal = 14.dp, vertical = 18.dp),
      verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
      Column(
        modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
      ) {
        androidx.compose.foundation.Image(
          painter = painterResource(id = R.drawable.ic_shield_logo),
          contentDescription = null,
          modifier = Modifier.size(62.dp)
        )
        Text(
          text = "EgoistShield",
          style = MaterialTheme.typography.titleSmall,
          fontWeight = FontWeight.Bold,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis
        )
        Text(
          text = subtitle,
          style = MaterialTheme.typography.bodySmall,
          color = ShieldTextMuted,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis
        )
      }

      navItems.forEach { item ->
        FocusableCard(
          modifier = Modifier.fillMaxWidth(),
          selected = current == item.destination,
          contentPadding = PaddingValues(horizontal = 18.dp, vertical = 16.dp),
          onClick = { onSelect(item.destination) }
        ) {
          Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
          ) {
            androidx.compose.material3.Icon(
              imageVector = item.icon,
              contentDescription = null,
              tint = if (current == item.destination) ShieldBrandLight else MaterialTheme.colorScheme.onSurface
            )
            Text(
              text = item.label,
              style = MaterialTheme.typography.labelLarge,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis
            )
          }
        }
      }

    }
  }
}

@Composable
fun AppCompactHeader(subtitle: String, modifier: Modifier = Modifier) {
  Surface(
    modifier = modifier,
    color = ShieldSurface.copy(alpha = 0.68f),
    contentColor = MaterialTheme.colorScheme.onSurface,
    shape = RoundedCornerShape(26.dp),
    border = BorderStroke(1.dp, ShieldOutline.copy(alpha = 0.72f))
  ) {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 16.dp, vertical = 12.dp),
      horizontalArrangement = Arrangement.spacedBy(12.dp),
      verticalAlignment = Alignment.CenterVertically
    ) {
      androidx.compose.foundation.Image(
        painter = painterResource(id = R.drawable.ic_shield_logo),
        contentDescription = null,
        modifier = Modifier.size(34.dp)
      )
      Column(
        modifier = Modifier.weight(1f),
        verticalArrangement = Arrangement.spacedBy(2.dp)
      ) {
        Text(
          text = "EgoistShield",
          style = MaterialTheme.typography.titleMedium,
          fontWeight = FontWeight.Bold
        )
        Text(
          text = subtitle,
          style = MaterialTheme.typography.labelMedium,
          color = ShieldTextMuted
        )
      }
      Surface(
        shape = RoundedCornerShape(999.dp),
        color = ShieldBrand.copy(alpha = 0.14f),
        border = BorderStroke(1.dp, ShieldBrandLight.copy(alpha = 0.4f))
      ) {
        Text(
          text = "CORE",
          modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
          style = MaterialTheme.typography.labelMedium,
          color = ShieldBrandLight
        )
      }
    }
  }
}

@Composable
fun AppBottomNavigation(
  current: AppDestination,
  onSelect: (AppDestination) -> Unit
) {
  Surface(
    color = ShieldSurface.copy(alpha = 0.96f),
    contentColor = MaterialTheme.colorScheme.onSurface,
    shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
    border = BorderStroke(1.dp, ShieldOutline.copy(alpha = 0.7f))
  ) {
    NavigationBar(
      containerColor = Color.Transparent,
      contentColor = MaterialTheme.colorScheme.onSurface
    ) {
      navItems.forEach { item ->
        NavigationBarItem(
          selected = current == item.destination,
          onClick = { onSelect(item.destination) },
          icon = {
            androidx.compose.material3.Icon(
              imageVector = item.icon,
              contentDescription = item.label
            )
          },
          label = {
            Text(
              text = item.label,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis
            )
          },
          colors = NavigationBarItemDefaults.colors(
            selectedIconColor = ShieldBrandLight,
            selectedTextColor = ShieldBrandLight,
            indicatorColor = ShieldBrand.copy(alpha = 0.18f),
            unselectedIconColor = MaterialTheme.colorScheme.onSurface,
            unselectedTextColor = ShieldTextMuted
          )
        )
      }
    }
  }
}

@Composable
fun FocusableCard(
  modifier: Modifier = Modifier,
  selected: Boolean = false,
  contentPadding: PaddingValues? = null,
  compact: Boolean = false,
  onClick: (() -> Unit)? = null,
  content: @Composable ColumnScope.(Boolean) -> Unit
) {
  var focused by remember { mutableStateOf(false) }
  val shape = RoundedCornerShape(if (compact) 24.dp else 28.dp)
  val resolvedContentPadding = contentPadding ?: if (compact) {
    PaddingValues(horizontal = 16.dp, vertical = 16.dp)
  } else {
    PaddingValues(20.dp)
  }
  val scale by animateFloatAsState(
    targetValue = if (focused) {
      if (compact) 1.01f else 1.03f
    } else {
      1f
    },
    label = "card-scale"
  )
  val shadowElevation by animateDpAsState(
    targetValue = when {
      focused -> if (compact) 18.dp else 24.dp
      selected -> if (compact) 10.dp else 14.dp
      else -> 0.dp
    },
    label = "card-shadow"
  )
  val background by animateColorAsState(
    targetValue = when {
      selected -> ShieldBrand.copy(alpha = 0.16f)
      focused -> ShieldElevatedSoft.copy(alpha = 0.96f)
      else -> ShieldElevated.copy(alpha = 0.86f)
    },
    label = "card-background"
  )
  val borderColor by animateColorAsState(
    targetValue = if (selected || focused) ShieldBrandLight else ShieldOutline,
    label = "card-border"
  )

  Surface(
    modifier = modifier
      .shadow(shadowElevation, shape, clip = false)
      .graphicsLayer {
        scaleX = scale
        scaleY = scale
      }
      .then(
        if (onClick != null) {
          Modifier
            .onFocusChanged { focused = it.hasFocus }
            .focusable()
            .clickable(onClick = onClick)
        } else {
          Modifier
        }
    ),
    color = background,
    contentColor = MaterialTheme.colorScheme.onSurface,
    shape = shape,
    border = BorderStroke(if (selected || focused) if (compact) 1.5.dp else 2.dp else 1.dp, borderColor)
  ) {
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .padding(resolvedContentPadding),
      verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 10.dp)
    ) {
      content(focused)
    }
  }
}

@Composable
fun SectionHeader(
  title: String,
  body: String,
  eyebrow: String? = null,
  compact: Boolean = false
) {
  Column(verticalArrangement = Arrangement.spacedBy(if (compact) 3.dp else 6.dp)) {
    if (!eyebrow.isNullOrBlank()) {
      Text(
        text = eyebrow.uppercase(),
        style = if (compact) MaterialTheme.typography.labelMedium else MaterialTheme.typography.labelLarge,
        color = ShieldBrandLight
      )
    }
    Text(
      text = title,
      style = if (compact) MaterialTheme.typography.titleLarge else MaterialTheme.typography.headlineMedium,
      color = MaterialTheme.colorScheme.onBackground,
      maxLines = if (compact) 2 else 2,
      overflow = TextOverflow.Ellipsis
    )
    Text(
      text = body,
      style = if (compact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyLarge,
      color = ShieldTextMuted,
      maxLines = if (compact) 2 else 3,
      overflow = TextOverflow.Ellipsis
    )
  }
}

@Composable
fun MetricPill(
  label: String,
  value: String,
  modifier: Modifier = Modifier,
  accent: Color = ShieldBrandLight,
  compact: Boolean = false
) {
  Surface(
    modifier = modifier,
    shape = RoundedCornerShape(if (compact) 18.dp else 20.dp),
    color = ShieldSurface.copy(alpha = 0.9f),
    contentColor = MaterialTheme.colorScheme.onSurface,
    border = BorderStroke(1.dp, ShieldOutline.copy(alpha = 0.8f))
  ) {
    Column(
      modifier = Modifier.padding(
        horizontal = if (compact) 14.dp else 16.dp,
        vertical = if (compact) 10.dp else 12.dp
      ),
      verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
      Text(
        text = label,
        style = if (compact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
        color = ShieldTextMuted,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
      )
      Text(
        text = value,
        style = if (compact) MaterialTheme.typography.titleSmall else MaterialTheme.typography.titleMedium,
        color = accent,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis
      )
    }
  }
}

@Composable
fun StatusBadge(text: String, accent: Color, modifier: Modifier = Modifier) {
  Surface(
    modifier = modifier.height(36.dp),
    shape = RoundedCornerShape(999.dp),
    color = accent.copy(alpha = 0.16f),
    contentColor = accent,
    border = BorderStroke(1.dp, accent.copy(alpha = 0.46f))
  ) {
    Box(modifier = Modifier.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
      Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = accent,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
      )
    }
  }
}

private data class NavItem(
  val destination: AppDestination,
  val label: String,
  val icon: ImageVector
)

private val navItems = listOf(
  NavItem(AppDestination.DASHBOARD, "Центр", Icons.Rounded.Home),
  NavItem(AppDestination.SERVERS, "Узлы", Icons.Rounded.TravelExplore),
  NavItem(AppDestination.DNS, "DNS", Icons.Rounded.Dns),
  NavItem(AppDestination.SETTINGS, "Система", Icons.Rounded.Settings)
)
