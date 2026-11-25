package com.worldarena.game.engine3d

import android.content.Context
import android.opengl.Matrix
import android.view.Choreographer
import android.view.Surface
import android.view.SurfaceView
import com.google.android.filament.Box
import com.google.android.filament.Camera
import com.google.android.filament.Engine
import com.google.android.filament.EntityManager
import com.google.android.filament.IndexBuffer
import com.google.android.filament.LightManager
import com.google.android.filament.RenderableManager
import com.google.android.filament.Renderer
import com.google.android.filament.Scene
import com.google.android.filament.Skybox
import com.google.android.filament.SwapChain
import com.google.android.filament.VertexBuffer
import com.google.android.filament.View
import com.google.android.filament.Viewport
import com.google.android.filament.android.UiHelper
import com.worldarena.game.model.ArenaMapId
import com.worldarena.game.model.MatchHudSnapshot
import com.worldarena.game.model.PlayerEntityState
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

class FilamentArenaView(
    context: Context,
    private val onPracticeHudUpdate: (MatchHudSnapshot) -> Unit
) : SurfaceView(context), Choreographer.FrameCallback {

    private val engine: Engine = Engine.create()
    private val renderer: Renderer = engine.createRenderer()
    private val scene: Scene = engine.createScene()
    private val view: View = engine.createView()
    private val camera: Camera = engine.createCamera(EntityManager.get().create())
    private val uiHelper = UiHelper(UiHelper.ContextErrorPolicy.DONT_CHECK)
    private var swapChain: SwapChain? = null

    private var sunLightEntity: Int = 0
    private var skybox: Skybox? = null
    private val entityMeshes = mutableMapOf<String, Int>()
    private val obstacleEntities = mutableListOf<Int>()
    private val obstacles = mutableListOf<ObstacleBox>()

    private lateinit var sharedCubeVb: VertexBuffer
    private lateinit var sharedCubeIb: IndexBuffer

    @Volatile var moveX: Float = 0f
    @Volatile var moveZ: Float = 0f
    @Volatile var yaw: Float = (Math.PI / 2).toFloat()
    @Volatile var pitch: Float = -0.18f
    @Volatile var sprinting: Boolean = false
    @Volatile var jumpPressed: Boolean = false
    @Volatile var firePressed: Boolean = false
    @Volatile var interactPressed: Boolean = false
    @Volatile var isPracticeMode: Boolean = false
    @Volatile var isPaused: Boolean = false

    private val players = mutableMapOf<String, PlayerEntityState>()
    private var lastFrameNanos = System.nanoTime()
    private var practiceTimeLeft = 150f
    private var blueScore = 0
    private var redScore = 0
    private var objectiveProgress = 0f
    private var objectiveOwner = "neutral"
    private var localFireCooldown = 0f
    private var aiDecisionTimer = 0f

    private data class ObstacleBox(val cx: Float, val cz: Float, val sx: Float, val sy: Float, val sz: Float)

    init {
        view.scene = scene
        view.camera = camera
        setupLighting()
        setupCubeBuffers()
        setupArenaGeometry(ArenaMapId.NEON_CITY)

        uiHelper.renderCallback = object : UiHelper.RendererCallback {
            override fun onNativeWindowChanged(surface: Surface) {
                swapChain?.let { engine.destroySwapChain(it) }
                swapChain = engine.createSwapChain(surface)
            }

            override fun onDetachedFromSurface() {
                swapChain?.let {
                    engine.destroySwapChain(it)
                    swapChain = null
                }
            }

            override fun onResized(width: Int, height: Int) {
                view.viewport = Viewport(0, 0, width, height)
                val aspect = width.toDouble() / height.coerceAtLeast(1).toDouble()
                camera.setProjection(65.0, aspect, 0.1, 300.0, Camera.Fov.VERTICAL)
            }
        }
        uiHelper.attachTo(this)
    }

    private fun setupLighting() {
        sunLightEntity = EntityManager.get().create()
        LightManager.Builder(LightManager.Type.DIRECTIONAL)
            .color(1.0f, 0.96f, 0.90f)
            .intensity(110_000.0f)
            .direction(-0.4f, -0.85f, -0.3f)
            .castShadows(true)
            .build(engine, sunLightEntity)
        scene.addEntity(sunLightEntity)
    }

    private fun setupCubeBuffers() {
        val vertices = floatArrayOf(
            -0.5f, 0f, -0.5f,  0.5f, 0f, -0.5f,  0.5f, 1f, -0.5f, -0.5f, 1f, -0.5f,
            -0.5f, 0f,  0.5f,  0.5f, 0f,  0.5f,  0.5f, 1f,  0.5f, -0.5f, 1f,  0.5f
        )
        val vbData = ByteBuffer.allocateDirect(vertices.size * 4).order(ByteOrder.nativeOrder())
        vbData.asFloatBuffer().put(vertices)
        vbData.rewind()

        sharedCubeVb = VertexBuffer.Builder()
            .vertexCount(8)
            .bufferCount(1)
            .attribute(VertexBuffer.VertexAttribute.POSITION, 0, VertexBuffer.AttributeType.FLOAT3, 0, 12)
            .build(engine)
        sharedCubeVb.setBufferAt(engine, 0, vbData)

        val indices = shortArrayOf(
            0, 1, 2, 0, 2, 3,
            4, 6, 5, 4, 7, 6,
            0, 4, 5, 0, 5, 1,
            2, 6, 7, 2, 7, 3,
            0, 3, 7, 0, 7, 4,
            1, 5, 6, 1, 6, 2
        )
        val ibData = ByteBuffer.allocateDirect(indices.size * 2).order(ByteOrder.nativeOrder())
        ibData.asShortBuffer().put(indices)
        ibData.rewind()

        sharedCubeIb = IndexBuffer.Builder()
            .indexCount(indices.size)
            .bufferType(IndexBuffer.Builder.IndexType.USHORT)
            .build(engine)
        sharedCubeIb.setBuffer(engine, ibData)
    }

    fun setupArenaGeometry(mapId: ArenaMapId) {
        obstacleEntities.forEach { scene.removeEntity(it) }
        obstacleEntities.clear()
        obstacles.clear()

        skybox?.let { engine.destroySkybox(it) }
        val skyColor = when (mapId) {
            ArenaMapId.NEON_CITY -> floatArrayOf(0.03f, 0.06f, 0.14f, 1f)
            ArenaMapId.SKY_ISLAND -> floatArrayOf(0.10f, 0.25f, 0.45f, 1f)
            ArenaMapId.DESERT_ENERGY -> floatArrayOf(0.24f, 0.15f, 0.08f, 1f)
            ArenaMapId.ICE_CRYSTAL -> floatArrayOf(0.07f, 0.18f, 0.28f, 1f)
        }
        skybox = Skybox.Builder().color(skyColor).build(engine)
        scene.skybox = skybox

        // Floor slab
        addStaticBox(0f, -0.5f, 0f, 68f, 0.5f, 68f)

        // Central objective pedestal + perimeter cover pillars
        val coverLayout = listOf(
            ObstacleBox(-12f, -10f, 3.5f, 3.2f, 3.5f),
            ObstacleBox(12f, 10f, 3.5f, 3.2f, 3.5f),
            ObstacleBox(-12f, 10f, 3.5f, 3.2f, 3.5f),
            ObstacleBox(12f, -10f, 3.5f, 3.2f, 3.5f),
            ObstacleBox(0f, -18f, 8f, 2.5f, 2.2f),
            ObstacleBox(0f, 18f, 8f, 2.5f, 2.2f),
            ObstacleBox(0f, 0f, 1.4f, 4.2f, 1.4f) // Central energy beacon
        )
        coverLayout.forEach { box ->
            obstacles.add(box)
            addStaticBox(box.cx, 0f, box.cz, box.sx, box.sy, box.sz)
        }
    }

    private fun addStaticBox(cx: Float, baseY: Float, cz: Float, sx: Float, sy: Float, sz: Float) {
        val e = EntityManager.get().create()
        RenderableManager.Builder(1)
            .boundingBox(Box(-0.5f, 0f, -0.5f, 0.5f, 1f, 0.5f))
            .geometry(0, RenderableManager.PrimitiveType.TRIANGLES, sharedCubeVb, sharedCubeIb)
            .receiveShadows(true)
            .castShadows(true)
            .build(engine, e)

        val tm = engine.transformManager
        val mat = FloatArray(16)
        Matrix.setIdentityM(mat, 0)
        Matrix.translateM(mat, 0, cx, baseY, cz)
        Matrix.scaleM(mat, 0, sx, sy, sz)
        tm.setTransform(tm.getInstance(e), mat)
        scene.addEntity(e)
        obstacleEntities.add(e)
    }

    fun startPracticeMode(mapId: ArenaMapId, playerName: String) {
        isPracticeMode = true
        isPaused = false
        practiceTimeLeft = 150f
        blueScore = 0
        redScore = 0
        objectiveProgress = 0f
        objectiveOwner = "neutral"
        localFireCooldown = 0f
        players.clear()

        players["local"] = PlayerEntityState("local", playerName, "blue", false, -24f, 0f, 0f, (Math.PI / 2).toFloat())
        players["ally_ai"] = PlayerEntityState("ally_ai", "Vanguard-AI", "blue", true, -20f, 0f, 8f, (Math.PI / 2).toFloat())
        players["enemy_1"] = PlayerEntityState("enemy_1", "Spectre-AI", "red", true, 24f, 0f, -6f, -(Math.PI / 2).toFloat())
        players["enemy_2"] = PlayerEntityState("enemy_2", "Pulse-AI", "red", true, 24f, 0f, 6f, -(Math.PI / 2).toFloat())

        setupArenaGeometry(mapId)
        ensureRunnerEntities()
    }

    fun applyRemoteSnapshot(remotePlayers: List<PlayerEntityState>) {
        isPracticeMode = false
        remotePlayers.forEach { players[it.id] = it }
        ensureRunnerEntities()
    }

    private fun ensureRunnerEntities() {
        val tm = engine.transformManager
        players.values.forEach { p ->
            val entity = entityMeshes.getOrPut(p.id) {
                val e = EntityManager.get().create()
                RenderableManager.Builder(1)
                    .boundingBox(Box(-0.6f, 0f, -0.6f, 0.6f, 1.9f, 0.6f))
                    .geometry(0, RenderableManager.PrimitiveType.TRIANGLES, sharedCubeVb, sharedCubeIb)
                    .castShadows(true)
                    .build(engine, e)
                scene.addEntity(e)
                e
            }
            val mat = FloatArray(16)
            Matrix.setIdentityM(mat, 0)
            val scaleY = if (p.eliminated) 0.15f else 1.85f
            Matrix.translateM(mat, 0, p.x, p.y, p.z)
            Matrix.rotateM(mat, 0, Math.toDegrees(p.yaw.toDouble()).toFloat(), 0f, 1f, 0f)
            Matrix.scaleM(mat, 0, 0.9f, scaleY, 0.9f)
            tm.setTransform(tm.getInstance(entity), mat)
        }
    }

    fun resumeLoop() {
        lastFrameNanos = System.nanoTime()
        Choreographer.getInstance().postFrameCallback(this)
    }

    fun pauseLoop() {
        Choreographer.getInstance().removeFrameCallback(this)
    }

    override fun doFrame(frameTimeNanos: Long) {
        val dt = ((frameTimeNanos - lastFrameNanos) / 1_000_000_000.0f).coerceIn(0.001f, 0.05f)
        lastFrameNanos = frameTimeNanos

        if (isPracticeMode && !isPaused) {
            stepPractice(dt)
        }
        updateThirdPersonCamera()

        if (uiHelper.isReadyToRender) {
            swapChain?.let { sc ->
                if (renderer.beginFrame(sc, frameTimeNanos)) {
                    renderer.render(view)
                    renderer.endFrame()
                }
            }
        }
        Choreographer.getInstance().postFrameCallback(this)
    }

    private fun clampOutOfObstacles(p: PlayerEntityState) {
        obstacles.forEach { box ->
            val halfX = box.sx * 0.5f + 0.55f
            val halfZ = box.sz * 0.5f + 0.55f
            val dx = p.x - box.cx
            val dz = p.z - box.cz
            if (kotlin.math.abs(dx) < halfX && kotlin.math.abs(dz) < halfZ) {
                val penX = halfX - kotlin.math.abs(dx)
                val penZ = halfZ - kotlin.math.abs(dz)
                if (penX < penZ) {
                    p.x += if (dx >= 0f) penX else -penX
                } else {
                    p.z += if (dz >= 0f) penZ else -penZ
                }
            }
        }
    }

    private fun stepPractice(dt: Float) {
        practiceTimeLeft = (practiceTimeLeft - dt).coerceAtLeast(0f)
        localFireCooldown = (localFireCooldown - dt).coerceAtLeast(0f)
        aiDecisionTimer += dt

        val local = players["local"] ?: return
        if (local.eliminated) {
            local.respawnTimer = (local.respawnTimer - dt).coerceAtLeast(0f)
            if (local.respawnTimer <= 0f) {
                local.eliminated = false
                local.energy = 100
                local.x = -24f
                local.z = 0f
            }
        } else {
            val speed = if (sprinting) 12.2f else 8.2f
            val sinY = sin(yaw)
            val cosY = cos(yaw)
            local.x = (local.x + (sinY * moveZ - cosY * moveX) * speed * dt).coerceIn(-33f, 33f)
            local.z = (local.z + (cosY * moveZ + sinY * moveX) * speed * dt).coerceIn(-33f, 33f)
            local.yaw = yaw
            clampOutOfObstacles(local)

            if (jumpPressed && local.y <= 0.01f) {
                local.y = 1.7f
                jumpPressed = false
            } else if (local.y > 0f) {
                local.y = (local.y - 4.8f * dt).coerceAtLeast(0f)
            }

            if (firePressed && localFireCooldown <= 0f) {
                firePressed = false
                localFireCooldown = 0.35f
                val fx = sin(yaw)
                val fz = cos(yaw)
                players.values
                    .filter { it.team != local.team && !it.eliminated }
                    .forEach { target ->
                        val dx = target.x - local.x
                        val dz = target.z - local.z
                        val dist = hypot(dx, dz)
                        if (dist in 0.2f..24f) {
                            val dot = (dx / dist) * fx + (dz / dist) * fz
                            if (dot > 0.86f) {
                                target.energy = (target.energy - 35).coerceAtLeast(0)
                                if (target.energy == 0) {
                                    target.eliminated = true
                                    target.respawnTimer = 3.5f
                                    local.tags += 1
                                    local.score += 100
                                    blueScore += 100
                                }
                            }
                        }
                    }
            }
        }

        // Step AI units toward central objective & duel opponent
        players.values.filter { it.isBot }.forEach { bot ->
            if (bot.eliminated) {
                bot.respawnTimer = (bot.respawnTimer - dt).coerceAtLeast(0f)
                if (bot.respawnTimer <= 0f) {
                    bot.eliminated = false
                    bot.energy = 100
                    bot.x = if (bot.team == "blue") -22f else 22f
                    bot.z = if (bot.id.endsWith("1")) -6f else 6f
                }
                return@forEach
            }
            val targetX = if (bot.team == "blue") -2.2f else 2.2f
            val targetZ = if (bot.id.endsWith("1")) -2.5f else 2.5f
            val dx = targetX - bot.x
            val dz = targetZ - bot.z
            val d = hypot(dx, dz).coerceAtLeast(0.01f)
            if (d > 2.2f) {
                bot.x = (bot.x + (dx / d) * 5.2f * dt).coerceIn(-33f, 33f)
                bot.z = (bot.z + (dz / d) * 5.2f * dt).coerceIn(-33f, 33f)
                bot.yaw = atan2(dx, dz)
                clampOutOfObstacles(bot)
            }
        }

        // Central objective zone (radius 5.5m around (0,0))
        if (!local.eliminated && hypot(local.x, local.z) < 5.5f && objectiveOwner != "blue") {
            val captureBoost = if (interactPressed) 42f else 24f
            interactPressed = false
            objectiveProgress = (objectiveProgress + captureBoost * dt).coerceAtMost(100f)
            if (objectiveProgress >= 100f) {
                objectiveOwner = "blue"
                blueScore += 150
                local.score += 150
            }
        } else if (aiDecisionTimer >= 1.5f) {
            aiDecisionTimer = 0f
            val redNear = players.values.count { it.team == "red" && !it.eliminated && hypot(it.x, it.z) < 6f }
            val blueNear = players.values.count { it.team == "blue" && !it.eliminated && hypot(it.x, it.z) < 6f }
            if (redNear > blueNear && objectiveOwner != "red") {
                objectiveProgress = (objectiveProgress + 18f).coerceAtMost(100f)
                if (objectiveProgress >= 100f) {
                    objectiveOwner = "red"
                    redScore += 120
                }
            }
        }

        ensureRunnerEntities()
        onPracticeHudUpdate(
            MatchHudSnapshot(
                matchId = "practice_android",
                timeRemaining = practiceTimeLeft.toInt(),
                blueScore = blueScore,
                redScore = redScore,
                objectiveProgress = objectiveProgress,
                objectiveOwner = objectiveOwner,
                localEnergy = local.energy,
                localTags = local.tags,
                localScore = local.score,
                eliminated = local.eliminated,
                respawnTimer = local.respawnTimer,
                winnerTeam = if (practiceTimeLeft <= 0f) {
                    if (blueScore >= redScore) "blue" else "red"
                } else null
            )
        )
    }

    private fun updateThirdPersonCamera() {
        val local = players["local"] ?: return
        val distBack = 6.2f
        val eyeX = local.x - sin(yaw) * distBack
        val eyeY = local.y + 2.7f - pitch * 2.2f
        val eyeZ = local.z - cos(yaw) * distBack
        camera.lookAt(
            eyeX.toDouble(), eyeY.toDouble(), eyeZ.toDouble(),
            local.x.toDouble(), (local.y + 1.4).toDouble(), local.z.toDouble(),
            0.0, 1.0, 0.0
        )
    }

    private var isDestroyed = false

    fun destroy() {
        if (isDestroyed) return
        isDestroyed = true
        pauseLoop()
        uiHelper.detach()
        skybox?.let {
            engine.destroySkybox(it)
            skybox = null
        }
        engine.destroyRenderer(renderer)
        engine.destroyView(view)
        engine.destroyScene(scene)
        engine.destroyCameraComponent(camera.entity)
        engine.destroyVertexBuffer(sharedCubeVb)
        engine.destroyIndexBuffer(sharedCubeIb)
        engine.destroy()
    }
}
