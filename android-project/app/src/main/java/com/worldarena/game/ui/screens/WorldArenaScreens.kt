package com.worldarena.game.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.worldarena.game.engine3d.FilamentArenaView
import com.worldarena.game.model.*
import com.worldarena.game.ui.theme.*
import kotlin.math.hypot

@Composable
fun SplashScreen(onDone: () -> Unit) {
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(900)
        onDone()
    }
    Box(
        modifier = Modifier.fillMaxSize().background(ObsidianBg),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "WORLD ARENA",
                fontSize = 36.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                letterSpacing = 3.sp
            )
            Spacer(Modifier.height(8.dp))
            Text("Native 3D Multiplayer Battle Platform", color = ElectricBlue, fontSize = 14.sp)
        }
    }
}

@Composable
fun LoginScreen(
    errorText: String?,
    onGoogleSignIn: () -> Unit,
    onPlayOfflinePractice: () -> Unit
) {
    Box(
        modifier = Modifier.fillMaxSize().background(ObsidianBg).padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 420.dp)
                .background(NavySurface, RoundedCornerShape(16.dp))
                .border(1.dp, Color(0xFF1E293B), RoundedCornerShape(16.dp))
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text("WORLD ARENA", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Text(
                "Real-time 3D multiplayer arenas with WebSocket combat & WebRTC voice.",
                fontSize = 13.sp,
                color = Color(0xFF94A3B8)
            )
            if (errorText != null) {
                Text(errorText, color = CrimsonRed, fontSize = 12.sp)
            }
            Button(
                onClick = onGoogleSignIn,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue)
            ) {
                Text("Sign In with Google", fontWeight = FontWeight.SemiBold)
            }
            OutlinedButton(
                onClick = onPlayOfflinePractice,
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) {
                Text("Play Offline Practice Mode", color = Color.White)
            }
        }
    }
}

@Composable
fun ProfileSetupScreen(
    initial: PlayerProfile,
    onSave: (PlayerProfile) -> Unit
) {
    var username by remember { mutableStateOf(initial.username) }
    var country by remember { mutableStateOf(initial.country) }
    Box(
        modifier = Modifier.fillMaxSize().background(ObsidianBg).padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 420.dp)
                .background(NavySurface, RoundedCornerShape(16.dp))
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text("Runner Profile Setup", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Text("Player ID: ${initial.playerCode}", fontSize = 12.sp, color = ElectricBlue)
            OutlinedTextField(
                value = username,
                onValueChange = { username = it.take(24) },
                label = { Text("Arena Callsign") },
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = country,
                onValueChange = { country = it.uppercase().take(4) },
                label = { Text("Country Code (e.g. US, GB, JP)") },
                modifier = Modifier.fillMaxWidth()
            )
            Button(
                onClick = { onSave(initial.copy(username = username.ifBlank { "Runner" }, country = country.ifBlank { "US" })) },
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) {
                Text("Save & Enter Lobby")
            }
        }
    }
}

@Composable
fun MainLobbyScreen(
    profile: PlayerProfile,
    selectedMode: GameModeId,
    selectedMap: ArenaMapId,
    wsConnected: Boolean,
    onOpenModes: () -> Unit,
    onOpenFriends: () -> Unit,
    onOpenLeaderboard: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onLaunchSelected: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().background(ObsidianBg).padding(20.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(
                modifier = Modifier
                    .background(NavySurface, RoundedCornerShape(12.dp))
                    .padding(horizontal = 16.dp, vertical = 10.dp)
            ) {
                Text("${profile.username} (${profile.country})", fontWeight = FontWeight.Bold, color = Color.White)
                Text(
                    "${profile.playerCode} · Rating ${profile.rating} · Wins ${profile.wins} · ${if (wsConnected) "Server Online" else "Connecting..."}",
                    fontSize = 12.sp,
                    color = ElectricBlue
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onOpenFriends) { Text("Friends") }
                TextButton(onClick = onOpenLeaderboard) { Text("Leaderboard") }
                TextButton(onClick = onOpenHistory) { Text("History") }
                TextButton(onClick = onOpenPrivacy) { Text("Safety") }
                TextButton(onClick = onOpenSettings) { Text("Settings") }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(NavySurface, RoundedCornerShape(16.dp))
                .border(1.dp, Color(0xFF1E293B), RoundedCornerShape(16.dp))
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(selectedMode.title, fontWeight = FontWeight.Bold, color = Color.White, fontSize = 16.sp)
                Text(selectedMap.title, color = Color(0xFF94A3B8), fontSize = 12.sp)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = onOpenModes) { Text("Modes & Rooms") }
                Button(
                    onClick = onLaunchSelected,
                    colors = ButtonDefaults.buttonColors(containerColor = VoltPurple)
                ) {
                    Text(if (selectedMode.isOffline) "Start Practice" else "Enter Arena")
                }
            }
        }
    }
}

@Composable
fun ModeSelectionScreen(
    selectedMode: GameModeId,
    selectedMap: ArenaMapId,
    onSelectMode: (GameModeId) -> Unit,
    onSelectMap: (ArenaMapId) -> Unit,
    onCreatePrivateRoom: () -> Unit,
    onJoinRoomByCode: (String) -> Unit,
    onBack: () -> Unit
) {
    var codeInput by remember { mutableStateOf("") }
    Column(
        modifier = Modifier.fillMaxSize().background(ObsidianBg).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Game Modes & 3D Arenas", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
            TextButton(onClick = onBack) { Text("Back") }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            GameModeId.entries.forEach { m ->
                FilterChip(
                    selected = m == selectedMode,
                    onClick = { onSelectMode(m) },
                    label = { Text(m.title, fontSize = 11.sp) }
                )
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ArenaMapId.entries.forEach { map ->
                FilterChip(
                    selected = map == selectedMap,
                    onClick = { onSelectMap(map) },
                    label = { Text(map.title, fontSize = 11.sp) }
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Button(onClick = onCreatePrivateRoom) { Text("Create Private Room") }
            OutlinedTextField(
                value = codeInput,
                onValueChange = { codeInput = it.uppercase().take(12) },
                label = { Text("Room Code") },
                singleLine = true
            )
            Button(onClick = { if (codeInput.isNotBlank()) onJoinRoomByCode(codeInput) }) {
                Text("Join Room")
            }
        }
    }
}

@Composable
fun MatchmakingScreen(mode: GameModeId, queueSize: Int, onCancel: () -> Unit) {
    Box(Modifier.fillMaxSize().background(ObsidianBg), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            CircularProgressIndicator(color = ElectricBlue)
            Text("Searching Global Matchmaking · ${mode.title}", color = Color.White, fontWeight = FontWeight.Bold)
            Text("Real players in queue: $queueSize", color = Color(0xFF94A3B8), fontSize = 13.sp)
            OutlinedButton(onClick = onCancel) { Text("Cancel Queue") }
        }
    }
}

@Composable
fun RoomLobbyScreen(
    room: RoomUiState,
    onToggleReady: () -> Unit,
    onSwitchTeam: () -> Unit,
    onAddBot: () -> Unit,
    onStartMatch: () -> Unit,
    onLeave: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().background(ObsidianBg).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Room ${room.roomCode} (${room.mode})", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onSwitchTeam) { Text("Switch Team") }
                OutlinedButton(onClick = onToggleReady) { Text("Toggle Ready") }
                if (room.isHost && room.isPrivate) {
                    OutlinedButton(onClick = onAddBot) { Text("+ Training Bot") }
                }
                if (room.isHost) {
                    Button(onClick = onStartMatch) { Text("Launch Match") }
                }
                TextButton(onClick = onLeave) { Text("Leave", color = CrimsonRed) }
            }
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(room.members) { m ->
                Row(
                    modifier = Modifier.fillMaxWidth().background(NavySurface, RoundedCornerShape(10.dp)).padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("${m.username} (${m.team})", color = Color.White)
                    Text(if (m.ready) "Ready" else "Waiting", color = ElectricBlue)
                }
            }
        }
    }
}

@Composable
fun GameplayScreen(
    hud: MatchHudSnapshot,
    selectedMap: ArenaMapId,
    isPractice: Boolean,
    playerName: String,
    settings: UserSettingsState,
    voiceConnected: Boolean,
    micMuted: Boolean,
    speakerOn: Boolean,
    onPracticeHudUpdate: (MatchHudSnapshot) -> Unit,
    onCreateArenaView: (FilamentArenaView) -> Unit,
    onToggleVoice: () -> Unit,
    onToggleMic: () -> Unit,
    onToggleSpeaker: () -> Unit,
    onInputUpdate: (mx: Float, mz: Float, yawDelta: Float, pitchDelta: Float, jump: Boolean, sprint: Boolean, fire: Boolean) -> Unit,
    onExitMatch: () -> Unit
) {
    var paused by remember { mutableStateOf(false) }
    var arenaView by remember { mutableStateOf<FilamentArenaView?>(null) }
    var joyKnob by remember { mutableStateOf(Offset.Zero) }
    var sprintOn by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize()) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                FilamentArenaView(ctx, onPracticeHudUpdate).also { view ->
                    arenaView = view
                    if (isPractice) view.startPracticeMode(selectedMap, playerName)
                    view.resumeLoop()
                    onCreateArenaView(view)
                }
            }
        )

        // Right-side touch drag camera control
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .fillMaxWidth(0.5f)
                .align(Alignment.CenterEnd)
                .pointerInput(settings.cameraSensitivity, settings.invertY) {
                    detectDragGestures { change, dragAmount ->
                        change.consume()
                        val sens = 0.0045f * settings.cameraSensitivity
                        val ySign = if (settings.invertY) -1f else 1f
                        arenaView?.let { v ->
                            v.yaw -= dragAmount.x * sens
                            v.pitch = (v.pitch - dragAmount.y * sens * ySign).coerceIn(-0.55f, 0.42f)
                        }
                        onInputUpdate(0f, 0f, -dragAmount.x * sens, -dragAmount.y * sens * ySign, false, sprintOn, false)
                    }
                }
        )

        // Top Match Scoreboard & Energy/Objective Status
        Column(
            modifier = Modifier.align(Alignment.TopCenter).padding(top = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                modifier = Modifier
                    .background(Color(0xD90A101E), RoundedCornerShape(12.dp))
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("BLUE ${hud.blueScore}", color = ElectricBlue, fontWeight = FontWeight.Bold)
                Text("${hud.timeRemaining / 60}:${(hud.timeRemaining % 60).toString().padStart(2, '0')}", color = Color.White, fontWeight = FontWeight.Bold)
                Text("RED ${hud.redScore}", color = CrimsonRed, fontWeight = FontWeight.Bold)
            }
            Text(
                "Energy ${hud.localEnergy}% · Tags ${hud.localTags} · Beacon ${hud.objectiveProgress.toInt()}% (${hud.objectiveOwner})",
                color = Color(0xFFCBD5E1),
                fontSize = 11.sp
            )
        }

        // Top-right Voice Controls & Pause
        Row(
            modifier = Modifier.align(Alignment.TopEnd).padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (!isPractice) {
                Button(onClick = onToggleVoice) { Text(if (voiceConnected) "Voice On" else "Join Voice") }
                if (voiceConnected) {
                    OutlinedButton(onClick = onToggleMic) { Text(if (micMuted) "Unmute" else "Mute") }
                    OutlinedButton(onClick = onToggleSpeaker) { Text(if (speakerOn) "Speaker" else "Earpiece") }
                }
            }
            OutlinedButton(onClick = {
                paused = !paused
                arenaView?.isPaused = paused
            }) { Text("Pause") }
        }

        // Bottom-left Virtual Joystick
        Box(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(24.dp)
                .size((120 * settings.joystickScale).dp)
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragEnd = {
                            joyKnob = Offset.Zero
                            arenaView?.moveX = 0f
                            arenaView?.moveZ = 0f
                            onInputUpdate(0f, 0f, 0f, 0f, false, sprintOn, false)
                        }
                    ) { change, dragAmount ->
                        change.consume()
                        val next = joyKnob + dragAmount
                        val maxR = 46f
                        val dist = hypot(next.x, next.y).coerceAtLeast(1f)
                        joyKnob = if (dist > maxR) next * (maxR / dist) else next
                        val mx = joyKnob.x / maxR
                        val mz = -joyKnob.y / maxR
                        arenaView?.moveX = mx
                        arenaView?.moveZ = mz
                        onInputUpdate(mx, mz, 0f, 0f, false, sprintOn, false)
                    }
                }
        ) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                drawCircle(Color(0x880A101E))
                drawCircle(ElectricBlue, radius = 22.dp.toPx(), center = center + joyKnob)
            }
        }

        // Bottom-right Sprint, Objective Interact, Jump, Energy Tag
        Row(
            modifier = Modifier.align(Alignment.BottomEnd).padding(24.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.Bottom
        ) {
            Button(onClick = {
                sprintOn = !sprintOn
                arenaView?.sprinting = sprintOn
            }) { Text(if (sprintOn) "Sprint ON" else "Sprint") }
            OutlinedButton(onClick = { arenaView?.interactPressed = true }) { Text("Sync") }
            Button(onClick = {
                arenaView?.jumpPressed = true
                onInputUpdate(0f, 0f, 0f, 0f, true, sprintOn, false)
            }) { Text("Jump") }
            Button(
                onClick = {
                    arenaView?.firePressed = true
                    onInputUpdate(0f, 0f, 0f, 0f, false, sprintOn, true)
                },
                modifier = Modifier.size(72.dp),
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(containerColor = VoltPurple)
            ) { Text("TAG", fontWeight = FontWeight.Bold) }
        }

        if (hud.eliminated) {
            Box(
                modifier = Modifier.align(Alignment.Center).background(Color(0xBB0A101E), RoundedCornerShape(12.dp)).padding(16.dp)
            ) {
                Text("Tagged Out · Respawning in ${"%.1f".format(hud.respawnTimer)}s", color = CrimsonRed, fontWeight = FontWeight.Bold)
            }
        }

        if (paused) {
            Box(
                modifier = Modifier.fillMaxSize().background(Color(0xB3000000)),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    modifier = Modifier.background(NavySurface, RoundedCornerShape(16.dp)).padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("Match Paused", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    Button(onClick = {
                        paused = false
                        arenaView?.isPaused = false
                    }) { Text("Resume") }
                    OutlinedButton(onClick = {
                        arenaView?.destroy()
                        onExitMatch()
                    }) { Text("Leave Arena", color = CrimsonRed) }
                }
            }
        }
    }
}

@Composable
fun MatchResultsScreen(hud: MatchHudSnapshot, onReturnLobby: () -> Unit) {
    Box(Modifier.fillMaxSize().background(ObsidianBg), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.background(NavySurface, RoundedCornerShape(16.dp)).padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text("Match Complete · Winner: ${hud.winnerTeam ?: "Draw"}", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Text("Blue ${hud.blueScore} — Red ${hud.redScore}", fontSize = 18.sp, color = ElectricBlue)
            Text("Your Tags: ${hud.localTags} · Score: ${hud.localScore}", color = Color(0xFFCBD5E1))
            Button(onClick = onReturnLobby) { Text("Return to Lobby") }
        }
    }
}

@Composable
fun LeaderboardScreen(rows: List<PlayerProfile>, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize().background(ObsidianBg).padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Global Leaderboard", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
            TextButton(onClick = onBack) { Text("Back") }
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(rows) { r ->
                Row(
                    modifier = Modifier.fillMaxWidth().background(NavySurface, RoundedCornerShape(10.dp)).padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("${r.username} (${r.country})", color = Color.White)
                    Text("Rating ${r.rating} · Wins ${r.wins}", color = ElectricBlue)
                }
            }
        }
    }
}

@Composable
fun FriendsScreen(
    friends: List<FriendRecord>,
    statusMessage: String?,
    onAddFriendByCode: (String) -> Unit,
    onRemoveFriend: (String) -> Unit,
    onBack: () -> Unit
) {
    var code by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().background(ObsidianBg).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Friends & Party Invites", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
            TextButton(onClick = onBack) { Text("Back") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = code,
                onValueChange = { code = it.uppercase().take(12) },
                label = { Text("Friend Player ID (WA-XXXXXX)") },
                singleLine = true
            )
            Button(onClick = { onAddFriendByCode(code); code = "" }) { Text("Add Friend") }
        }
        if (statusMessage != null) {
            Text(statusMessage, color = ElectricBlue, fontSize = 12.sp)
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(friends) { f ->
                Row(
                    modifier = Modifier.fillMaxWidth().background(NavySurface, RoundedCornerShape(10.dp)).padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(f.friendUsername, color = Color.White, fontWeight = FontWeight.SemiBold)
                        Text("${f.friendCode} · ${f.status}", color = ElectricBlue, fontSize = 12.sp)
                    }
                    TextButton(onClick = { onRemoveFriend(f.docId) }) { Text("Remove", color = CrimsonRed) }
                }
            }
        }
    }
}

@Composable
fun MatchHistoryScreen(records: List<MatchHistoryRecord>, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize().background(ObsidianBg).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Match History", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
            TextButton(onClick = onBack) { Text("Back") }
        }
        if (records.isEmpty()) {
            Text("No completed online matches recorded yet.", color = Color(0xFF94A3B8))
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(records) { m ->
                    Row(
                        modifier = Modifier.fillMaxWidth().background(NavySurface, RoundedCornerShape(10.dp)).padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("${m.mode} · ${m.mapId}", color = Color.White)
                        Text("Blue ${m.blueScore} - Red ${m.redScore} (${m.winnerTeam})", color = ElectricBlue)
                    }
                }
            }
        }
    }
}

@Composable
fun SettingsScreen(
    settings: UserSettingsState,
    onUpdate: (UserSettingsState) -> Unit,
    onBack: () -> Unit
) {
    Column(Modifier.fillMaxSize().background(ObsidianBg).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Graphics, Controls & Voice Settings", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
            TextButton(onClick = onBack) { Text("Back") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            GraphicsQuality.entries.forEach { q ->
                FilterChip(
                    selected = settings.graphicsQuality == q,
                    onClick = { onUpdate(settings.copy(graphicsQuality = q)) },
                    label = { Text(q.name) }
                )
            }
        }
        Text("Camera Sensitivity: ${"%.1f".format(settings.cameraSensitivity)}x", color = Color.White)
        Slider(
            value = settings.cameraSensitivity,
            onValueChange = { onUpdate(settings.copy(cameraSensitivity = it)) },
            valueRange = 0.5f..2.0f
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = settings.pushToTalk, onCheckedChange = { onUpdate(settings.copy(pushToTalk = it)) })
                Text("Push-to-Talk", color = Color.White)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = settings.invertY, onCheckedChange = { onUpdate(settings.copy(invertY = it)) })
                Text("Invert Camera Y", color = Color.White)
            }
        }
    }
}

@Composable
fun PrivacySafetyScreen(
    profile: PlayerProfile,
    onSavePrivacy: (voice: String, invites: String) -> Unit,
    onSubmitReport: (targetName: String, reason: String, details: String) -> Unit,
    onBack: () -> Unit
) {
    var voicePolicy by remember { mutableStateOf(profile.privacyVoice) }
    var invitePolicy by remember { mutableStateOf(profile.privacyInvites) }
    var reportTarget by remember { mutableStateOf("") }
    var reportDetails by remember { mutableStateOf("") }
    var feedback by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().background(ObsidianBg).padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Privacy & Safety", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
            TextButton(onClick = onBack) { Text("Back") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Voice Chat:", color = Color.White)
            listOf("everyone", "friends", "off").forEach { opt ->
                FilterChip(selected = voicePolicy == opt, onClick = { voicePolicy = opt }, label = { Text(opt) })
            }
            Button(onClick = {
                onSavePrivacy(voicePolicy, invitePolicy)
                feedback = "Privacy settings saved."
            }) { Text("Save") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(value = reportTarget, onValueChange = { reportTarget = it }, label = { Text("Report Username") }, singleLine = true)
            OutlinedTextField(value = reportDetails, onValueChange = { reportDetails = it }, label = { Text("Reason / Details") }, singleLine = true)
            Button(onClick = {
                if (reportTarget.isNotBlank()) {
                    onSubmitReport(reportTarget, "unsporting_conduct", reportDetails)
                    reportTarget = ""
                    reportDetails = ""
                    feedback = "Safety report submitted for moderation review."
                }
            }) { Text("Report") }
        }
        if (feedback != null) Text(feedback!!, color = ElectricBlue, fontSize = 12.sp)
    }
}
