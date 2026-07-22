package com.rizencc.ui.tabs

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.rizencc.data.ApiClient
import com.rizencc.data.RizenApi
import com.rizencc.ui.components.NeonCard
import com.rizencc.ui.components.NeonChip
import com.rizencc.ui.components.NeonErrorCard
import com.rizencc.ui.components.NeonLoadingCard
import com.rizencc.ui.components.NeonProgress
import com.rizencc.ui.components.NeonSectionHeader
import com.rizencc.ui.components.Spacing
import com.rizencc.ui.components.neonLoadColor
import com.rizencc.ui.components.neonUsageColor
import com.rizencc.ui.theme.NeonCyan
import com.rizencc.ui.theme.NeonErr
import com.rizencc.ui.theme.NeonOk
import com.rizencc.ui.viewmodel.RizenViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

@Composable
fun StatsTab(
    contentPadding: PaddingValues
) {
    val vm: RizenViewModel = viewModel()

    val server by vm.serverStats.collectAsStateWithLifecycle()
    val balances by vm.balances.collectAsStateWithLifecycle()

    val s = server.stats

    LaunchedEffect(Unit) {
        while (true) {
            vm.refreshServer()
            vm.refreshBalances()
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
            title = "Server Telemetry",
            subtitle = "CPU, memory, disk, network and load"
        )

        if (s == null) {
            if (server.isLoading) {
                NeonLoadingCard(Modifier.fillMaxWidth())
            } else if (server.error != null) {
                NeonErrorCard(
                    message = server.error!!,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        } else {
            ExpandableMetricCard(
                label = "CPU",
                value = "${s.cpu?.overall?.toInt() ?: 0}%",
                sub = "${s.cpu?.count ?: 0} cores",
                pct = (s.cpu?.overall ?: 0.0) / 100.0,
                icon = Icons.Default.Bolt,
                dataKey = "cpu"
            )

            ExpandableMetricCard(
                label = "Memory",
                value = "${s.memory?.percent?.toInt() ?: 0}%",
                sub = "${fmtGb(s.memory?.used)} / ${fmtGb(s.memory?.total)} GB",
                pct = (s.memory?.percent ?: 0.0) / 100.0,
                icon = Icons.Default.Memory,
                dataKey = "memory"
            )

            ExpandableMetricCard(
                label = "Disk",
                value = "${s.disk?.percent?.toInt() ?: 0}%",
                sub = "${fmtGb(s.disk?.free)} GB free",
                pct = (s.disk?.percent ?: 0.0) / 100.0,
                icon = Icons.Default.Storage,
                dataKey = "disk"
            )

            s.network?.let { net ->
                NeonCard(
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column {
                        Text(
                            text = "NETWORK",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.Bold
                        )

                        Spacer(Modifier.height(Spacing.sm))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceEvenly
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    text = "↓ ${fmtBytes(net.recv)}",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = NeonOk
                                )

                                Text(
                                    text = "received",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    text = "↑ ${fmtBytes(net.sent)}",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = NeonCyan
                                )

                                Text(
                                    text = "sent",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }

            s.cpu?.load_avg?.let { la ->
                NeonCard(
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        listOf(
                            "1m" to la.getOrNull(0),
                            "5m" to la.getOrNull(1),
                            "15m" to la.getOrNull(2)
                        ).forEach { item ->
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    text = String.format(
                                        "%.2f",
                                        item.second ?: 0.0
                                    ),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = neonLoadColor(
                                        value = item.second ?: 0.0,
                                        cores = s.cpu?.count ?: 1
                                    )
                                )

                                Text(
                                    text = item.first,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }

            s.system?.let { sys ->
                NeonCard(
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column {
                        Text(
                            text = "SYSTEM",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.Bold
                        )

                        Spacer(Modifier.height(6.dp))

                        Text(
                            text = sys.hostname ?: "—",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )

                        Text(
                            text = sys.uptime.orEmpty(),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        Text(
                            text = sys.os.orEmpty(),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }

        NeonSectionHeader(
            title = "API Providers",
            subtitle = "Balances and errors"
        )

        if (balances.isEmpty()) {
            NeonCard(
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "No API balances returned.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            balances.forEach { b ->
                NeonCard(
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = b.provider,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold
                        )

                        when {
                            b.error != null -> {
                                NeonChip(
                                    text = "⚠ ${b.error}",
                                    color = NeonErr
                                )
                            }

                            b.active == true -> {
                                NeonChip(
                                    text = "Active",
                                    color = NeonOk
                                )
                            }

                            b.balance != null -> {
                                NeonChip(
                                    text = "${b.currency ?: "$"}${
                                        String.format(
                                            "%.2f",
                                            b.balance ?: 0.0
                                        )
                                    }",
                                    color = NeonOk
                                )
                            }

                            else -> {
                                NeonChip(
                                    text = "Unknown",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(Spacing.xl))
    }
}

@Composable
private fun ExpandableMetricCard(
    label: String,
    value: String,
    sub: String,
    pct: Double,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    dataKey: String
) {
    var expanded by remember { mutableStateOf(false) }

    val clamped = pct.coerceIn(0.0, 1.0)
    val color = neonUsageColor(clamped * 100.0)

    NeonCard(
        modifier = Modifier.fillMaxWidth(),
        onClick = { expanded = !expanded }
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(24.dp)
            )

            Spacer(Modifier.width(Spacing.md))

            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = label.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Bold
                )

                Text(
                    text = value,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Black,
                    color = color
                )

                if (sub.isNotBlank()) {
                    Text(
                        text = sub,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
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

        Spacer(Modifier.height(Spacing.sm))

        NeonProgress(
            percent = clamped.toFloat(),
            color = color
        )

        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically() + fadeIn(),
            exit = shrinkVertically() + fadeOut()
        ) {
            SparklineChart(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(100.dp)
                    .padding(top = Spacing.sm),
                dataKey = dataKey
            )
        }
    }
}

@Composable
private fun SparklineChart(
    modifier: Modifier,
    dataKey: String
) {
    var points by remember { mutableStateOf<List<Float>>(emptyList()) }
    var failed by remember { mutableStateOf(false) }

    LaunchedEffect(dataKey) {
        try {
            val api = ApiClient.retrofit.create(RizenApi::class.java)

            val response = withContext(Dispatchers.IO) {
                api.statsHistory()
            }

            if (response.isSuccessful) {
                val body = response.body().orEmpty()

                points = body.mapNotNull { item ->
                    when (dataKey) {
                        "cpu" -> item.cpu
                        "memory" -> item.mem
                        "disk" -> item.disk
                        else -> null
                    }?.toFloat()
                }.takeLast(60)

                failed = points.isEmpty()
            } else {
                failed = true
            }
        } catch (_: Exception) {
            failed = true
        }
    }

    when {
        failed -> {
            Box(
                modifier = modifier,
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "History unavailable",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        points.isEmpty() -> {
            Box(
                modifier = modifier,
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp
                )
            }
        }

        else -> {
            val color = MaterialTheme.colorScheme.primary

            Canvas(modifier = modifier) {
                if (points.size < 2) return@Canvas

                val max = points.max().coerceAtLeast(1f)
                val min = points.min().coerceAtMost(0f)
                val range = (max - min).coerceAtLeast(1f)

                val stepX = size.width / (points.size - 1)

                val path = Path()

                points.forEachIndexed { index, value ->
                    val x = index * stepX
                    val y = size.height -
                        ((value - min) / range) * size.height * 0.8f -
                        size.height * 0.1f

                    if (index == 0) {
                        path.moveTo(x, y)
                    } else {
                        path.lineTo(x, y)
                    }
                }

                drawPath(
                    path = path,
                    color = color,
                    style = Stroke(width = 2.5f)
                )

                val fillPath = Path().apply {
                    addPath(path)
                    lineTo((points.size - 1) * stepX, size.height)
                    lineTo(0f, size.height)
                    close()
                }

                drawPath(
                    path = fillPath,
                    color = color.copy(alpha = 0.12f)
                )
            }
        }
    }
}

private fun fmtGb(bytes: Long?): String {
    if (bytes == null) return "?"
    return String.format("%.1f", bytes / 1_073_741_824.0)
}

private fun fmtBytes(bytes: Long): String {
    return when {
        bytes > 1_000_000_000 -> String.format("%.1f GB", bytes / 1_000_000_000.0)
        bytes > 1_000_000 -> String.format("%.1f MB", bytes / 1_000_000.0)
        else -> String.format("%.0f KB", bytes / 1000.0)
    }
}