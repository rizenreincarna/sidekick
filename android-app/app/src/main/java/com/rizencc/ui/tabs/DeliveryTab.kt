package com.rizencc.ui.tabs

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.rizencc.data.model.UpcomingOrder
import com.rizencc.ui.components.NeonCard
import com.rizencc.ui.components.NeonChip
import com.rizencc.ui.components.NeonErrorCard
import com.rizencc.ui.components.NeonLoadingCard
import com.rizencc.ui.components.NeonSectionHeader
import com.rizencc.ui.components.NeonStatTile
import com.rizencc.ui.components.Spacing
import com.rizencc.ui.theme.NeonCyan
import com.rizencc.ui.theme.NeonErr
import com.rizencc.ui.theme.NeonOk
import com.rizencc.ui.theme.NeonWarn
import com.rizencc.ui.viewmodel.RizenViewModel
import kotlinx.coroutines.delay
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

@Composable
fun DeliveryTab(
    contentPadding: PaddingValues
) {
    val vm: RizenViewModel = viewModel()
    val orders by vm.orderStats.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        while (true) {
            vm.refreshStats()
            delay(5000)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(
                start = Spacing.md,
                end = Spacing.md,
                top = contentPadding.calculateTopPadding() + Spacing.sm,
                bottom = contentPadding.calculateBottomPadding() + Spacing.xl
            ),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        NeonSectionHeader(
            title = "Deliveries",
            subtitle = "Live order queue and weekly plan"
        )

        AnimatedContent(
            targetState = orders.stats != null,
            transitionSpec = {
                fadeIn(tween(200)) togetherWith fadeOut(tween(150))
            },
            label = "orders-content"
        ) { hasStats ->
            when {
                orders.isLoading && !hasStats -> {
                    NeonLoadingCard(Modifier.fillMaxWidth())
                }

                orders.error != null && !hasStats -> {
                    NeonErrorCard(
                        message = orders.error ?: "Error",
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                hasStats -> {
                    val o = orders.stats ?: return@AnimatedContent

                    Column(
                        verticalArrangement = Arrangement.spacedBy(Spacing.sm)
                    ) {
                        o.todayZones?.takeIf { it.isNotEmpty() }?.let { today ->
                            val text = buildString {
                                append("Today: ${o.todayCount} orders")

                                today.forEach { zone ->
                                    append("  —  ${zone.name} (${zone.count})")
                                }
                            }

                            MarqueeTicker(
                                text = text,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            NeonStatTile(
                                label = "Pending",
                                value = o.pending.toString(),
                                sub = "Orders",
                                color = NeonWarn,
                                modifier = Modifier.weight(1f)
                            )

                            NeonStatTile(
                                label = "Booked",
                                value = o.booked.toString(),
                                sub = "Orders",
                                color = NeonCyan,
                                modifier = Modifier.weight(1f)
                            )

                            NeonStatTile(
                                label = "Done",
                                value = o.completed.toString(),
                                sub = "Orders",
                                color = NeonOk,
                                modifier = Modifier.weight(1f)
                            )
                        }

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            NeonStatTile(
                                label = "Today",
                                value = o.todayPoints.toString(),
                                sub = "Points",
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.weight(1f)
                            )

                            NeonStatTile(
                                label = "Week",
                                value = o.weekPoints.toString(),
                                sub = "Points",
                                color = MaterialTheme.colorScheme.secondary,
                                modifier = Modifier.weight(1f)
                            )

                            NeonStatTile(
                                label = "Agents",
                                value = o.agents.toString(),
                                sub = "Active",
                                color = MaterialTheme.colorScheme.tertiary,
                                modifier = Modifier.weight(1f)
                            )
                        }

                        o.upcoming?.takeIf { it.isNotEmpty() }?.let { days ->
                            NeonSectionHeader(
                                title = "This Week",
                                subtitle = "Upcoming delivery days"
                            )

                            val holidayDates = remember(o.holidays) {
                                (o.holidays ?: emptyList())
                                    .map { it.date }
                                    .toSet()
                            }

                            days.forEach { day ->
                                DayCard(
                                    day = day,
                                    holidays = holidayDates
                                )
                            }
                        }

                        o.updated?.let {
                            Text(
                                text = "Updated: $it",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                    .copy(alpha = 0.6f)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DayCard(
    day: UpcomingOrder,
    holidays: Set<String>
) {
    var expanded by remember { mutableStateOf(false) }

    val df = remember(day.date) {
        try {
            LocalDate.parse(day.date)
        } catch (_: Exception) {
            null
        }
    }

    val isToday = df != null && df == LocalDate.now()

    val isWeekend = df?.dayOfWeek?.let {
        it == DayOfWeek.SATURDAY || it == DayOfWeek.SUNDAY
    } ?: false

    val isHoliday = holidays.contains(day.date)
    val isOff = isWeekend || isHoliday

    val dayLabel = df?.format(DateTimeFormatter.ofPattern("EEE")) ?: day.date.takeLast(5)
    val dateLabel = df?.format(DateTimeFormatter.ofPattern("MMM d")) ?: day.date

    NeonCard(
        modifier = Modifier.fillMaxWidth(),
        onClick = { expanded = !expanded }
    ) {
        if (isOff) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = Spacing.xs),
                horizontalArrangement = Arrangement.Center
            ) {
                NeonChip(
                    text = if (isHoliday) "Public Holiday" else "Off Day",
                    color = NeonErr
                )
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = dayLabel,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = if (isToday) FontWeight.Bold else FontWeight.Medium,
                    color = if (isToday) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    }
                )

                Spacer(Modifier.width(Spacing.sm))

                Text(
                    text = dateLabel,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.md)
            ) {
                Text(
                    text = "${day.count} orders",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = when {
                        day.count >= 4 -> NeonErr
                        day.count >= 2 -> NeonWarn
                        else -> NeonOk
                    }
                )

                if (day.points > 0) {
                    Text(
                        text = "${day.points} pts",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }

                Icon(
                    imageVector = if (expanded) {
                        Icons.Default.ExpandLess
                    } else {
                        Icons.Default.ExpandMore
                    },
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically() + fadeIn(),
            exit = shrinkVertically() + fadeOut()
        ) {
            day.zones?.takeIf { it.isNotEmpty() }?.let { zones ->
                Column(
                    modifier = Modifier.padding(top = Spacing.sm)
                ) {
                    HorizontalDivider(
                        color = MaterialTheme.colorScheme.outlineVariant
                            .copy(alpha = 0.3f)
                    )

                    Spacer(Modifier.height(Spacing.sm))

                    zones.forEach { zone ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = Spacing.xs),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = zone.name,
                                style = MaterialTheme.typography.labelSmall,
                                modifier = Modifier.weight(1f)
                            )

                            Text(
                                text = "${zone.count}",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = NeonWarn
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MarqueeTicker(
    text: String,
    modifier: Modifier
) {
    var textWidth by remember { mutableIntStateOf(0) }
    var containerWidth by remember { mutableIntStateOf(0) }

    val offset by rememberInfiniteTransition(label = "marquee").animateFloat(
        initialValue = 0f,
        targetValue = -1f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = (text.length * 120).coerceAtLeast(4000),
                easing = LinearEasing
            ),
            repeatMode = RepeatMode.Restart
        ),
        label = "marquee-offset"
    )

    NeonCard(
        modifier = modifier,
        padding = Spacing.sm
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clipToBounds()
                .onSizeChanged { containerWidth = it.width },
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.LocationOn,
                contentDescription = null,
                tint = NeonOk,
                modifier = Modifier.size(16.dp)
            )

            Spacer(Modifier.width(Spacing.xs))

            Box(
                modifier = Modifier
                    .weight(1f)
                    .clipToBounds()
            ) {
                Text(
                    text = text,
                    style = MaterialTheme.typography.labelMedium,
                    maxLines = 1,
                    softWrap = false,
                    onTextLayout = { textWidth = it.size.width },
                    modifier = Modifier.offset {
                        IntOffset(
                            x = ((offset * (textWidth + containerWidth).coerceAtLeast(1)) + containerWidth)
                                .roundToInt(),
                            y = 0
                        )
                    }
                )
            }
        }
    }
}