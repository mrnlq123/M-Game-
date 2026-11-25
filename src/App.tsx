import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Gamepad2,
  History,
  LogOut,
  Play,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Trophy,
  Users,
} from 'lucide-react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { AdminDashboardModal } from './components/AdminDashboardModal';
import { GameplayHud } from './components/GameplayHud';
import {
  FriendsModal,
  GameModeModal,
  HistoryModal,
  LeaderboardModal,
  MatchmakingModal,
  MatchResultsModal,
  PrivacySafetyModal,
  RoomLobbyModal,
  SettingsModal,
} from './components/LobbyModals';
import {
  ADMIN_EMAIL,
  auth,
  googleProvider,
  testFirestoreConnection,
} from './firebase';
import { ArenaEngine } from './game/ArenaEngine';
import { soundSynth } from './game/audio';
import {
  ARENA_MAPS,
  DEFAULT_SETTINGS,
  GAME_MODES,
  type ChatMessage,
  type GameModeId,
  type MapId,
  type MatchSnapshot,
  type PlayerProfileData,
  type RegionId,
  type RoomState,
  type UserSettings,
  type VoiceChannelMode,
} from './game/types';
import {
  ensureUserAccountAndProfile,
  fetchArenaConfig,
  fetchLeaderboard,
  fetchMatchHistory,
  findPlayerByCodeOrUsername,
  recordMatchResultAndStats,
  removeFriendship,
  savePlayerProfile,
  sendFriendOrBlockAction,
  setOnlineStatus,
  submitPlayerReport,
  subscribeToAnnouncements,
  subscribeToFriends,
  syncRoomMetadata,
  updateFriendshipStatus,
  type AnnouncementRecord,
  type FriendRecord,
  type LeaderboardRow,
  type MatchHistoryRow,
  type ReportRecord,
} from './services/firestoreService';
import { WebRtcVoiceService } from './services/webrtcVoice';

type ActiveScreen =
  | 'splash'
  | 'auth'
  | 'profile_setup'
  | 'lobby'
  | 'playing'
  | 'results';

type ActiveModal =
  | null
  | 'modes'
  | 'matchmaking'
  | 'room'
  | 'friends'
  | 'leaderboard'
  | 'history'
  | 'settings'
  | 'privacy'
  | 'admin';

const SUIT_COLORS = ['#06B6D4', '#3B82F6', '#7C3AED', '#F59E0B', '#10B981', '#F43F5E'];

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ArenaEngine | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const voiceRef = useRef<WebRtcVoiceService | null>(null);
  const reconnectTokenRef = useRef<string | null>(null);

  const [screen, setScreen] = useState<ActiveScreen>('splash');
  const [modal, setModal] = useState<ActiveModal>(null);
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PlayerProfileData | null>(null);
  const [suspendedNotice, setSuspendedNotice] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [webglLost, setWebglLost] = useState(false);

  // Profile setup draft
  const [draftName, setDraftName] = useState('');
  const [draftCountry, setDraftCountry] = useState('US');
  const [draftColor, setDraftColor] = useState('#06B6D4');

  // Game & Matchmaking selections
  const [selectedMode, setSelectedMode] = useState<GameModeId>('practice');
  const [selectedMap, setSelectedMap] = useState<MapId>('neon_city');
  const [selectedRegion, setSelectedRegion] = useState<RegionId>('global-auto');
  const [enabledMaps, setEnabledMaps] = useState<MapId[]>(['neon_city', 'sky_island', 'desert_energy', 'ice_crystal']);
  const [enabledModes, setEnabledModes] = useState<GameModeId[]>(['solo_vs', 'duo_battle', 'squad_battle', 'team_arena', 'practice']);

  // Live Multiplayer / WS State
  const [wsClientId, setWsClientId] = useState('local_player');
  const [pingMs, setPingMs] = useState(0);
  const [queueSize, setQueueSize] = useState(0);
  const [queueElapsed, setQueueElapsed] = useState(0);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [matchSnapshot, setMatchSnapshot] = useState<MatchSnapshot | null>(null);
  const [paused, setPaused] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Settings & Social Data
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState<MatchHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [reportTarget, setReportTarget] = useState<{ uid: string; username: string } | null>(null);

  // Voice reactive UI mirror
  const [, setVoiceTick] = useState(0);

  const sendWs = useCallback((type: string, payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }, []);

  // Initialize WebRTC Voice Manager once
  useEffect(() => {
    const svc = new WebRtcVoiceService(sendWs, () => setVoiceTick((t) => t + 1));
    voiceRef.current = svc;
    return () => {
      svc.disconnectAll();
    };
  }, [sendWs]);

  // Handle match end (both Practice and Authoritative Online)
  const handleMatchCompleted = useCallback(
    async (finalSnap: MatchSnapshot) => {
      setMatchSnapshot(finalSnap);
      setScreen('results');
      setPaused(false);
      voiceRef.current?.disconnectAll();
      reconnectTokenRef.current = null;

      if (profile && firebaseUser) {
        const myId = finalSnap.mode === 'practice' ? 'local_player' : wsClientId;
        const me = finalSnap.players.find((p) => p.id === myId);
        if (me) {
          const updated = await recordMatchResultAndStats(profile, {
            matchId: finalSnap.matchId,
            mode: finalSnap.mode,
            mapId: finalSnap.mapId,
            team: me.team,
            winnerTeam: finalSnap.winnerTeam || 'draw',
            tags: me.tags,
            taggedCount: me.taggedCount,
            captures: me.captures,
            score: me.score,
            won: finalSnap.winnerTeam === me.team,
          });
          setProfile(updated);
        }
      }
    },
    [firebaseUser, profile, wsClientId],
  );

  const matchCompletedRef = useRef(handleMatchCompleted);
  matchCompletedRef.current = handleMatchCompleted;

  // Mount Three.js ArenaEngine once inside dedicated empty ref container
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const engine = new ArenaEngine(container, {
      onSnapshot: (snap) => setMatchSnapshot(snap),
      onPracticeEnded: (snap) => matchCompletedRef.current(snap),
      onInputSend: (input) => sendWs('match:input', input),
      onContextLost: () => setWebglLost(true),
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [sendWs]);

  // WebSocket Connection + Reconnection + Ping RTT
  useEffect(() => {
    let closedByUnmount = false;
    let reconnectTimer: number | undefined;
    let pingTimer: number | undefined;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (profile) {
          sendWs('auth:identify', {
            uid: profile.uid,
            username: profile.username,
            country: profile.country,
            avatarColor: profile.avatarColor,
          });
        }
        if (reconnectTokenRef.current) {
          sendWs('match:reconnect', { reconnectToken: reconnectTokenRef.current });
        }
      };

      ws.onmessage = (ev) => {
        let msg: { type: string; payload: any };
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        const { type, payload } = msg;

        switch (type) {
          case 'session:welcome':
            setWsClientId(payload.clientId);
            break;
          case 'pong':
            setPingMs(Math.max(1, Date.now() - Number(payload.ts || Date.now())));
            break;
          case 'queue:status':
            setQueueSize(payload.queueSize || 1);
            if (!payload.inQueue) setModal(null);
            break;
          case 'room:joined':
          case 'room:updated':
            setRoomError(null);
            setRoomState(payload);
            setModal('room');
            if (payload.hostUid === auth.currentUser?.uid) {
              syncRoomMetadata({
                roomId: payload.roomId,
                roomCode: payload.roomCode,
                hostUid: payload.hostUid,
                hostName: payload.members?.[0]?.username || 'Host',
                mode: payload.mode,
                mapId: payload.mapId,
                region: payload.region,
                isPrivate: payload.isPrivate,
                status: payload.status,
                playerCount: payload.members?.length || 1,
                maxPlayers: payload.maxPlayers,
              }).catch(() => {});
            }
            break;
          case 'room:left':
            setRoomState(null);
            setModal(null);
            break;
          case 'room:error':
            setRoomError(payload.message || 'Room error');
            break;
          case 'match:started': {
            reconnectTokenRef.current = payload.reconnectToken;
            setRoomState(payload.roomState);
            setModal(null);
            setChatMessages([]);
            setMatchSnapshot(payload.snapshot);
            setScreen('playing');
            setPaused(false);
            const myId = payload.snapshot.players.find(
              (p: any) => p.uid === (auth.currentUser?.uid || ''),
            )?.id;
            engineRef.current?.startOnlineMatch(myId || wsClientId, payload.snapshot);
            if (myId) setWsClientId(myId);
            break;
          }
          case 'match:snapshot':
            setMatchSnapshot(payload);
            engineRef.current?.receiveOnlineSnapshot(payload);
            break;
          case 'match:ended':
            engineRef.current?.receiveOnlineSnapshot(payload);
            matchCompletedRef.current(payload);
            break;
          case 'chat:message':
            setChatMessages((prev) => [...prev.slice(-24), payload]);
            break;
          case 'rtc:peerJoined':
            voiceRef.current?.handlePeerJoined(payload.peerId, payload.username);
            break;
          case 'rtc:signal':
            voiceRef.current?.handleSignal(payload.fromId, payload.fromName, payload.signal);
            break;
          case 'rtc:speaking':
            voiceRef.current?.handlePeerSpeaking(payload.peerId, payload.speaking, payload.muted);
            break;
        }
      };

      ws.onclose = () => {
        if (!closedByUnmount) {
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      };

      pingTimer = window.setInterval(() => {
        sendWs('ping', { ts: Date.now() });
      }, 4000);
    };

    connect();
    return () => {
      closedByUnmount = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      wsRef.current?.close();
    };
  }, [sendWs]);

  // Identify profile to WS whenever profile changes
  useEffect(() => {
    if (profile) {
      sendWs('auth:identify', {
        uid: profile.uid,
        username: profile.username,
        country: profile.country,
        avatarColor: profile.avatarColor,
      });
      engineRef.current?.startDiorama(selectedMap, profile.avatarColor);
    }
  }, [profile, selectedMap, sendWs]);

  // Splash Screen + Firestore Connection Check + Auth Listener
  useEffect(() => {
    testFirestoreConnection();
    const minSplash = new Promise((r) => setTimeout(r, 900));

    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      await minSplash;
      setAuthReady(true);

      if (!user) {
        setProfile(null);
        setScreen((prev) => (prev === 'playing' ? 'playing' : 'auth'));
        return;
      }

      try {
        const res = await ensureUserAccountAndProfile(
          user.uid,
          user.email || '',
          user.displayName || 'Runner',
          user.photoURL,
        );
        if (res.accountStatus === 'suspended') {
          setSuspendedNotice('Your account is currently under temporary suspension by an administrator.');
          await signOut(auth);
          setScreen('auth');
          return;
        }
        setSuspendedNotice(null);
        if (res.profile) {
          setProfile(res.profile);
          setDraftName(res.profile.username);
          setDraftCountry(res.profile.country);
          setDraftColor(res.profile.avatarColor);
        }
        setScreen(res.isNewProfile ? 'profile_setup' : 'lobby');
      } catch (e) {
        setAuthError(e instanceof Error ? e.message : 'Unable to initialize account.');
        setScreen('auth');
      }
    });

    return () => unsub();
  }, []);

  // Firestore Subscriptions (Friends, Announcements, Global Config) when signed in
  useEffect(() => {
    if (!firebaseUser) {
      setFriends([]);
      setAnnouncements([]);
      return;
    }
    const unsubFriends = subscribeToFriends(firebaseUser.uid, (list) => {
      setFriends(list);
      const blocked = list.filter((f) => f.status === 'blocked').map((f) => f.targetUid);
      voiceRef.current?.setBlockedIds(blocked);
    });
    const unsubAnn = subscribeToAnnouncements(setAnnouncements);
    fetchArenaConfig()
      .then((cfg) => {
        if (cfg) {
          setEnabledMaps(cfg.enabledMaps);
          setEnabledModes(cfg.enabledModes);
        }
      })
      .catch(() => {});

    return () => {
      unsubFriends();
      unsubAnn();
    };
  }, [firebaseUser]);

  // Matchmaking Elapsed Timer
  useEffect(() => {
    if (modal !== 'matchmaking') {
      setQueueElapsed(0);
      return;
    }
    const id = window.setInterval(() => setQueueElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [modal]);

  // Apply settings to Three.js engine & Audio
  useEffect(() => {
    soundSynth.enabled = settings.sfxEnabled;
    soundSynth.volume = settings.masterVolume;
    engineRef.current?.setQuality(settings.graphicsQuality);
    engineRef.current?.setControlPreferences(settings.cameraSensitivity, settings.invertY);
    if (voiceRef.current) {
      voiceRef.current.pushToTalk = settings.pushToTalk;
    }
  }, [settings]);

  // Global keyboard shortcuts (Escape Pause, KeyV Push-to-Talk)
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (screen === 'playing' && e.code === 'Escape') {
        setPaused((p) => {
          const next = !p;
          engineRef.current?.setPaused(next);
          return next;
        });
      }
      if (screen === 'playing' && e.code === 'KeyV' && settings.pushToTalk) {
        voiceRef.current?.setPushToTalkActive(true);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (screen === 'playing' && e.code === 'KeyV' && settings.pushToTalk) {
        voiceRef.current?.setPushToTalkActive(false);
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [screen, settings.pushToTalk]);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Google Sign-In cancelled or failed.');
    }
  };

  const handleSaveProfileSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const next: PlayerProfileData = {
      ...profile,
      username: draftName.trim().slice(0, 24) || 'Runner',
      country: draftCountry,
      avatarColor: draftColor,
    };
    await savePlayerProfile(next);
    setProfile(next);
    setScreen('lobby');
  };

  const launchOfflinePractice = () => {
    setModal(null);
    setPaused(false);
    setSelectedMode('practice');
    setScreen('playing');
    setWsClientId('local_player');
    engineRef.current?.startPracticeMatch({
      mapId: selectedMap,
      playerName: profile?.username || 'Guest-Runner',
      country: profile?.country || 'US',
      avatarColor: profile?.avatarColor || '#06B6D4',
    });
  };

  const handleStartQueue = () => {
    if (selectedMode === 'practice') {
      launchOfflinePractice();
      return;
    }
    setModal('matchmaking');
    sendWs('queue:join', { mode: selectedMode, region: selectedRegion });
  };

  const handleCreateRoom = (isPrivate: boolean) => {
    const mode = selectedMode === 'practice' ? 'duo_battle' : selectedMode;
    sendWs('room:create', {
      mode,
      mapId: selectedMap,
      region: selectedRegion,
      isPrivate,
    });
  };

  const handleExitMatch = () => {
    voiceRef.current?.disconnectAll();
    reconnectTokenRef.current = null;
    sendWs('room:leave', {});
    setRoomState(null);
    setMatchSnapshot(null);
    setPaused(false);
    engineRef.current?.startDiorama(selectedMap, profile?.avatarColor || '#06B6D4');
    setScreen(firebaseUser ? 'lobby' : 'auth');
  };

  const openLeaderboard = async () => {
    setModal('leaderboard');
    setLbLoading(true);
    try {
      setLeaderboard(await fetchLeaderboard('ALL'));
    } finally {
      setLbLoading(false);
    }
  };

  const openHistory = async () => {
    setModal('history');
    if (!firebaseUser) return;
    setHistoryLoading(true);
    try {
      setHistoryRows(await fetchMatchHistory(firebaseUser.uid));
    } finally {
      setHistoryLoading(false);
    }
  };

  const isAdmin = Boolean(firebaseUser && firebaseUser.emailVerified && firebaseUser.email === ADMIN_EMAIL);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#070B14] text-slate-100">
      {/* Isolated Full-Bleed Three.js WebGL Viewport */}
      <div ref={canvasMountRef} className="fixed inset-0 z-0" />

      {webglLost && (
        <div className="fixed inset-0 z-50 bg-[#070B14]/95 flex items-center justify-center p-6">
          <div className="max-w-sm bg-[#0D1526] border border-slate-700 rounded-xl p-6 text-center space-y-3">
            <h2 className="font-display text-lg font-bold text-white">Graphics Context Paused</h2>
            <p className="text-xs text-slate-400">Your device suspended WebGL rendering. Reload to resume the 3D arena.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-cyan-600 text-white text-xs font-semibold rounded-lg"
            >
              Restore 3D Engine
            </button>
          </div>
        </div>
      )}

      {/* Screen 1: Splash Screen */}
      {screen === 'splash' && (
        <div className="fixed inset-0 z-30 bg-[#070B14]/90 flex flex-col items-center justify-center p-6">
          <svg viewBox="0 0 360 90" className="w-72 max-w-[80vw] mb-5" aria-label="WORLD ARENA">
            <defs>
              <linearGradient id="waLogoGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#06B6D4" />
                <stop offset="100%" stopColor="#7C3AED" />
              </linearGradient>
            </defs>
            <polygon points="18,16 42,16 54,45 42,74 18,74 6,45" fill="none" stroke="url(#waLogoGrad)" strokeWidth="3.5" />
            <circle cx="30" cy="45" r="9" fill="#06B6D4" />
            <text x="72" y="49" fill="#F8FAFC" fontFamily="Chakra Petch, sans-serif" fontWeight="700" fontSize="34" letterSpacing="2">
              WORLD ARENA
            </text>
            <text x="74" y="70" fill="#94A3B8" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="500" fontSize="12" letterSpacing="3">
              GLOBAL 3D BATTLE PLATFORM
            </text>
          </svg>
          <div className="text-xs text-slate-400 font-mono-tabular">
            {authReady ? 'Connecting arena services...' : 'Initializing 3D engine and Firebase...'}
          </div>
        </div>
      )}

      {/* Screen 2: Login / Register (with instant Offline Practice access) */}
      {screen === 'auth' && (
        <div className="fixed inset-0 z-30 flex items-center justify-between px-6 md:px-16 pointer-events-none">
          <div className="max-w-md w-full bg-[#0A101E]/92 border border-slate-800 rounded-2xl p-7 space-y-5 pointer-events-auto shadow-2xl">
            <svg viewBox="0 0 320 64" className="w-60" aria-label="WORLD ARENA">
              <polygon points="14,10 34,10 44,32 34,54 14,54 4,32" fill="none" stroke="#06B6D4" strokeWidth="3" />
              <circle cx="24" cy="32" r="7" fill="#7C3AED" />
              <text x="58" y="38" fill="#F8FAFC" fontFamily="Chakra Petch, sans-serif" fontWeight="700" fontSize="28" letterSpacing="1.5">
                WORLD ARENA
              </text>
            </svg>

            <p className="text-sm text-slate-300 leading-relaxed">
              Compete in real-time 3D arena battles across four futuristic maps with server-authoritative combat and WebRTC team voice chat.
            </p>

            {(authError || suspendedNotice) && (
              <div className="p-3 bg-rose-950/75 border border-rose-500/40 rounded-xl text-xs text-rose-200">
                {suspendedNotice || authError}
              </div>
            )}

            <div className="space-y-3 pt-1">
              <button
                onClick={handleGoogleSignIn}
                className="w-full py-3 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                Sign In with Google
              </button>

              <button
                onClick={launchOfflinePractice}
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Gamepad2 className="w-4 h-4 text-purple-400" />
                Play Offline Practice Mode
              </button>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>WASD Move · Space Jump · F Tag</span>
              <button onClick={() => setModal('settings')} className="hover:text-white">
                Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screen 3: Player Profile Setup */}
      {screen === 'profile_setup' && profile && (
        <div className="fixed inset-0 z-30 bg-black/75 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveProfileSetup}
            className="w-full max-w-md bg-[#0D1526] border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div>
              <h2 className="font-display text-xl font-bold text-white">Runner Profile Setup</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Player ID <span className="font-mono-tabular text-cyan-400">{profile.playerCode}</span>
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Arena Callsign</label>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                minLength={2}
                maxLength={24}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Country</label>
              <select
                value={draftCountry}
                onChange={(e) => setDraftCountry(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
              >
                <option value="US">United States (US)</option>
                <option value="GB">United Kingdom (GB)</option>
                <option value="CA">Canada (CA)</option>
                <option value="DE">Germany (DE)</option>
                <option value="FR">France (FR)</option>
                <option value="JP">Japan (JP)</option>
                <option value="KR">South Korea (KR)</option>
                <option value="BR">Brazil (BR)</option>
                <option value="IN">India (IN)</option>
                <option value="AU">Australia (AU)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Suit Energy Accent</label>
              <div className="flex items-center gap-2.5">
                {SUIT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraftColor(c)}
                    className={`w-8 h-8 rounded-lg border-2 ${
                      draftColor === c ? 'border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white text-sm font-semibold rounded-xl"
            >
              Enter Main Lobby
            </button>
          </form>
        </div>
      )}

      {/* Screen 4: Main Lobby (Live 3D Runner Centerpiece, Clean Perimeter Controls) */}
      {screen === 'lobby' && profile && (
        <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 md:p-6">
          {/* Top Bar */}
          <header className="flex items-center justify-between gap-4 pointer-events-auto">
            <div className="flex items-center gap-4 px-4 py-2.5 bg-[#0A101E]/90 border border-slate-800 rounded-xl">
              <div
                className="w-3.5 h-8 rounded-sm shrink-0"
                style={{ backgroundColor: profile.avatarColor }}
              />
              <div>
                <div className="font-display text-sm font-bold text-white flex items-center gap-2">
                  <span>{profile.username}</span>
                  <span className="font-mono-tabular text-xs font-normal text-cyan-400">
                    {profile.country}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono-tabular">
                  {profile.playerCode} · Rating {profile.rating} · Wins {profile.wins}
                </div>
              </div>
            </div>

            <nav className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setModal('friends')}
                className="px-3 py-2 bg-[#0A101E]/90 hover:bg-[#131E36] border border-slate-800 rounded-xl text-xs font-medium text-slate-200 flex items-center gap-1.5"
              >
                <Users className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Friends</span>
              </button>
              <button
                onClick={openLeaderboard}
                className="px-3 py-2 bg-[#0A101E]/90 hover:bg-[#131E36] border border-slate-800 rounded-xl text-xs font-medium text-slate-200 flex items-center gap-1.5"
              >
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Leaderboard</span>
              </button>
              <button
                onClick={openHistory}
                className="px-3 py-2 bg-[#0A101E]/90 hover:bg-[#131E36] border border-slate-800 rounded-xl text-xs font-medium text-slate-200 flex items-center gap-1.5"
              >
                <History className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline">History</span>
              </button>
              <button
                onClick={() => setModal('privacy')}
                className="px-3 py-2 bg-[#0A101E]/90 hover:bg-[#131E36] border border-slate-800 rounded-xl text-xs font-medium text-slate-200 flex items-center gap-1.5"
              >
                <Shield className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Safety</span>
              </button>
              <button
                onClick={() => setModal('settings')}
                className="px-3 py-2 bg-[#0A101E]/90 hover:bg-[#131E36] border border-slate-800 rounded-xl text-xs font-medium text-slate-200 flex items-center gap-1.5"
              >
                <Settings className="w-3.5 h-3.5 text-slate-300" />
                <span className="hidden sm:inline">Settings</span>
              </button>
              {isAdmin && (
                <button
                  onClick={() => setModal('admin')}
                  className="px-3 py-2 bg-purple-950/90 hover:bg-purple-900 border border-purple-500/60 rounded-xl text-xs font-semibold text-purple-200 flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </button>
              )}
              <button
                onClick={() => {
                  setOnlineStatus(profile.uid, 'offline').catch(() => {});
                  signOut(auth);
                }}
                className="p-2 bg-[#0A101E]/90 hover:bg-rose-950 border border-slate-800 rounded-xl text-slate-300 hover:text-rose-200"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </nav>
          </header>

          {/* Live Announcements Banner (if published by Admin) */}
          {announcements.length > 0 && (
            <div className="self-start max-w-md px-4 py-2.5 bg-[#0A101E]/90 border border-cyan-500/40 rounded-xl pointer-events-auto">
              <div className="text-xs font-semibold text-cyan-300">{announcements[0].title}</div>
              <div className="text-xs text-slate-300 mt-0.5">{announcements[0].body}</div>
            </div>
          )}

          {/* Unified Bottom Dock */}
          <div className="self-center w-full max-w-2xl bg-[#0A101E]/92 border border-slate-700/90 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 pointer-events-auto shadow-2xl">
            <button
              onClick={() => setModal('modes')}
              className="flex-1 min-w-[200px] text-left px-3.5 py-2 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded-xl flex items-center justify-between gap-3 transition-colors"
            >
              <div>
                <div className="text-xs font-semibold text-white">
                  {GAME_MODES[selectedMode].name}
                </div>
                <div className="text-[11px] text-slate-400">
                  {ARENA_MAPS[selectedMap].name} · {selectedRegion}
                </div>
              </div>
              <SlidersHorizontal className="w-4 h-4 text-cyan-400 shrink-0" />
            </button>

            <button
              onClick={() => setModal('modes')}
              className="px-4 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200"
            >
              Rooms & Code
            </button>

            <button
              onClick={handleStartQueue}
              className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white text-sm font-display font-bold rounded-xl flex items-center gap-2 shadow-lg"
            >
              <Play className="w-4 h-4" />
              {selectedMode === 'practice' ? 'Launch Practice' : 'Enter Arena'}
            </button>
          </div>
        </div>
      )}

      {/* Screen 8 & 9: 3D Gameplay HUD + Voice Controls */}
      {screen === 'playing' && (
        <GameplayHud
          engine={engineRef.current}
          snapshot={matchSnapshot}
          localPlayerId={selectedMode === 'practice' ? 'local_player' : wsClientId}
          pingMs={pingMs}
          paused={paused}
          isOfflinePractice={selectedMode === 'practice'}
          settings={settings}
          chatMessages={chatMessages}
          voiceState={{
            connected: voiceRef.current?.connected || false,
            micMuted: voiceRef.current?.micMuted ?? true,
            speakerMuted: voiceRef.current?.speakerMuted || false,
            speakerVolume: voiceRef.current?.speakerVolume ?? 0.85,
            channel: voiceRef.current?.channel || 'team',
            pushToTalk: settings.pushToTalk,
            permissionState: voiceRef.current?.permissionState || 'prompt',
            errorMessage: voiceRef.current?.errorMessage || null,
            peers: voiceRef.current?.getPeers() || [],
          }}
          onTogglePause={() => {
            setPaused((p) => {
              const next = !p;
              engineRef.current?.setPaused(next);
              return next;
            });
          }}
          onExitMatch={handleExitMatch}
          onSendChat={(text) => sendWs('chat:send', { text })}
          onVoiceConnect={(ch: VoiceChannelMode) => voiceRef.current?.connectVoice(ch)}
          onVoiceDisconnect={() => voiceRef.current?.disconnectAll()}
          onVoiceToggleMic={() => voiceRef.current?.toggleMicMute()}
          onVoiceToggleSpeaker={() => voiceRef.current?.toggleSpeakerMute()}
          onVoiceVolume={(v) => voiceRef.current?.setSpeakerVolume(v)}
          onVoicePttHold={(a) => voiceRef.current?.setPushToTalkActive(a)}
          onVoiceTogglePeerMute={(id) => voiceRef.current?.togglePeerLocalMute(id)}
          onBlockPlayer={async (uid, username) => {
            if (!firebaseUser) return;
            await sendFriendOrBlockAction(firebaseUser.uid, { uid, username }, 'blocked');
          }}
          onReportPlayer={(uid, username) => {
            setReportTarget({ uid, username });
            setModal('privacy');
          }}
        />
      )}

      {/* Screen 10: Match Results */}
      {screen === 'results' && matchSnapshot && (
        <MatchResultsModal
          snapshot={matchSnapshot}
          localPlayerId={matchSnapshot.mode === 'practice' ? 'local_player' : wsClientId}
          onPlayAgain={() => {
            if (matchSnapshot.mode === 'practice') {
              launchOfflinePractice();
            } else {
              setScreen(firebaseUser ? 'lobby' : 'auth');
              setModal('modes');
            }
          }}
          onReturnLobby={handleExitMatch}
        />
      )}

      {/* Modals (Screens 5, 6, 7, 11, 12, 13, 14, 15 & Admin) */}
      {modal === 'modes' && (
        <GameModeModal
          selectedMode={selectedMode}
          selectedMap={selectedMap}
          selectedRegion={selectedRegion}
          enabledMaps={enabledMaps}
          enabledModes={enabledModes}
          isAuthenticated={Boolean(firebaseUser)}
          onSelectMode={setSelectedMode}
          onSelectMap={(m) => {
            setSelectedMap(m);
            engineRef.current?.startDiorama(m, profile?.avatarColor || '#06B6D4');
          }}
          onSelectRegion={setSelectedRegion}
          onLaunchPractice={launchOfflinePractice}
          onStartQueue={handleStartQueue}
          onCreateRoom={handleCreateRoom}
          onJoinByCode={(code) => sendWs('room:join', { codeOrId: code })}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'matchmaking' && (
        <MatchmakingModal
          mode={selectedMode}
          region={selectedRegion}
          queueSize={queueSize}
          elapsedSec={queueElapsed}
          onCancel={() => {
            sendWs('queue:leave', {});
            setModal(null);
          }}
        />
      )}

      {modal === 'room' && roomState && (
        <RoomLobbyModal
          room={roomState}
          localClientId={wsClientId}
          friends={friends}
          roomError={roomError}
          onToggleReady={() => sendWs('room:toggleReady', {})}
          onSwitchTeam={() => sendWs('room:switchTeam', {})}
          onUpdateConfig={(mode, mapId) => sendWs('room:updateConfig', { mode, mapId })}
          onAddBot={() => sendWs('room:addBot', {})}
          onStartMatch={() => sendWs('room:startMatch', {})}
          onLeaveRoom={() => sendWs('room:leave', {})}
        />
      )}

      {modal === 'friends' && firebaseUser && (
        <FriendsModal
          uid={firebaseUser.uid}
          friends={friends}
          onSearchPlayers={findPlayerByCodeOrUsername}
          onSendFriendRequest={(target) =>
            sendFriendOrBlockAction(firebaseUser.uid, target, 'pending')
          }
          onAcceptRequest={(id) => updateFriendshipStatus(id, 'accepted')}
          onRemoveFriend={removeFriendship}
          onBlockUser={(uid, username) =>
            sendFriendOrBlockAction(firebaseUser.uid, { uid, username }, 'blocked')
          }
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'leaderboard' && (
        <LeaderboardModal
          rows={leaderboard}
          loading={lbLoading}
          onRefresh={async (c) => {
            setLbLoading(true);
            try {
              setLeaderboard(await fetchLeaderboard(c));
            } finally {
              setLbLoading(false);
            }
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'history' && (
        <HistoryModal rows={historyRows} loading={historyLoading} onClose={() => setModal(null)} />
      )}

      {modal === 'settings' && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onEditProfile={() => {
            setModal(null);
            if (profile) setScreen('profile_setup');
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'privacy' && (
        <PrivacySafetyModal
          profile={profile}
          blockedFriends={friends.filter((f) => f.status === 'blocked')}
          prefillReportTarget={reportTarget}
          onUpdatePrivacy={async (privacyVoice, privacyInvites) => {
            if (!profile) return;
            const next = { ...profile, privacyVoice, privacyInvites };
            await savePlayerProfile(next);
            setProfile(next);
          }}
          onUnblock={removeFriendship}
          onSubmitReport={async (input: {
            reportedUid: string;
            reportedUsername: string;
            reason: ReportRecord['reason'];
            details: string;
          }) => {
            if (!firebaseUser) return;
            await submitPlayerReport({
              reporterUid: firebaseUser.uid,
              ...input,
            });
          }}
          onClose={() => {
            setReportTarget(null);
            setModal(null);
          }}
        />
      )}

      {modal === 'admin' && isAdmin && (
        <AdminDashboardModal
          enabledMaps={enabledMaps}
          enabledModes={enabledModes}
          onConfigUpdated={(m, md) => {
            setEnabledMaps(m);
            setEnabledModes(md);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
