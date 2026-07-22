package com.rizencc.data.model

import com.google.gson.annotations.SerializedName

// Tab 1: Chat
data class ChatRequest(val agent: String, val message: String)
data class ChatResponse(
    val reply: String = "",
    val agent: String = "",
    val audio: String? = null  // base64-encoded WAV
)

// Tab 2: TTS
data class TtsStatus(
    val provider: String? = null,
    @SerializedName("edge_voice") val edgeVoice: String? = null,
    @SerializedName("pc_voice") val pcVoice: String? = null,
)
data class TtsToggleRequest(val provider: String)

data class TtsToggleResponse(val ok: Boolean = false, val message: String = "", val provider: String = "")

// Tab 2: Order stats
data class ZoneCoverage(
    val name: String = "",
    val count: Int = 0,
    val points: Int = 0,
)

data class UpcomingHoliday(
    val date: String = "",
    val label: String = "",
)

data class UpcomingOrder(
    val date: String = "",
    val count: Int = 0,
    val zones: List<ZoneCoverage>? = null,
    val points: Int = 0,
)

data class BalanceInfo(
    val provider: String = "",
    val balance: Double? = null,
    val currency: String? = null,
    val active: Boolean? = null,
    val error: String? = null,
)

data class OrderStats(
    @SerializedName("pendingCount") val pending: Int = 0,
    @SerializedName("bookedCount") val booked: Int = 0,
    @SerializedName("completedCount") val completed: Int = 0,
    @SerializedName("todayPoints") val todayPoints: Int = 0,
    @SerializedName("weekPoints") val weekPoints: Int = 0,
    @SerializedName("totalOrders") val total: Int = 0,
    @SerializedName("activeAgents") val agents: Int = 0,
    @SerializedName("lastUpdated") val updated: String? = null,
    @SerializedName("zoneCoverage") val zones: List<ZoneCoverage>? = null,
    @SerializedName("upcomingOrders") val upcoming: List<UpcomingOrder>? = null,
    @SerializedName("todayZones") val todayZones: List<ZoneCoverage>? = null,
    @SerializedName("todayCount") val todayCount: Int = 0,
    @SerializedName("upcomingHolidays") val holidays: List<UpcomingHoliday>? = null,
)

// Tab 3: Server stats
data class NetworkStats(
    @SerializedName("bytes_sent") val sent: Long = 0,
    @SerializedName("bytes_recv") val recv: Long = 0,
    val errin: Int = 0,
    val errout: Int = 0,
)

data class ProcessInfo(
    val pid: Int = 0,
    val name: String = "",
    val cpu: Double = 0.0,
    @SerializedName("mem_mb") val memMb: Double = 0.0,
)
data class ServerStats(
    val cpu: CpuStats? = null,
    val memory: MemStats? = null,
    val disk: DiskStats? = null,
    val system: SysInfo? = null,
    val network: NetworkStats? = null,
    val processes: List<ProcessInfo>? = null,
)
data class CpuStats(val overall: Double = 0.0, val count: Int = 1, val load_avg: List<Double>? = null)
data class MemStats(val total: Long = 0, val used: Long = 0, val available: Long = 0, val percent: Double = 0.0, val swap_percent: Double = 0.0)
data class DiskStats(val total: Long = 0, val used: Long = 0, val free: Long = 0, val percent: Double = 0.0)
data class SysInfo(val hostname: String? = null, val os: String? = null, val uptime: String? = null, @SerializedName("uptime_seconds") val uptimeSeconds: Double? = null, @SerializedName("cpu_model") val cpuModel: String? = null)
