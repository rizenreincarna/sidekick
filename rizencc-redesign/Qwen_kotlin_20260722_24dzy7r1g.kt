package com.rizencc.ui.tabs

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.rizencc.ui.components.NeonCard
import com.rizencc.ui.components.NeonChip
import com.rizencc.ui.components.NeonHeroCard
import com.rizencc.ui.components.NeonQuickAction
import com.rizencc.ui.components.NeonSectionHeader
import com.rizencc.ui.components.NeonStatTile
import com.rizencc.ui.components.Spacing
import com.rizencc.ui.components.neonUsageColor
import com.rizencc.ui.theme.NeonCyan
import com.rizencc.ui.theme.NeonErr
import com.rizencc.ui.theme.NeonOk
import com.rizencc.ui.theme.NeonTeal
import com.rizencc.ui.theme.NeonViolet
import com.rizencc.ui.theme.NeonWarn
import com.rizencc.ui.viewmodel.RizenViewModel
import kotlinx.coroutines.delay
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
fun CockpitTab(
    contentPadding: PaddingValues,
    onNavigate: (Int) -> Unit
) {
    val vm: RizenViewModel = viewModel()

    val server by vm.serverStats.collectAsStateWithLifecycle()
    val orders by vm.orderStats.collectAsStateWithLifecycle()
    val balances by vm.balances.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        while (true) {
            vm.refreshServer()
            vm.refreshStats()
            vm.refreshBalances()
            delay(5000)
        }
    }

    val s = server.stats
    val o = orders.stats

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
        NeonHeroCard(
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = "ZONE: RIZEN CONTROL • TODAY",
                style = MaterialTheme.typography.labelSmall,
                color = NeonTeal,
                fontWeight = FontWeight.Black
            )

            Spacer(Modifier.height(8.dp))

            Text(
                text = "Rizen Control Cockpit",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Black
            )

            Spacer(Modifier.height(6.dp))

            Text(
                text = "work.rizen.space • RizenCC mobile control center",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Text(
                text = LocalDate.now().format(
                    DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy")
                ),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurface
            )

            Spacer(Modifier.height(12.dp))

            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
            ) {
                NeonChip(
                    text = if (s != null) "System Active" else "Connecting",
                    color = if (s != null) NeonOk else NeonWarn
                )

                NeonChip(
                    text = "Pending ${o?.pending ?: 0}",
                    color = NeonWarn
                )

                NeonChip(
                    text = "Done ${o?.completed ?: 0}",
                    color = NeonOk
                )

                NeonChip(
                    text = "API ${balances.size}",
                    color = NeonCyan
                )
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
        ) {
            NeonQuickAction(
                icon = Icons.Default.Mic,
                label = "Voice",
                onClick = { onNavigate(1) },
                modifier = Modifier.weight(1f)
            )

            NeonQuickAction(
                icon = Icons.Default.Dns,
                label = "Server",
                onClick = { onNavigate(2) },
                modifier = Modifier.weight(1f)
            )

            NeonQuickAction(
                icon = Icons.Default.Dashboard,
                label = "Orders",
                onClick = { onNavigate(3) },
                modifier = Modifier.weight(1f)
            )

            NeonQuickAction(
                icon = Icons.Default.Settings,
                label = "Settings",
                onClick = { onNavigate(4) },
                modifier = Modifier.weight(1f)
            )
        }

        NeonSectionHeader(
            title = "Resource Telemetry",
            subtitle = "Live host utilization and storage pressure"
        )

        if (s == null) {
            NeonCard(
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = if (server.isLoading) {
                        "Loading telemetry..."
                    } else {
                        server.error ?: "No data"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
            ) {
                NeonStatTile(
                    label = "CPU",
                    value = "${s.cpu?.overall?.toInt() ?: 0}%",
                    sub = "Load ${s.cpu?.load_avg?.firstOrNull() ?: 0.0}",
                    color = neonUsageColor(s.cpu?.overall ?: 0.0),
                    modifier = Modifier.weight(1f),
                    progress = ((s.cpu?.overall ?: 0.0) / 100.0).toFloat()
                )

                NeonStatTile(
                    label = "Memory",
                    value = "${s.memory?.percent?.toInt() ?: 0}%",
                    sub = "${fmtGb(s.memory?.used)} / ${fmtGb(s.memory?.total)} GB",
                    color = neonUsageColor(s.memory?.percent ?: 0.0),
                    modifier = Modifier.weight(1f),
                    progress = ((s.memory?.percent ?: 0.0) / 100.0).toFloat()
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
            ) {
                NeonStatTile(
                    label = "Disk",
                    value = "${s.disk?.percent?.toInt() ?: 0}%",
                    sub = "${fmtGb(s.disk?.free)} GB free",
                    color = neonUsageColor(s.disk?.percent ?: 0.0),
                    modifier = Modifier.weight(1f),
                    progress = ((s.disk?.percent ?: 0.0) / 100.0).toFloat()
                )

                s.network?.let { net ->
                    NeonStatTile(
                        label = "Network",
                        value = fmtBytes(net.recv),
                        sub = "↓ recv • ↑ ${fmtBytes(net.sent)}",
                        color = NeonCyan,
                        modifier = Modifier.weight(1f)
                    )
                } ?: run {
                    NeonStatTile(
                        label = "Network",
                        value = "—",
                        sub = "No data",
                        color = NeonCyan,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }

        NeonSectionHeader(
            title = "API Providers",
            subtitle = "Balances and quota"
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
                        horizontalArrangement = Arrangement.SpaceBetween
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
                                    color = NeonWarn
                                )
                            }
                        }
                    }
                }
            }
        }

        NeonSectionHeader(
            title = "Delivery Snapshot",
            subtitle = "Orders and points"
        )

        if (o == null) {
            NeonCard(
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = if (orders.isLoading) {
                        "Loading orders..."
                    } else {
                        orders.error ?: "No data"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
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
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
            ) {
                NeonStatTile(
                    label = "Today",
                    value = o.todayPoints.toString(),
                    sub = "Points",
                    color = NeonTeal,
                    modifier = Modifier.weight(1f)
                )

                NeonStatTile(
                    label = "Week",
                    value = o.weekPoints.toString(),
                    sub = "Points",
                    color = NeonViolet,
                    modifier = Modifier.weight(1f)
                )

                NeonStatTile(
                    label = "Agents",
                    value = o.agents.toString(),
                    sub = "Active",
                    color = NeonCyan,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        Spacer(Modifier.height(Spacing.xl))
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