package com.rizencc

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.rizencc.ui.components.NeonBackground
import com.rizencc.ui.components.NeonBottomBar
import com.rizencc.ui.components.NeonTopBar
import com.rizencc.ui.tabs.CockpitTab
import com.rizencc.ui.tabs.DeliveryTab
import com.rizencc.ui.tabs.SettingsTab
import com.rizencc.ui.tabs.StatsTab
import com.rizencc.ui.tabs.VoiceTab
import com.rizencc.ui.theme.RizenTheme
import com.rizencc.ui.viewmodel.RizenViewModel
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

@Composable
private fun RootScreen() {
    val vm: RizenViewModel = viewModel()

    val tabs = listOf(
        "Cockpit" to Icons.Default.Home,
        "Voice" to Icons.Default.Mic,
        "Server" to Icons.Default.Dns,
        "Orders" to Icons.Default.Dashboard,
        "Settings" to Icons.Default.Settings
    )

    val pagerState = rememberPagerState(
        initialPage = 0,
        pageCount = { tabs.size }
    )

    val scope = rememberCoroutineScope()

    val navigate: (Int) -> Unit = { page ->
        scope.launch {
            pagerState.animateScrollToPage(page)
        }
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Box(
            modifier = Modifier.fillMaxSize()
        ) {
            NeonBackground()

            Scaffold(
                modifier = Modifier.systemBarsPadding(),
                containerColor = Color.Transparent,
                topBar = {
                    NeonTopBar(
                        title = tabs[pagerState.currentPage].first,
                        subtitle = "Syncing operational telemetry...",
                        onRefresh = {
                            vm.refreshServer()
                            vm.refreshStats()
                            vm.refreshBalances()
                            vm.refreshTts()
                        }
                    )
                },
                bottomBar = {
                    NeonBottomBar(
                        items = tabs,
                        selectedIndex = pagerState.currentPage,
                        onSelect = navigate
                    )
                }
            ) { padding ->
                HorizontalPager(
                    state = pagerState,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                ) { page ->
                    when (page) {
                        0 -> CockpitTab(
                            contentPadding = PaddingValues(0.dp),
                            onNavigate = navigate
                        )

                        1 -> VoiceTab(
                            contentPadding = PaddingValues(0.dp)
                        )

                        2 -> StatsTab(
                            contentPadding = PaddingValues(0.dp)
                        )

                        3 -> DeliveryTab(
                            contentPadding = PaddingValues(0.dp)
                        )

                        4 -> SettingsTab(
                            contentPadding = PaddingValues(0.dp)
                        )
                    }
                }
            }
        }
    }
}