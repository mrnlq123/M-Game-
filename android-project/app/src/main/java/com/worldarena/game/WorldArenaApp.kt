package com.worldarena.game

import android.app.Application
import com.google.firebase.FirebaseApp

class WorldArenaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        runCatching {
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseApp.initializeApp(this)
            }
        }
    }
}
