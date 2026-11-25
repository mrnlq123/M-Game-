package com.worldarena.game.model

enum class ArenaMapId(val title: String, val accentColorHex: Long) {
    NEON_CITY("Neon City Arena", 0xFF06B6D4),
    SKY_ISLAND("Floating Sky Island", 0xFF38BDF8),
    DESERT_ENERGY("Desert Energy Arena", 0xFFF59E0B),
    ICE_CRYSTAL("Ice Crystal Arena", 0xFF22D3EE);

    fun wireId(): String = when (this) {
        NEON_CITY -> "neon_city"
        SKY_ISLAND -> "sky_island"
        DESERT_ENERGY -> "desert_energy"
        ICE_CRYSTAL -> "ice_crystal"
    }
}

enum class GameModeId(val title: String, val teamSize: Int, val isOffline: Boolean) {
    SOLO_VS("Solo VS (1v1)", 1, false),
    DUO_BATTLE("Duo Battle (2v2)", 2, false),
    SQUAD_BATTLE("Squad Battle (4v4)", 4, false),
    TEAM_ARENA("Team Arena (6v6)", 6, false),
    PRACTICE("Practice Mode (AI)", 2, true);

    fun wireId(): String = when (this) {
        SOLO_VS -> "solo_vs"
        DUO_BATTLE -> "duo_battle"
        SQUAD_BATTLE -> "squad_battle"
        TEAM_ARENA -> "team_arena"
        PRACTICE -> "practice"
    }
}

enum class GraphicsQuality { LOW, MEDIUM, HIGH }
enum class VoiceChannel { TEAM, PARTY, ROOM }

data class PlayerProfile(
    val uid: String = "",
    val playerCode: String = "WA-000000",
    val username: String = "Runner",
    val country: String = "US",
    val avatarColor: String = "#06B6D4",
    val wins: Int = 0,
    val matchesPlayed: Int = 0,
    val tagsScored: Int = 0,
    val rating: Int = 1000,
    val privacyVoice: String = "everyone",
    val privacyInvites: String = "everyone"
)

data class FriendRecord(
    val docId: String,
    val friendUid: String,
    val friendUsername: String,
    val friendCode: String,
    val status: String
)

data class MatchHistoryRecord(
    val matchId: String,
    val mode: String,
    val mapId: String,
    val winnerTeam: String,
    val blueScore: Int,
    val redScore: Int,
    val playerTeam: String,
    val tags: Int
)

data class PlayerEntityState(
    val id: String,
    val username: String,
    val team: String,
    val isBot: Boolean,
    var x: Float,
    var y: Float,
    var z: Float,
    var yaw: Float,
    var energy: Int = 100,
    var sprinting: Boolean = false,
    var eliminated: Boolean = false,
    var respawnTimer: Float = 0f,
    var tags: Int = 0,
    var score: Int = 0
)

data class MatchHudSnapshot(
    val matchId: String = "",
    val timeRemaining: Int = 150,
    val blueScore: Int = 0,
    val redScore: Int = 0,
    val objectiveProgress: Float = 0f,
    val objectiveOwner: String = "neutral",
    val localEnergy: Int = 100,
    val localTags: Int = 0,
    val localScore: Int = 0,
    val eliminated: Boolean = false,
    val respawnTimer: Float = 0f,
    val winnerTeam: String? = null
)

data class RoomPlayer(
    val id: String,
    val username: String,
    val team: String,
    val ready: Boolean,
    val isHost: Boolean,
    val isBot: Boolean
)

data class RoomUiState(
    val roomId: String = "",
    val roomCode: String = "",
    val mode: String = "duo_battle",
    val mapId: String = "neon_city",
    val isPrivate: Boolean = false,
    val isHost: Boolean = false,
    val members: List<RoomPlayer> = emptyList()
)

data class UserSettingsState(
    val graphicsQuality: GraphicsQuality = GraphicsQuality.HIGH,
    val targetFps: Int = 60,
    val cameraSensitivity: Float = 1.0f,
    val joystickScale: Float = 1.0f,
    val invertY: Boolean = false,
    val pushToTalk: Boolean = false,
    val speakerOn: Boolean = true
)
