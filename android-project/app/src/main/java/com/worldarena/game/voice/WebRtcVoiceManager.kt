package com.worldarena.game.voice

import android.content.Context
import android.media.AudioManager
import org.json.JSONObject
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription

class WebRtcVoiceManager(
    private val context: Context,
    private val sendSignal: (type: String, payload: JSONObject) -> Unit
) {
    private var factory: PeerConnectionFactory? = null
    private var audioSource: AudioSource? = null
    private var localAudioTrack: AudioTrack? = null
    private val peers = mutableMapOf<String, PeerConnection>()

    var isConnected: Boolean = false
        private set
    var isMicMuted: Boolean = true
        private set
    var isSpeakerOn: Boolean = true
        private set

    fun initializeAndJoin(channel: String, pushToTalk: Boolean, speakerOn: Boolean = true) {
        if (factory == null) {
            PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(context)
                    .createInitializationOptions()
            )
            factory = PeerConnectionFactory.builder().createPeerConnectionFactory()
        }

        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        isSpeakerOn = speakerOn
        audioManager.isSpeakerphoneOn = speakerOn

        audioSource = factory?.createAudioSource(MediaConstraints())
        localAudioTrack = factory?.createAudioTrack("WORLD_ARENA_MIC", audioSource)
        isMicMuted = pushToTalk
        localAudioTrack?.setEnabled(!isMicMuted)
        isConnected = true

        sendSignal("rtc:join", JSONObject().put("channel", channel))
    }

    fun setMicMuted(muted: Boolean) {
        isMicMuted = muted
        localAudioTrack?.setEnabled(!muted)
        sendSignal("rtc:speaking", JSONObject().apply {
            put("speaking", !muted)
            put("muted", muted)
        })
    }

    fun setSpeakerOn(enabled: Boolean) {
        isSpeakerOn = enabled
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.isSpeakerphoneOn = enabled
    }

    fun handlePeerJoined(peerId: String) {
        if (!isConnected) return
        val pc = getOrCreatePeer(peerId) ?: return
        pc.createOffer(object : SimpleSdpObserver() {
            override fun onCreateSuccess(desc: SessionDescription) {
                pc.setLocalDescription(SimpleSdpObserver(), desc)
                val sig = JSONObject().apply {
                    put("sdp", JSONObject().apply {
                        put("type", desc.type.canonicalForm())
                        put("sdp", desc.description)
                    })
                }
                sendSignal("rtc:signal", JSONObject().apply {
                    put("targetId", peerId)
                    put("signal", sig)
                })
            }
        }, MediaConstraints())
    }

    fun handleSignal(fromId: String, signal: JSONObject) {
        if (!isConnected) return
        val pc = getOrCreatePeer(fromId) ?: return
        val sdpObj = signal.optJSONObject("sdp")
        if (sdpObj != null) {
            val type = SessionDescription.Type.fromCanonicalForm(sdpObj.optString("type"))
            val desc = SessionDescription(type, sdpObj.optString("sdp"))
            pc.setRemoteDescription(SimpleSdpObserver(), desc)
            if (type == SessionDescription.Type.OFFER) {
                pc.createAnswer(object : SimpleSdpObserver() {
                    override fun onCreateSuccess(ans: SessionDescription) {
                        pc.setLocalDescription(SimpleSdpObserver(), ans)
                        val sig = JSONObject().apply {
                            put("sdp", JSONObject().apply {
                                put("type", ans.type.canonicalForm())
                                put("sdp", ans.description)
                            })
                        }
                        sendSignal("rtc:signal", JSONObject().apply {
                            put("targetId", fromId)
                            put("signal", sig)
                        })
                    }
                }, MediaConstraints())
            }
        } else {
            val cand = signal.optJSONObject("candidate") ?: return
            pc.addIceCandidate(
                IceCandidate(
                    cand.optString("sdpMid"),
                    cand.optInt("sdpMLineIndex"),
                    cand.optString("candidate")
                )
            )
        }
    }

    private fun getOrCreatePeer(peerId: String): PeerConnection? {
        peers[peerId]?.let { return it }
        val iceServers = listOf(
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
        )
        val config = PeerConnection.RTCConfiguration(iceServers)
        val pc = factory?.createPeerConnection(config, object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) {
                val sig = JSONObject().apply {
                    put("candidate", JSONObject().apply {
                        put("sdpMid", candidate.sdpMid)
                        put("sdpMLineIndex", candidate.sdpMLineIndex)
                        put("candidate", candidate.sdp)
                    })
                }
                sendSignal("rtc:signal", JSONObject().apply {
                    put("targetId", peerId)
                    put("signal", sig)
                })
            }

            override fun onSignalingChange(p0: PeerConnection.SignalingState?) {}
            override fun onIceConnectionChange(p0: PeerConnection.IceConnectionState?) {}
            override fun onIceConnectionReceivingChange(p0: Boolean) {}
            override fun onIceGatheringChange(p0: PeerConnection.IceGatheringState?) {}
            override fun onIceCandidatesRemoved(p0: Array<out IceCandidate>?) {}
            override fun onAddStream(p0: MediaStream?) {}
            override fun onRemoveStream(p0: MediaStream?) {}
            override fun onDataChannel(p0: DataChannel?) {}
            override fun onRenegotiationNeeded() {}
            override fun onAddTrack(p0: RtpReceiver?, p1: Array<out MediaStream>?) {}
        }) ?: return null

        localAudioTrack?.let { track -> pc.addTrack(track, listOf("WORLD_ARENA_VOICE")) }
        peers[peerId] = pc
        return pc
    }

    fun disconnectAll() {
        isConnected = false
        isMicMuted = true
        peers.values.forEach { it.close() }
        peers.clear()
        localAudioTrack?.dispose()
        localAudioTrack = null
        audioSource?.dispose()
        audioSource = null
    }

    private open class SimpleSdpObserver : SdpObserver {
        override fun onCreateSuccess(desc: SessionDescription) {}
        override fun onSetSuccess() {}
        override fun onCreateFailure(err: String?) {}
        override fun onSetFailure(err: String?) {}
    }
}
