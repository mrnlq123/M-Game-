package com.worldarena.game.network

import android.os.Handler
import android.os.Looper
import com.worldarena.game.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class GameWebSocketClient(
    private val onEvent: (type: String, payload: JSONObject) -> Unit,
    private val onConnectionChanged: (connected: Boolean) -> Unit
) {
    private val client = OkHttpClient.Builder()
        .pingInterval(15, TimeUnit.SECONDS)
        .build()

    private val mainHandler = Handler(Looper.getMainLooper())
    private var webSocket: WebSocket? = null
    private var shouldReconnect = false
    private var reconnectToken: String? = null

    fun connect(uid: String, username: String, country: String) {
        shouldReconnect = true
        val request = Request.Builder().url(BuildConfig.SERVER_WS_URL).build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                mainHandler.post { onConnectionChanged(true) }
                send("auth:identify", JSONObject().apply {
                    put("uid", uid)
                    put("username", username)
                    put("country", country)
                })
                reconnectToken?.let { token ->
                    send("match:reconnect", JSONObject().put("reconnectToken", token))
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val json = JSONObject(text)
                    val type = json.optString("type")
                    val payload = json.optJSONObject("payload") ?: JSONObject()
                    if (type == "match:started") {
                        reconnectToken = payload.optString("reconnectToken", null)
                    }
                    mainHandler.post { onEvent(type, payload) }
                } catch (_: Exception) {
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                mainHandler.post { onConnectionChanged(false) }
                scheduleReconnect(uid, username, country)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                mainHandler.post { onConnectionChanged(false) }
                scheduleReconnect(uid, username, country)
            }
        })
    }

    private fun scheduleReconnect(uid: String, username: String, country: String) {
        if (!shouldReconnect) return
        mainHandler.postDelayed({
            if (shouldReconnect) connect(uid, username, country)
        }, 2500L)
    }

    fun send(type: String, payload: JSONObject = JSONObject()) {
        val envelope = JSONObject().apply {
            put("type", type)
            put("payload", payload)
        }
        webSocket?.send(envelope.toString())
    }

    fun clearReconnectToken() {
        reconnectToken = null
    }

    fun disconnect() {
        shouldReconnect = false
        webSocket?.close(1000, "Client closed")
        webSocket = null
    }
}
