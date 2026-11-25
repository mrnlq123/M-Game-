package com.worldarena.game

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.firebase.auth.GoogleAuthProvider
import com.worldarena.game.data.FirebaseRepository
import com.worldarena.game.engine3d.FilamentArenaView
import com.worldarena.game.model.*
import com.worldarena.game.network.GameWebSocketClient
import com.worldarena.game.ui.screens.*
import com.worldarena.game.ui.theme.WorldArenaTheme
import com.worldarena.game.voice.WebRtcVoiceManager
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private lateinit var firebaseRepo: FirebaseRepository
    private lateinit var wsClient: GameWebSocketClient
    private lateinit var voiceManager: WebRtcVoiceManager
    private var activeArenaView: FilamentArenaView? = null

    private var onAuthSuccessCallback: (() -> Unit)? = null
    private var onAuthErrorCallback: ((String) -> Unit)? = null

    private val googleSignInLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            val idToken = account.idToken
            if (idToken.isNullOrBlank()) {
                onAuthErrorCallback?.invoke("Google Sign-In did not return an ID token. Verify SHA-1 & google-services.json in Firebase Console.")
                return@registerForActivityResult
            }
            val credential = GoogleAuthProvider.getCredential(idToken, null)
            val authInstance = firebaseRepo.auth
            if (authInstance == null) {
                onAuthErrorCallback?.invoke("Firebase is not configured yet (add google-services.json). Play Offline Practice Mode meanwhile.")
                return@registerForActivityResult
            }
            authInstance.signInWithCredential(credential)
                .addOnSuccessListener { onAuthSuccessCallback?.invoke() }
                .addOnFailureListener { e -> onAuthErrorCallback?.invoke(e.message ?: "Firebase authentication failed.") }
        } catch (e: ApiException) {
            onAuthErrorCallback?.invoke("Google Sign-In failed (code ${e.statusCode}).")
        }
    }

    private val micPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            voiceManager.initializeAndJoin("team", pushToTalk = false)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        firebaseRepo = FirebaseRepository(applicationContext)

        var screen by mutableStateOf("splash")
        var profile by mutableStateOf(PlayerProfile())
        var selectedMode by mutableStateOf(GameModeId.PRACTICE)
        var selectedMap by mutableStateOf(ArenaMapId.NEON_CITY)
        var wsConnected by mutableStateOf(false)
        var queueSize by mutableStateOf(0)
        var roomState by mutableStateOf<RoomUiState?>(null)
        var hudState by mutableStateOf(MatchHudSnapshot())
        var leaderboard by mutableStateOf<List<PlayerProfile>>(emptyList())
        var friendsList by mutableStateOf<List<FriendRecord>>(emptyList())
        var friendStatusMsg by mutableStateOf<String?>(null)
        var matchHistory by mutableStateOf<List<MatchHistoryRecord>>(emptyList())
        var settingsState by mutableStateOf(UserSettingsState())
        var authError by mutableStateOf<String?>(null)
        var voiceConnected by mutableStateOf(false)
        var micMuted by mutableStateOf(true)
        var speakerOn by mutableStateOf(true)

        val loadSignedInProfile = {
            firebaseRepo.loadOrInitializeProfile(
                onLoaded = { p, isNew ->
                    profile = p
                    wsClient.connect(p.uid, p.username, p.country)
                    screen = if (isNew) "profile_setup" else "lobby"
                },
                onError = { authError = it; screen = "auth" }
            )
        }
        onAuthSuccessCallback = loadSignedInProfile
        onAuthErrorCallback = { authError = it }

        voiceManager = WebRtcVoiceManager(this) { type, payload ->
            wsClient.send(type, payload)
        }

        wsClient = GameWebSocketClient(
            onEvent = { type, payload ->
                when (type) {
                    "queue:status" -> queueSize = payload.optInt("queueSize", 1)
                    "room:joined", "room:updated" -> {
                        val arr = payload.optJSONArray("members")
                        val members = mutableListOf<RoomPlayer>()
                        if (arr != null) {
                            for (i in 0 until arr.length()) {
                                val m = arr.getJSONObject(i)
                                members.add(
                                    RoomPlayer(
                                        id = m.optString("id"),
                                        username = m.optString("username"),
                                        team = m.optString("team"),
                                        ready = m.optBoolean("ready"),
                                        isHost = m.optBoolean("isHost"),
                                        isBot = m.optBoolean("isBot")
                                    )
                                )
                            }
                        }
                        roomState = RoomUiState(
                            roomId = payload.optString("roomId"),
                            roomCode = payload.optString("roomCode"),
                            mode = payload.optString("mode"),
                            mapId = payload.optString("mapId"),
                            isPrivate = payload.optBoolean("isPrivate"),
                            isHost = payload.optString("hostUid") == profile.uid,
                            members = members
                        )
                        screen = "room"
                    }
                    "match:started" -> screen = "playing"
                    "match:snapshot" -> {
                        hudState = hudState.copy(
                            timeRemaining = payload.optInt("timeRemaining"),
                            blueScore = payload.optInt("blueScore"),
                            redScore = payload.optInt("redScore"),
                            objectiveProgress = payload.optDouble("objectiveProgress", 0.0).toFloat(),
                            objectiveOwner = payload.optString("objectiveOwner", "neutral")
                        )
                    }
                    "match:ended" -> {
                        voiceManager.disconnectAll()
                        voiceConnected = false
                        hudState = hudState.copy(winnerTeam = payload.optString("winnerTeam"))
                        screen = "results"
                    }
                    "rtc:peerJoined" -> voiceManager.handlePeerJoined(payload.optString("peerId"))
                    "rtc:signal" -> voiceManager.handleSignal(payload.optString("fromId"), payload.getJSONObject("signal"))
                }
            },
            onConnectionChanged = { wsConnected = it }
        )

        setContent {
            WorldArenaTheme {
                when (screen) {
                    "splash" -> SplashScreen {
                        if (firebaseRepo.auth?.currentUser == null) {
                            screen = "auth"
                        } else {
                            loadSignedInProfile()
                        }
                    }

                    "auth" -> LoginScreen(
                        errorText = authError,
                        onGoogleSignIn = {
                            if (!firebaseRepo.isConfigured) {
                                authError = "Add google-services.json to android-project/app/ for Google Sign-In, or tap Play Offline Practice Mode."
                                return@LoginScreen
                            }
                            val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                                .requestIdToken(getString(R.string.default_web_client_id))
                                .requestEmail()
                                .build()
                            val client = GoogleSignIn.getClient(this, gso)
                            googleSignInLauncher.launch(client.signInIntent)
                        },
                        onPlayOfflinePractice = {
                            selectedMode = GameModeId.PRACTICE
                            screen = "playing"
                        }
                    )

                    "profile_setup" -> ProfileSetupScreen(profile) { updated ->
                        firebaseRepo.saveProfile(updated, {
                            profile = updated
                            screen = "lobby"
                        }, { authError = it })
                    }

                    "lobby" -> MainLobbyScreen(
                        profile = profile,
                        selectedMode = selectedMode,
                        selectedMap = selectedMap,
                        wsConnected = wsConnected,
                        onOpenModes = { screen = "modes" },
                        onOpenFriends = {
                            firebaseRepo.fetchFriends(profile.uid) { friendsList = it }
                            screen = "friends"
                        },
                        onOpenLeaderboard = {
                            firebaseRepo.fetchLeaderboard { leaderboard = it }
                            screen = "leaderboard"
                        },
                        onOpenHistory = {
                            firebaseRepo.fetchMatchHistory(profile.uid) { matchHistory = it }
                            screen = "history"
                        },
                        onOpenSettings = { screen = "settings" },
                        onOpenPrivacy = { screen = "privacy" },
                        onLaunchSelected = {
                            if (selectedMode.isOffline) {
                                screen = "playing"
                            } else {
                                wsClient.send("queue:join", JSONObject().apply {
                                    put("mode", selectedMode.wireId())
                                    put("region", "global-auto")
                                })
                                screen = "matchmaking"
                            }
                        }
                    )

                    "modes" -> ModeSelectionScreen(
                        selectedMode = selectedMode,
                        selectedMap = selectedMap,
                        onSelectMode = { selectedMode = it },
                        onSelectMap = { selectedMap = it },
                        onCreatePrivateRoom = {
                            wsClient.send("room:create", JSONObject().apply {
                                put("mode", if (selectedMode.isOffline) "duo_battle" else selectedMode.wireId())
                                put("mapId", selectedMap.wireId())
                                put("isPrivate", true)
                            })
                        },
                        onJoinRoomByCode = { code ->
                            wsClient.send("room:join", JSONObject().put("codeOrId", code))
                        },
                        onBack = { screen = "lobby" }
                    )

                    "matchmaking" -> MatchmakingScreen(selectedMode, queueSize) {
                        wsClient.send("queue:leave")
                        screen = "lobby"
                    }

                    "room" -> roomState?.let { room ->
                        RoomLobbyScreen(
                            room = room,
                            onToggleReady = { wsClient.send("room:toggleReady") },
                            onSwitchTeam = { wsClient.send("room:switchTeam") },
                            onAddBot = { wsClient.send("room:addBot") },
                            onStartMatch = { wsClient.send("room:startMatch") },
                            onLeave = {
                                wsClient.send("room:leave")
                                screen = "lobby"
                            }
                        )
                    }

                    "playing" -> GameplayScreen(
                        hud = hudState,
                        selectedMap = selectedMap,
                        isPractice = selectedMode.isOffline,
                        playerName = profile.username,
                        settings = settingsState,
                        voiceConnected = voiceConnected,
                        micMuted = micMuted,
                        speakerOn = speakerOn,
                        onPracticeHudUpdate = { snap ->
                            runOnUiThread {
                                hudState = snap
                                if (snap.winnerTeam != null && screen == "playing") {
                                    activeArenaView?.destroy()
                                    activeArenaView = null
                                    screen = "results"
                                }
                            }
                        },
                        onCreateArenaView = { activeArenaView = it },
                        onToggleVoice = {
                            if (!voiceConnected) {
                                if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                                    voiceManager.initializeAndJoin("team", settingsState.pushToTalk, speakerOn)
                                    voiceConnected = true
                                    micMuted = settingsState.pushToTalk
                                } else {
                                    micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                }
                            } else {
                                voiceManager.disconnectAll()
                                voiceConnected = false
                            }
                        },
                        onToggleMic = {
                            micMuted = !micMuted
                            voiceManager.setMicMuted(micMuted)
                        },
                        onToggleSpeaker = {
                            speakerOn = !speakerOn
                            voiceManager.setSpeakerOn(speakerOn)
                        },
                        onInputUpdate = { mx, mz, _, _, jump, sprint, fire ->
                            if (!selectedMode.isOffline) {
                                wsClient.send("match:input", JSONObject().apply {
                                    put("moveX", mx)
                                    put("moveZ", mz)
                                    put("yaw", activeArenaView?.yaw ?: 0f)
                                    put("pitch", activeArenaView?.pitch ?: 0f)
                                    put("jump", jump)
                                    put("sprint", sprint)
                                    put("fire", fire)
                                })
                            }
                        },
                        onExitMatch = {
                            voiceManager.disconnectAll()
                            wsClient.send("room:leave")
                            wsClient.clearReconnectToken()
                            screen = if (firebaseRepo.auth?.currentUser != null) "lobby" else "auth"
                        }
                    )

                    "results" -> MatchResultsScreen(hudState) {
                        screen = if (firebaseRepo.auth?.currentUser != null) "lobby" else "auth"
                    }

                    "leaderboard" -> LeaderboardScreen(leaderboard) { screen = "lobby" }
                    "friends" -> FriendsScreen(
                        friends = friendsList,
                        statusMessage = friendStatusMsg,
                        onAddFriendByCode = { code ->
                            firebaseRepo.addFriendByCode(profile.uid, code) { ok, msg ->
                                friendStatusMsg = msg
                                if (ok) firebaseRepo.fetchFriends(profile.uid) { friendsList = it }
                            }
                        },
                        onRemoveFriend = { docId ->
                            firebaseRepo.removeFriend(docId) {
                                firebaseRepo.fetchFriends(profile.uid) { friendsList = it }
                            }
                        },
                        onBack = { screen = "lobby" }
                    )
                    "history" -> MatchHistoryScreen(matchHistory) { screen = "lobby" }
                    "settings" -> SettingsScreen(settingsState, onUpdate = { settingsState = it }) { screen = "lobby" }
                    "privacy" -> PrivacySafetyScreen(
                        profile = profile,
                        onSavePrivacy = { voice, invites ->
                            val updated = profile.copy(privacyVoice = voice, privacyInvites = invites)
                            firebaseRepo.saveProfile(updated, { profile = updated }, {})
                        },
                        onSubmitReport = { target, reason, details ->
                            firebaseRepo.submitReport(profile.uid, target, target, reason, details)
                        },
                        onBack = { screen = "lobby" }
                    )
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        activeArenaView?.destroy()
        voiceManager.disconnectAll()
        wsClient.disconnect()
    }
}
