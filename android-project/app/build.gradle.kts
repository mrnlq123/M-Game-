plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.worldarena.game"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.worldarena.game"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        val wsUrl = project.findProperty("WORLD_ARENA_WS_URL") as String?
            ?: "wss://ais-pre-dzevog2ebz5m3pqoiwnmtn-379985246309.asia-east1.run.app/ws"
        buildConfigField("String", "SERVER_WS_URL", "\"$wsUrl\"")
    }

    val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
        ?: (project.findProperty("ANDROID_KEYSTORE_PATH") as String?)
    if (!keystorePath.isNullOrBlank() && file(keystorePath).exists()) {
        signingConfigs {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASS")
                    ?: (project.findProperty("ANDROID_KEYSTORE_PASS") as String? ?: "")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                    ?: (project.findProperty("ANDROID_KEY_ALIAS") as String? ?: "")
                keyPassword = System.getenv("ANDROID_KEY_PASS")
                    ?: (project.findProperty("ANDROID_KEY_PASS") as String? ?: "")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
        debug {
            applicationIdSuffix = ".debug"
            isDebuggable = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.10.00"))
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.8.3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")

    // Google Filament 3D Rendering Engine
    implementation("com.google.android.filament:filament-android:1.81.0")
    implementation("com.google.android.filament:filament-utils-android:1.81.0")

    // Firebase Auth + Firestore
    implementation(platform("com.google.firebase:firebase-bom:33.5.1"))
    implementation("com.google.firebase:firebase-auth-ktx")
    implementation("com.google.firebase:firebase-firestore-ktx")
    implementation("com.google.android.gms:play-services-auth:21.2.0")

    // Authoritative WebSocket Networking
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Real-time WebRTC Voice Communication
    implementation("io.getstream:stream-webrtc-android:1.2.2")
}
