package com.worldarena.game.data

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.worldarena.game.model.FriendRecord
import com.worldarena.game.model.MatchHistoryRecord
import com.worldarena.game.model.PlayerProfile

class FirebaseRepository(context: Context) {
    val isConfigured: Boolean = FirebaseApp.getApps(context).isNotEmpty()
    val auth: FirebaseAuth? = if (isConfigured) FirebaseAuth.getInstance() else null
    private val db: FirebaseFirestore? = if (isConfigured) {
        FirebaseFirestore.getInstance("ai-studio-36007029-10bd-41bf-a4f0-28fcb051f9fd")
    } else null

    fun loadOrInitializeProfile(
        onLoaded: (profile: PlayerProfile, isNew: Boolean) -> Unit,
        onError: (String) -> Unit
    ) {
        val currentAuth = auth
        val firestore = db
        if (currentAuth == null || firestore == null) {
            onError("Firebase is not configured yet (add google-services.json). Offline Practice Mode is ready to play.")
            return
        }
        val user = currentAuth.currentUser ?: return
        val uid = user.uid
        val userRef = firestore.collection("users").document(uid)
        val profileRef = firestore.collection("profiles").document(uid)

        userRef.get().addOnSuccessListener { userSnap ->
            if (!userSnap.exists()) {
                userRef.set(
                    mapOf(
                        "uid" to uid,
                        "email" to (user.email ?: ""),
                        "role" to "player",
                        "accountStatus" to "active",
                        "createdAt" to FieldValue.serverTimestamp(),
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                )
            } else if (userSnap.getString("accountStatus") == "suspended") {
                onError("Account is temporarily suspended.")
                return@addOnSuccessListener
            }

            profileRef.get().addOnSuccessListener { snap ->
                if (snap.exists()) {
                    onLoaded(
                        PlayerProfile(
                            uid = uid,
                            playerCode = snap.getString("playerCode") ?: "WA-RUNNER",
                            username = snap.getString("username") ?: "Runner",
                            country = snap.getString("country") ?: "US",
                            avatarColor = snap.getString("avatarColor") ?: "#06B6D4",
                            wins = (snap.getLong("wins") ?: 0L).toInt(),
                            matchesPlayed = (snap.getLong("matchesPlayed") ?: 0L).toInt(),
                            tagsScored = (snap.getLong("tagsScored") ?: 0L).toInt(),
                            rating = (snap.getLong("rating") ?: 1000L).toInt(),
                            privacyVoice = snap.getString("privacyVoice") ?: "everyone",
                            privacyInvites = snap.getString("privacyInvites") ?: "everyone"
                        ),
                        false
                    )
                } else {
                    val code = "WA-${uid.take(6).uppercase()}"
                    onLoaded(
                        PlayerProfile(
                            uid = uid,
                            playerCode = code,
                            username = (user.displayName ?: "Runner").take(20)
                        ),
                        true
                    )
                }
            }.addOnFailureListener { onError(it.message ?: "Failed loading profile") }
        }.addOnFailureListener { onError(it.message ?: "Failed loading account") }
    }

    fun saveProfile(profile: PlayerProfile, onDone: () -> Unit, onError: (String) -> Unit) {
        val firestore = db ?: return onError("Firebase not configured.")
        val data = mapOf(
            "uid" to profile.uid,
            "playerCode" to profile.playerCode,
            "username" to profile.username.take(24),
            "avatarColor" to profile.avatarColor,
            "country" to profile.country.take(4),
            "onlineStatus" to "online",
            "wins" to profile.wins,
            "matchesPlayed" to profile.matchesPlayed,
            "tagsScored" to profile.tagsScored,
            "rating" to profile.rating,
            "privacyVoice" to profile.privacyVoice,
            "privacyInvites" to profile.privacyInvites,
            "updatedAt" to FieldValue.serverTimestamp()
        )
        firestore.collection("profiles").document(profile.uid).set(data)
            .addOnSuccessListener {
                firestore.collection("leaderboards").document(profile.uid).set(
                    mapOf(
                        "uid" to profile.uid,
                        "username" to profile.username.take(24),
                        "country" to profile.country.take(4),
                        "rating" to profile.rating,
                        "wins" to profile.wins,
                        "tagsScored" to profile.tagsScored,
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                )
                onDone()
            }
            .addOnFailureListener { onError(it.message ?: "Profile save failed") }
    }

    fun fetchLeaderboard(onResult: (List<PlayerProfile>) -> Unit) {
        val firestore = db ?: return onResult(emptyList())
        firestore.collection("leaderboards")
            .orderBy("rating", Query.Direction.DESCENDING)
            .limit(50)
            .get()
            .addOnSuccessListener { snap ->
                val list = snap.documents.map { d ->
                    PlayerProfile(
                        uid = d.getString("uid") ?: "",
                        username = d.getString("username") ?: "Runner",
                        country = d.getString("country") ?: "US",
                        rating = (d.getLong("rating") ?: 1000L).toInt(),
                        wins = (d.getLong("wins") ?: 0L).toInt(),
                        tagsScored = (d.getLong("tagsScored") ?: 0L).toInt()
                    )
                }
                onResult(list)
            }
    }

    fun fetchFriends(uid: String, onResult: (List<FriendRecord>) -> Unit) {
        val firestore = db ?: return onResult(emptyList())
        firestore.collection("friends")
            .whereEqualTo("ownerUid", uid)
            .limit(50)
            .get()
            .addOnSuccessListener { snap ->
                val list = snap.documents.map { d ->
                    FriendRecord(
                        docId = d.id,
                        friendUid = d.getString("friendUid") ?: "",
                        friendUsername = d.getString("friendUsername") ?: "Runner",
                        friendCode = d.getString("friendCode") ?: "WA-000000",
                        status = d.getString("status") ?: "accepted"
                    )
                }
                onResult(list)
            }
    }

    fun addFriendByCode(
        myUid: String,
        targetPlayerCode: String,
        onDone: (Boolean, String) -> Unit
    ) {
        val firestore = db ?: return onDone(false, "Firebase not configured.")
        val code = targetPlayerCode.trim().uppercase()
        if (code.isBlank()) {
            onDone(false, "Enter a valid Player ID (e.g. WA-XXXXXX).")
            return
        }
        firestore.collection("profiles")
            .whereEqualTo("playerCode", code)
            .limit(1)
            .get()
            .addOnSuccessListener { snap ->
                val doc = snap.documents.firstOrNull()
                if (doc == null) {
                    onDone(false, "No Runner found with ID $code.")
                    return@addOnSuccessListener
                }
                val friendUid = doc.getString("uid") ?: doc.id
                if (friendUid == myUid) {
                    onDone(false, "Cannot add yourself.")
                    return@addOnSuccessListener
                }
                val edgeId = "${myUid}_${friendUid}"
                firestore.collection("friends").document(edgeId).set(
                    mapOf(
                        "ownerUid" to myUid,
                        "friendUid" to friendUid,
                        "friendUsername" to (doc.getString("username") ?: "Runner"),
                        "friendCode" to code,
                        "status" to "accepted",
                        "createdAt" to FieldValue.serverTimestamp(),
                        "updatedAt" to FieldValue.serverTimestamp()
                    )
                ).addOnSuccessListener {
                    onDone(true, "Added ${doc.getString("username") ?: code} to friends.")
                }.addOnFailureListener { e ->
                    onDone(false, e.message ?: "Failed adding friend.")
                }
            }
            .addOnFailureListener { e ->
                onDone(false, e.message ?: "Lookup failed.")
            }
    }

    fun removeFriend(docId: String, onDone: () -> Unit) {
        val firestore = db ?: return onDone()
        firestore.collection("friends").document(docId).delete().addOnSuccessListener { onDone() }
    }

    fun fetchMatchHistory(uid: String, onResult: (List<MatchHistoryRecord>) -> Unit) {
        val firestore = db ?: return onResult(emptyList())
        firestore.collection("match_results")
            .whereArrayContains("participantUids", uid)
            .limit(30)
            .get()
            .addOnSuccessListener { snap ->
                val list = snap.documents.map { d ->
                    MatchHistoryRecord(
                        matchId = d.id,
                        mode = d.getString("mode") ?: "duo_battle",
                        mapId = d.getString("mapId") ?: "neon_city",
                        winnerTeam = d.getString("winnerTeam") ?: "blue",
                        blueScore = (d.getLong("blueScore") ?: 0L).toInt(),
                        redScore = (d.getLong("redScore") ?: 0L).toInt(),
                        playerTeam = "blue",
                        tags = 0
                    )
                }
                onResult(list)
            }
    }

    fun submitReport(
        reporterUid: String,
        reportedUid: String,
        reportedUsername: String,
        reason: String,
        details: String
    ) {
        val firestore = db ?: return
        val id = "rep_${System.currentTimeMillis()}_${reporterUid.take(6)}"
        firestore.collection("reports").document(id).set(
            mapOf(
                "reporterUid" to reporterUid,
                "reportedUid" to reportedUid,
                "reportedUsername" to reportedUsername.take(24),
                "reason" to reason,
                "details" to details.take(500),
                "status" to "open",
                "createdAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp()
            )
        )
    }
}
