package com.rizencc.ui.tabs

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.rizencc.ui.components.*
import com.rizencc.ui.theme.AccentAmber
import com.rizencc.ui.theme.AccentGreen
import com.rizencc.ui.theme.AccentRed
import com.rizencc.ui.viewmodel.RizenViewModel
import kotlinx.coroutines.delay
import retrofit2.Response

@Composable
fun StatsTab(contentPadding: PaddingValues) {
    val vm: RizenViewModel = viewModel()
    val server by vm.serverStats.collectAsStateWithLifecycle()
    val balances by vm.balances.collectAsStateWithLifecycle()
    val s = server.stats

    LaunchedEffect(Unit) {
        while (true) { vm.refreshServer(); vm.refreshBalances(); delay(5000) }
    }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(start = Spacing.md, end = Spacing.md,
                top = contentPadding.calculateTopPadding() + Spacing.sm,
                bottom = contentPadding.calculateBottomPadding() + Spacing.xl),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm)
    ) {
        Text("Server", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)

        if (s == null) {
            if (server.isLoading) LoadingCard() else if (server.error != null) ErrorCard(server.error!!)
        } else {
            // ── Clickable CPU ──
            ExpandableMetricCard("CPU", "${s.cpu?.overall?.toInt() ?: 0}%", "${s.cpu?.count ?: 0} cores",
                (s.cpu?.overall ?: 0.0) / 100.0, Icons.Default.Bolt)
            // ── Clickable Memory ──
            ExpandableMetricCard("Memory", "${s.memory?.percent?.toInt() ?: 0}%",
                "${fmtGb(s.memory?.used)} / ${fmtGb(s.memory?.total)} GB",
                (s.memory?.percent ?: 0.0) / 100.0, Icons.Default.Memory)
            // ── Clickable Disk ──
            ExpandableMetricCard("Disk", "${s.disk?.percent?.toInt() ?: 0}%",
                "${fmtGb(s.disk?.free)} GB free", (s.disk?.percent ?: 0.0) / 100.0, Icons.Default.Storage)

            // ── Network ──
            s.network?.let { net ->
                GlassCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(Spacing.md)) {
                        Text("Network", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(Spacing.xs))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("↓ ${fmtBytes(net.recv)}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = AccentGreen)
                                Text("received", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("↑ ${fmtBytes(net.sent)}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                                Text("sent", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }

            // ── Load avg ──
            s.cpu?.load_avg?.let { la ->
                GlassCard(Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(Spacing.md).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                        listOf("1m" to la.getOrNull(0), "5m" to la.getOrNull(1), "15m" to la.getOrNull(2)).forEach { (label, v) ->
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(String.format("%.2f", v ?: 0.0), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                                    color = loadColor(v ?: 0.0, s.cpu?.count ?: 1))
                                Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }

            // ── System ──
            s.system?.let { sys ->
                GlassCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(Spacing.md)) {
                        Text("System", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                        Text(sys.hostname ?: "—", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(sys.uptime ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(sys.os ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        // ── API Balances ──
        if (balances.isNotEmpty()) {
            Text("API", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = Spacing.xs))
            balances.forEach { b ->
                GlassCard(Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(Spacing.md).fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically) {
                        Text(b.provider, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
                        when {
                            b.error != null -> Text("⚠ ${b.error}", style = MaterialTheme.typography.labelSmall, color = AccentRed)
                            b.active == true -> Text("✓ Active", style = MaterialTheme.typography.labelSmall, color = AccentGreen, fontWeight = FontWeight.Bold)
                            b.balance != null -> Text("${b.currency ?: "$"}${String.format("%.2f", b.balance)}",
                                style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = AccentGreen)
                            else -> Text("—", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(Spacing.xl))
    }
}

// ── Expandable metric card with sparkline ─────────────────────

@Composable
private fun ExpandableMetricCard(label: String, value: String, sub: String, pct: Double,
                                  icon: androidx.compose.ui.graphics.vector.ImageVector) {
    var expanded by remember { mutableStateOf(false) }
    val cp = pct.coerceIn(0.0, 1.0)
    val c = when { cp >= 0.85 -> AccentRed; cp >= 0.6 -> AccentAmber; else -> AccentGreen }

    GlassCard(Modifier.fillMaxWidth().clickable { expanded = !expanded }) {
        Column {
            Row(Modifier.padding(Spacing.md), verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, null, tint = c, modifier = Modifier.size(24.dp))
                Spacer(Modifier.width(Spacing.md))
                Column(Modifier.weight(1f)) {
                    Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = c)
                    if (sub.isNotBlank()) Text(sub, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                LinearProgressIndicator(progress = { cp.toFloat() }, color = c,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                    modifier = Modifier.fillMaxWidth(0.25f).height(6.dp).clip(RoundedCornerShape(50)))
                Spacer(Modifier.width(Spacing.xs))
                Icon(if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            AnimatedVisibility(visible = expanded, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                SparklineChart(
                    modifier = Modifier.fillMaxWidth().height(100.dp).padding(horizontal = Spacing.md, vertical = Spacing.sm),
                    dataKey = label.lowercase()
                )
            }
        }
    }
}

// ── Simple canvas sparkline (fetches history from ViewModel) ──

@Composable
private fun SparklineChart(modifier: Modifier, dataKey: String) {
    var points by remember { mutableStateOf<List<Float>>(emptyList()) }
    val auth = remember { "Basic " + android.util.Base64.encodeToString("tars:@liBABA1122".toByteArray(), android.util.Base64.NO_WRAP) }
    LaunchedEffect(dataKey) {
        try {
            val json = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                val conn = java.net.URL("https://work.rizen.space/api/stats/history").openConnection()
                conn.setRequestProperty("Authorization", auth)
                conn.getInputStream().bufferedReader().readText()
            }
            val arr = org.json.JSONArray(json)
            val vals = mutableListOf<Float>()
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val v = when (dataKey) {
                    "cpu" -> obj.optDouble("cpu", 0.0).toFloat()
                    "memory" -> obj.optDouble("mem", 0.0).toFloat()
                    "disk" -> obj.optDouble("disk", 0.0).toFloat()
                    else -> 0f
                }
                vals.add(v)
            }
            points = vals.takeLast(60)
        } catch (_: Exception) { }
    }

    if (points.isEmpty()) {
        Box(modifier, Alignment.Center) { CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp) }
        return
    }

    val color = MaterialTheme.colorScheme.primary
    val surface = MaterialTheme.colorScheme.surfaceVariant
    Canvas(modifier) {
        if (points.size < 2) return@Canvas
        val max = points.max().coerceAtLeast(1f)
        val min = points.min().coerceAtMost(0f)
        val range = (max - min).coerceAtLeast(1f)
        val stepX = size.width / (points.size - 1)
        val path = Path()
        points.forEachIndexed { i, v ->
            val x = i * stepX
            val y = size.height - ((v - min) / range) * size.height * 0.8f - size.height * 0.1f
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(path, color, style = Stroke(width = 2.5f))
        // Fill under the line
        val fillPath = Path().apply { addPath(path) }
        fillPath.lineTo((points.size - 1) * stepX, size.height)
        fillPath.lineTo(0f, size.height)
        fillPath.close()
        drawPath(fillPath, color.copy(alpha = 0.12f))
    }
}

// ── Helpers ────────────────────────────────────────────────────

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

private fun fmtGb(bytes: Long?): String {
    if (bytes == null) return "?"
    return String.format("%.1f", bytes / 1_073_741_824.0)
}

private fun fmtBytes(bytes: Long): String = when {
    bytes > 1_000_000_000 -> String.format("%.1f GB", bytes / 1_000_000_000.0)
    bytes > 1_000_000 -> String.format("%.1f MB", bytes / 1_000_000.0)
    else -> String.format("%.0f KB", bytes / 1000.0)
}

private fun loadColor(value: Double, cores: Int): Color {
    val r = (value / cores).coerceIn(0.0, 2.0)
    return when { r > 0.8 -> AccentRed; r > 0.5 -> AccentAmber; else -> AccentGreen }
}
