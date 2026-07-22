package com.rizencc

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.rizencc.ui.components.GlassBackground
import com.rizencc.ui.components.GlassSurface
import com.rizencc.ui.components.Radii
import com.rizencc.ui.components.Spacing
import com.rizencc.ui.tabs.DeliveryTab
import com.rizencc.ui.tabs.SettingsTab
import com.rizencc.ui.tabs.StatsTab
import com.rizencc.ui.tabs.VoiceTab
import com.rizencc.ui.theme.RizenTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            RizenTheme {
                RootScreen()
            }
        }
    }
}

private enum class TabItem(val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Voice("Voice", Icons.Default.Mic),
    Server("Server", Icons.Default.Dns),
    Orders("Orders", Icons.Default.Dashboard),
    Settings("Settings", Icons.Default.Settings),
}

@Composable
private fun RootScreen() {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        GlassBackground()
        val tabs = TabItem.entries
        val pagerState = rememberPagerState(initialPage = 0, pageCount = { tabs.size })
        val coroutineScope = rememberCoroutineScope()

        Scaffold(
            modifier = Modifier.systemBarsPadding(),
            containerColor = Color.Transparent,
            bottomBar = {
                GlassSurface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.md, vertical = Spacing.sm),
                    cornerRadius = Radii.xl,
                    blurEnabled = true
                ) {
                    NavigationBar(containerColor = Color.Transparent, tonalElevation = 0.dp) {
                        tabs.forEachIndexed { i, t ->
                            NavigationBarItem(
                                selected = pagerState.currentPage == i,
                                onClick = {
                                    coroutineScope.launch {
                                        pagerState.animateScrollToPage(i)
                                    }
                                },
                                icon = {
                                    Icon(
                                        t.icon, contentDescription = t.label,
                                        modifier = Modifier.size(if (pagerState.currentPage == i) 26.dp else 20.dp)
                                    )
                                },
                                label = { Text(t.label, style = MaterialTheme.typography.labelSmall) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = MaterialTheme.colorScheme.primary,
                                    selectedTextColor = MaterialTheme.colorScheme.primary,
                                    indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                                )
                            )
                        }
                    }
                }
            }
        ) { padding ->
            HorizontalPager(
                state = pagerState,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) { page ->
                when (page) {
                    0 -> VoiceTab(contentPadding = PaddingValues(0.dp))
                    1 -> StatsTab(contentPadding = PaddingValues(0.dp))
                    2 -> DeliveryTab(contentPadding = PaddingValues(0.dp))
                    3 -> SettingsTab(contentPadding = PaddingValues(0.dp))
                }
            }
        }
    }
}
