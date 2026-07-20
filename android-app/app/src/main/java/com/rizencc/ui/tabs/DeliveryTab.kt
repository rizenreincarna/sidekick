package com.rizencc.ui.tabs

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.rizencc.ui.components.*
import com.rizencc.ui.theme.AccentAmber
import com.rizencc.ui.theme.AccentGreen
import com.rizencc.ui.theme.AccentRed
import com.rizencc.ui.viewmodel.RizenViewModel
import kotlinx.coroutines.delay
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

@Composable
fun DeliveryTab(contentPadding: PaddingValues) {
    val vm: RizenViewModel = viewModel()
    val orders by vm.orderStats.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) { while (true) { vm.refreshStats(); delay(5000) } }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(start = Spacing.md, end = Spacing.md,
                top = contentPadding.calculateTopPadding() + Spacing.sm,
                bottom = contentPadding.calculateBottomPadding() + Spacing.xl),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        Text("Deliveries", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)

        AnimatedContent(targetState = orders.stats != null,
            transitionSpec = { fadeIn(tween(200)) togetherWith fadeOut(tween(150)) }) { has ->
            when {
                orders.isLoading && !has -> LoadingCard()
                orders.error != null && !has -> ErrorCard(orders.error!!)
                has -> {
                    val o = orders.stats!!
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        // Marquee
                        o.todayZones?.takeIf { it.isNotEmpty() }?.let { today ->
                            val text = buildString {
                                append("Today: ${o.todayCount} orders")
                                today.forEach { z -> append("  —  ${z.name} (${z.count})") }
                            }
                            MarqueeTicker(text, Modifier.fillMaxWidth())
                        }
                        // Status tiles
                        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), modifier = Modifier.fillMaxWidth()) {
                            StatTile("Pending", o.pending, AccentAmber, Modifier.weight(1f))
                            StatTile("Booked", o.booked, MaterialTheme.colorScheme.tertiary, Modifier.weight(1f))
                            StatTile("Done", o.completed, AccentGreen, Modifier.weight(1f))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), modifier = Modifier.fillMaxWidth()) {
                            StatTile("Today", o.todayPoints, MaterialTheme.colorScheme.primary, Modifier.weight(1f))
                            StatTile("Week", o.weekPoints, MaterialTheme.colorScheme.secondary, Modifier.weight(1f))
                            StatTile("Agents", o.agents, MaterialTheme.colorScheme.tertiary, Modifier.weight(1f))
                        }
                        // Day cards — pass holidays for glow detection
                        o.upcoming?.takeIf { it.isNotEmpty() }?.let { days ->
                            Text("This Week", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(top = Spacing.xs))
                            val holidayDates = remember(o.holidays) {
                                (o.holidays ?: emptyList()).map { it.date }.toSet()
                            }
                            days.forEach { DayCard(it, holidayDates) }
                        }
                        o.updated?.let {
                            Text("Updated: $it", style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DayCard(day: com.rizencc.data.model.UpcomingOrder, holidays: Set<String>) {
    var expanded by remember { mutableStateOf(false) }
    val df = remember(day.date) { try { LocalDate.parse(day.date) } catch (_: Exception) { null } }
    val isToday = df != null && df == LocalDate.now()
    val isWeekend = df?.dayOfWeek?.let { it == java.time.DayOfWeek.SATURDAY || it == java.time.DayOfWeek.SUNDAY } ?: false
    val isHoliday = holidays.contains(day.date)
    val isOff = isWeekend || isHoliday
    val dayLabel = df?.format(DateTimeFormatter.ofPattern("EEE")) ?: day.date.takeLast(5)
    val dateLabel = df?.format(DateTimeFormatter.ofPattern("MMM d")) ?: day.date
    val cardColor = if (isOff) AccentRed.copy(alpha = 0.08f) else MaterialTheme.colorScheme.surface
    val borderColor = if (isOff) AccentRed.copy(alpha = 0.4f) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.1f)
    val offLabel = when { isHoliday -> " 🏖" ; isWeekend -> " 📴" ; else -> "" }

    Surface(
        modifier = Modifier.fillMaxWidth().clickable { expanded = !expanded },
        shape = RoundedCornerShape(Radii.lg),
        color = if (isOff) AccentRed.copy(alpha = 0.06f) else Color.Transparent,
        border = if (isOff) androidx.compose.foundation.BorderStroke(1.5.dp, AccentRed.copy(alpha = 0.35f)) else null
    ) {
        GlassCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(Spacing.md)) {
            // Holiday/weekend banner
            if (isOff) {
                Row(Modifier.fillMaxWidth().padding(bottom = Spacing.xs),
                    horizontalArrangement = Arrangement.Center) {
                    Text(if (isHoliday) "Public Holiday" else "Off Day",
                        style = MaterialTheme.typography.labelSmall,
                        color = AccentRed, fontWeight = FontWeight.Bold)
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(dayLabel, style = MaterialTheme.typography.titleMedium,
                        fontWeight = if (isToday) FontWeight.Bold else FontWeight.Medium,
                        color = if (isToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                    Spacer(Modifier.width(Spacing.sm))
                    Text(dateLabel, style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Row(verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
                    Text("${day.count} orders", style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = when { day.count >= 4 -> AccentRed; day.count >= 2 -> AccentAmber; else -> AccentGreen })
                    if (day.points > 0) Text("${day.points} pts", style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    Icon(if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            AnimatedVisibility(visible = expanded, enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()) {
                day.zones?.takeIf { it.isNotEmpty() }?.let { zones ->
                    Column(Modifier.padding(top = Spacing.sm)) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
                        Spacer(Modifier.height(Spacing.sm))
                        zones.forEach { z ->
                            Row(Modifier.fillMaxWidth().padding(vertical = Spacing.xs),
                                horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(z.name, style = MaterialTheme.typography.labelSmall,
                                    modifier = Modifier.weight(1f))
                                Text("${z.count}", style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold, color = AccentAmber)
                            }
                        }
                    }
                }
            }
        }
    }
    }
}

// ── Marquee ────────────────────────────────────────────────────

@Composable
private fun MarqueeTicker(text: String, modifier: Modifier) {
    var tw by remember { mutableIntStateOf(0) }
    var cw by remember { mutableIntStateOf(0) }
    val cs = MaterialTheme.colorScheme
    val offset by rememberInfiniteTransition().animateFloat(0f, -1f,
        infiniteRepeatable(tween((text.length * 120).coerceAtLeast(4000), easing = LinearEasing),
            RepeatMode.Restart), "m")
    GlassCard(modifier) {
        Row(Modifier.padding(horizontal = Spacing.sm, vertical = Spacing.sm).fillMaxWidth()
                .clipToBounds().onSizeChanged { cw = it.width },
            verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.LocationOn, null, tint = AccentGreen, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(Spacing.xs))
            Box(Modifier.weight(1f).clipToBounds()) {
                Text(text, style = MaterialTheme.typography.labelMedium, maxLines = 1, softWrap = false,
                    onTextLayout = { tw = it.size.width },
                    modifier = Modifier.offset { IntOffset(((offset * (tw + cw).coerceAtLeast(1)) + cw).roundToInt(), 0) })
            }
        }
    }
}

// ── Stat tile (standardized) ───────────────────────────────────

@Composable
private fun StatTile(label: String, value: Int, color: androidx.compose.ui.graphics.Color, modifier: Modifier) {
    GlassCard(modifier) {
        Column(Modifier.padding(Spacing.md).fillMaxWidth().height(72.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center) {
            Text(value.toString(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color)
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
    }
}

@Composable
private fun LoadingCard() {
    GlassCard(Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().padding(Spacing.xl), Alignment.Center) {
            CircularProgressIndicator(Modifier.size(32.dp), strokeWidth = 2.dp)
        }
    }
}

@Composable
private fun ErrorCard(msg: String) {
    GlassCard(Modifier.fillMaxWidth()) {
        Text("Error: $msg", Modifier.padding(Spacing.md), style = MaterialTheme.typography.labelSmall, color = AccentRed)
    }
}
