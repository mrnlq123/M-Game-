import React, { useRef, useState } from 'react';
import {
  Crosshair,
  Eye,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  Pause,
  Play,
  Radio,
  ShieldAlert,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import type { ArenaEngine } from '../game/ArenaEngine';
import type {
  ChatMessage,
  MatchSnapshot,
  UserSettings,
  VoiceChannelMode,
} from '../game/types';
import type { VoicePeerState } from '../services/webrtcVoice';

interface GameplayHudProps {
  engine: ArenaEngine | null;
  snapshot: MatchSnapshot | null;
  localPlayerId: string;
  pingMs: number;
  paused: boolean;
  isOfflinePractice: boolean;
  settings: UserSettings;
  chatMessages: ChatMessage[];
  voiceState: {
    connected: boolean;
    micMuted: boolean;
    speakerMuted: boolean;
    speakerVolume: number;
    channel: VoiceChannelMode;
    pushToTalk: boolean;
    permissionState: string;
    errorMessage: string | null;
    peers: VoicePeerState[];
  };
  onTogglePause: () => void;
  onExitMatch: () => void;
  onSendChat: (text: string) => void;
  onVoiceConnect: (channel: VoiceChannelMode) => void;
  onVoiceDisconnect: () => void;
  onVoiceToggleMic: () => void;
  onVoiceToggleSpeaker: () => void;
  onVoiceVolume: (v: number) => void;
  onVoicePttHold: (active: boolean) => void;
  onVoiceTogglePeerMute: (peerId: string) => void;
  onBlockPlayer: (uid: string, username: string) => void;
  onReportPlayer: (uid: string, username: string) => void;
}

export const GameplayHud: React.FC<GameplayHudProps> = ({
  engine,
  snapshot,
  localPlayerId,
  pingMs,
  paused,
  isOfflinePractice,
  settings,
  chatMessages,
  voiceState,
  onTogglePause,
  onExitMatch,
  onSendChat,
  onVoiceConnect,
  onVoiceDisconnect,
  onVoiceToggleMic,
  onVoiceToggleSpeaker,
  onVoiceVolume,
  onVoicePttHold,
  onVoiceTogglePeerMute,
  onBlockPlayer,
  onReportPlayer,
}) => {
  const [showVoiceDrawer, setShowVoiceDrawer] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [sprintLocked, setSprintLocked] = useState(false);

  // Virtual Joystick state
  const joyRef = useRef<HTMLDivElement | null>(null);
  const joyPointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });

  // Right-side camera touch-drag state
  const camPointerId = useRef<number | null>(null);
  const lastCamPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const me = snapshot?.players.find((p) => p.id === localPlayerId);

  const handleJoystickMove = (clientX: number, clientY: number) => {
    const el = joyRef.current;
    if (!el || !engine) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width * 0.42;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    setKnobOffset({ x: dx, y: dy });
    // Note: forward is -dy in screen space -> +moveZ
    engine.setJoystickMove(dx / maxR, -dy / maxR);
  };

  const resetJoystick = () => {
    joyPointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    engine?.setJoystickMove(0, 0);
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const joyPx = Math.round(112 * settings.joystickScale);

  return (
    <div className="fixed inset-0 z-20 pointer-events-none select-none overflow-hidden">
      {/* Right-Side Camera Touch / Mouse Drag Surface (behind HUD buttons) */}
      <div
        className="absolute inset-y-0 right-0 w-1/2 pointer-events-auto touch-none"
        onPointerDown={(e) => {
          if (paused) return;
          camPointerId.current = e.pointerId;
          lastCamPos.current = { x: e.clientX, y: e.clientY };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (camPointerId.current !== e.pointerId || paused) return;
          const dx = e.clientX - lastCamPos.current.x;
          const dy = e.clientY - lastCamPos.current.y;
          lastCamPos.current = { x: e.clientX, y: e.clientY };
          engine?.rotateCamera(dx, dy);
        }}
        onPointerUp={(e) => {
          if (camPointerId.current === e.pointerId) {
            camPointerId.current = null;
          }
        }}
        onPointerCancel={() => {
          camPointerId.current = null;
        }}
      />

      {/* Center Crosshair */}
      {!paused && !me?.eliminated && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-5 h-5 border border-cyan-400/70 rounded-full flex items-center justify-center">
            <div className="w-1 h-1 bg-cyan-300 rounded-full" />
          </div>
        </div>
      )}

      {/* Top Match Scoreboard & Objective Bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none">
        <div className="flex items-center gap-4 px-4 py-2 bg-[#0A101E]/90 border border-slate-700/80 rounded-xl shadow-lg">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-cyan-400">BLUE</span>
            <span className="font-mono-tabular text-lg font-bold text-white">
              {snapshot?.blueScore ?? 0}
            </span>
          </div>
          <div className="h-5 w-px bg-slate-700" />
          <div className="font-mono-tabular text-base font-bold text-slate-100 min-w-[52px] text-center">
            {formatTimer(snapshot?.timeRemaining ?? 0)}
          </div>
          <div className="h-5 w-px bg-slate-700" />
          <div className="flex items-center gap-2">
            <span className="font-mono-tabular text-lg font-bold text-white">
              {snapshot?.redScore ?? 0}
            </span>
            <span className="text-xs font-semibold text-rose-400">RED</span>
          </div>
        </div>

        {/* Objective Capture Bar */}
        {snapshot && (
          <div className="flex items-center gap-2.5 px-3 py-1 bg-[#0A101E]/85 border border-slate-800 rounded-lg text-xs text-slate-200">
            <span className="font-medium text-slate-300">{snapshot.objective.name}</span>
            <div className="w-28 h-1.5 bg-slate-800 rounded overflow-hidden">
              <div
                className={`h-full transition-all duration-150 ${
                  snapshot.objective.ownerTeam === 'blue' ||
                  snapshot.objective.capturingTeam === 'blue'
                    ? 'bg-cyan-400'
                    : snapshot.objective.ownerTeam === 'red' ||
                        snapshot.objective.capturingTeam === 'red'
                      ? 'bg-rose-400'
                      : 'bg-amber-400'
                }`}
                style={{ width: `${Math.round(snapshot.objective.progress)}%` }}
              />
            </div>
            <span className="font-mono-tabular text-[11px] text-slate-400">
              {snapshot.objective.capturingTeam === 'contested'
                ? 'Contested'
                : snapshot.objective.ownerTeam === 'neutral'
                  ? `${Math.round(snapshot.objective.progress)}%`
                  : snapshot.objective.ownerTeam === 'blue'
                    ? 'Blue Held'
                    : 'Red Held'}
            </span>
          </div>
        )}

        {snapshot?.lastEvent && (
          <div className="px-3 py-0.5 bg-[#0A101E]/80 border border-slate-800 rounded text-[11px] text-cyan-200">
            {snapshot.lastEvent}
          </div>
        )}
      </div>

      {/* Top-Left Player Energy & Latency */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-auto">
        <div className="px-3.5 py-2 bg-[#0A101E]/90 border border-slate-700/80 rounded-xl min-w-[180px]">
          <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
            <span className="font-semibold truncate max-w-[110px]">{me?.username || 'Runner'}</span>
            <span className="font-mono-tabular text-cyan-300">{me?.energy ?? 100}%</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-100"
              style={{ width: `${me?.energy ?? 100}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400 font-mono-tabular">
            <span>Tags {me?.tags ?? 0}</span>
            <span>·</span>
            <span>Score {me?.score ?? 0}</span>
            <span>·</span>
            <span>{isOfflinePractice ? 'Offline' : `${pingMs} ms`}</span>
          </div>
        </div>
      </div>

      {/* Top-Right Voice, Chat & Pause Controls */}
      <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-auto">
        {!isOfflinePractice && (
          <>
            <button
              onClick={() => setShowChat((v) => !v)}
              className="min-w-[44px] min-h-[44px] px-3 bg-[#0A101E]/90 hover:bg-[#131E36] border border-slate-700 rounded-xl flex items-center gap-1.5 text-xs font-medium text-slate-200 transition-colors"
              title="Match Chat"
            >
              <MessageSquare className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline">Chat</span>
            </button>
            <button
              onClick={() => setShowVoiceDrawer((v) => !v)}
              className={`min-w-[44px] min-h-[44px] px-3 border rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors ${
                voiceState.connected
                  ? 'bg-cyan-950/90 border-cyan-500/60 text-cyan-200'
                  : 'bg-[#0A101E]/90 hover:bg-[#131E36] border-slate-700 text-slate-200'
              }`}
              title="Voice Chat Controls"
            >
              {voiceState.connected && !voiceState.micMuted ? (
                <Mic className="w-4 h-4 text-cyan-400" />
              ) : (
                <MicOff className="w-4 h-4 text-slate-400" />
              )}
              <span className="hidden sm:inline">Voice</span>
            </button>
          </>
        )}
        <button
          onClick={onTogglePause}
          className="min-w-[44px] min-h-[44px] px-3 bg-[#0A101E]/90 hover:bg-[#131E36] border border-slate-700 rounded-xl flex items-center gap-1.5 text-xs font-medium text-slate-200 transition-colors"
          title="Pause (Esc)"
        >
          <Pause className="w-4 h-4 text-purple-400" />
          <span className="hidden sm:inline">Pause</span>
        </button>
      </div>

      {/* Respawn / Spectator Overlay */}
      {me?.eliminated && !paused && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 px-5 py-3 bg-[#0A101E]/92 border border-rose-500/50 rounded-xl flex items-center gap-4 pointer-events-auto">
          <div>
            <div className="text-xs font-semibold text-rose-400">Energy Depleted — Respawning</div>
            <div className="font-mono-tabular text-sm text-slate-200">
              Back in arena in {me.respawnTimer.toFixed(1)}s
            </div>
          </div>
          <button
            onClick={() => engine?.cycleSpectatorTarget()}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs text-slate-100 flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            Next Cam
          </button>
        </div>
      )}

      {/* Bottom-Left Virtual Joystick (Mobile + Desktop visual feedback) */}
      <div className="absolute bottom-5 left-5 flex flex-col items-start gap-2 pointer-events-auto">
        <div
          ref={joyRef}
          style={{ width: joyPx, height: joyPx }}
          className="relative rounded-full bg-[#0A101E]/75 border-2 border-cyan-500/40 touch-none flex items-center justify-center"
          onPointerDown={(e) => {
            if (paused) return;
            joyPointerId.current = e.pointerId;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            handleJoystickMove(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (joyPointerId.current === e.pointerId) {
              handleJoystickMove(e.clientX, e.clientY);
            }
          }}
          onPointerUp={(e) => {
            if (joyPointerId.current === e.pointerId) resetJoystick();
          }}
          onPointerCancel={resetJoystick}
        >
          <div
            className="w-11 h-11 rounded-full bg-cyan-500/80 border border-cyan-200 shadow-md pointer-events-none"
            style={{
              transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
            }}
          />
        </div>
        <div className="text-[11px] text-slate-400 hidden md:block">
          WASD Move · Drag Right Camera · Space Jump · Shift Sprint · F Fire
        </div>
      </div>

      {/* Bottom-Right Action Controls (Mobile-friendly >= 48px touch targets) */}
      <div className="absolute bottom-5 right-5 flex items-end gap-3 pointer-events-auto">
        {voiceState.connected && voiceState.pushToTalk && (
          <button
            onPointerDown={() => onVoicePttHold(true)}
            onPointerUp={() => onVoicePttHold(false)}
            onPointerCancel={() => onVoicePttHold(false)}
            className="w-12 h-12 rounded-xl bg-purple-700/90 active:bg-purple-500 border border-purple-400/70 flex flex-col items-center justify-center text-[10px] font-semibold text-white"
          >
            <Radio className="w-4 h-4 mb-0.5" />
            PTT
          </button>
        )}

        <button
          onClick={() => {
            const next = !sprintLocked;
            setSprintLocked(next);
            engine?.setTouchAction('sprint', next);
          }}
          className={`w-13 h-13 rounded-xl border flex flex-col items-center justify-center text-[10px] font-semibold transition-colors ${
            sprintLocked
              ? 'bg-cyan-600/90 border-cyan-300 text-white'
              : 'bg-[#0A101E]/85 border-slate-700 text-slate-200'
          }`}
        >
          <Zap className="w-4 h-4 mb-0.5" />
          Sprint
        </button>

        <button
          onPointerDown={() => engine?.setTouchAction('interact', true)}
          onPointerUp={() => engine?.setTouchAction('interact', false)}
          onPointerCancel={() => engine?.setTouchAction('interact', false)}
          className="w-13 h-13 rounded-xl bg-[#0A101E]/85 active:bg-amber-600 border border-slate-700 flex flex-col items-center justify-center text-[10px] font-semibold text-slate-200"
        >
          <Users className="w-4 h-4 mb-0.5 text-amber-400" />
          Core
        </button>

        <button
          onPointerDown={() => engine?.setTouchAction('jump', true)}
          onPointerUp={() => engine?.setTouchAction('jump', false)}
          onPointerCancel={() => engine?.setTouchAction('jump', false)}
          className="w-14 h-14 rounded-xl bg-[#0A101E]/85 active:bg-blue-600 border border-slate-600 flex flex-col items-center justify-center text-[11px] font-semibold text-white"
        >
          Jump
        </button>

        <button
          onPointerDown={() => engine?.setTouchAction('fire', true)}
          onPointerUp={() => engine?.setTouchAction('fire', false)}
          onPointerCancel={() => engine?.setTouchAction('fire', false)}
          className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-purple-600 active:scale-95 border border-cyan-300/80 shadow-lg flex flex-col items-center justify-center text-xs font-bold text-white"
        >
          <Crosshair className="w-5 h-5 mb-0.5" />
          TAG
        </button>
      </div>

      {/* Voice Chat Controls Drawer (Screen 9) */}
      {showVoiceDrawer && (
        <div className="absolute top-16 right-3 w-80 max-w-[92vw] bg-[#0D1526] border border-slate-700 rounded-xl p-4 space-y-3 pointer-events-auto shadow-2xl">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-white">Voice Communications</h3>
            <button
              onClick={() => setShowVoiceDrawer(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {(['team', 'party', 'room'] as VoiceChannelMode[]).map((ch) => (
              <button
                key={ch}
                onClick={() => onVoiceConnect(ch)}
                className={`py-1.5 rounded-lg text-xs font-medium capitalize border transition-colors ${
                  voiceState.connected && voiceState.channel === ch
                    ? 'bg-cyan-600 border-cyan-400 text-white'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                {ch}
              </button>
            ))}
          </div>

          {voiceState.errorMessage && (
            <div className="p-2.5 bg-rose-950/70 border border-rose-500/40 rounded-lg text-xs text-rose-200">
              {voiceState.errorMessage}
            </div>
          )}

          <div className="flex items-center gap-2">
            {!voiceState.connected ? (
              <button
                onClick={() => onVoiceConnect(voiceState.channel)}
                className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg"
              >
                Connect Mic (WebRTC)
              </button>
            ) : (
              <>
                <button
                  onClick={onVoiceToggleMic}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${
                    voiceState.micMuted
                      ? 'bg-slate-800 text-slate-300 border border-slate-700'
                      : 'bg-cyan-600 text-white'
                  }`}
                >
                  {voiceState.micMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  {voiceState.micMuted ? 'Unmute Mic' : 'Mic Live'}
                </button>
                <button
                  onClick={onVoiceToggleSpeaker}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-slate-200"
                  title="Mute Speaker"
                >
                  {voiceState.speakerMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
                </button>
                <button
                  onClick={onVoiceDisconnect}
                  className="px-3 py-2 bg-rose-900/70 hover:bg-rose-800 rounded-lg text-xs text-rose-100"
                >
                  Leave
                </button>
              </>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Speaker Output</span>
              <span className="font-mono-tabular">{Math.round(voiceState.speakerVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={voiceState.speakerVolume}
              onChange={(e) => onVoiceVolume(Number(e.target.value))}
              className="w-full accent-cyan-500"
            />
          </div>

          {/* Active Peers */}
          <div className="space-y-1.5 max-h-36 overflow-y-auto pt-1 border-t border-slate-800">
            <div className="text-[11px] text-slate-400">
              Connected Peers ({voiceState.peers.length})
            </div>
            {voiceState.peers.length === 0 ? (
              <div className="text-xs text-slate-500">No voice peers connected in this channel yet.</div>
            ) : (
              voiceState.peers.map((peer) => (
                <div
                  key={peer.peerId}
                  className="flex items-center justify-between gap-2 py-1 px-2 bg-slate-900/70 rounded-lg text-xs"
                >
                  <span className={`truncate ${peer.speaking ? 'text-cyan-300 font-semibold' : 'text-slate-200'}`}>
                    {peer.username}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onVoiceTogglePeerMute(peer.peerId)}
                      className="px-2 py-0.5 bg-slate-800 rounded text-[11px] text-slate-300 hover:text-white"
                    >
                      {peer.localMuted ? 'Unmute' : 'Mute'}
                    </button>
                    <button
                      onClick={() => onBlockPlayer(peer.peerId, peer.username)}
                      className="px-2 py-0.5 bg-slate-800 rounded text-[11px] text-amber-300 hover:text-amber-200"
                    >
                      Block
                    </button>
                    <button
                      onClick={() => onReportPlayer(peer.peerId, peer.username)}
                      className="p-1 text-rose-400 hover:text-rose-300"
                      title="Report Player"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Match Chat Drawer */}
      {showChat && !isOfflinePractice && (
        <div className="absolute top-16 right-3 w-72 max-w-[90vw] bg-[#0D1526] border border-slate-700 rounded-xl p-3 space-y-2 pointer-events-auto shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200">Arena Chat</span>
            <button onClick={() => setShowChat(false)} className="text-xs text-slate-400 hover:text-white">
              Close
            </button>
          </div>
          <div className="h-36 overflow-y-auto space-y-1.5 text-xs">
            {chatMessages.length === 0 ? (
              <div className="text-slate-500">No messages yet.</div>
            ) : (
              chatMessages.map((m) => (
                <div key={m.id} className="leading-snug">
                  <span className={m.team === 'blue' ? 'text-cyan-400 font-semibold' : 'text-rose-400 font-semibold'}>
                    {m.senderName}:{' '}
                  </span>
                  <span className="text-slate-200">{m.text}</span>
                </div>
              ))
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!chatInput.trim()) return;
              onSendChat(chatInput);
              setChatInput('');
            }}
            className="flex gap-1.5"
          >
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Send team callout..."
              maxLength={140}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Pause Modal */}
      {paused && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 pointer-events-auto z-40">
          <div className="w-full max-w-sm bg-[#0D1526] border border-slate-700 rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-xl font-bold text-white">Match Paused</h2>
            <p className="text-xs text-slate-400">
              {isOfflinePractice
                ? 'Offline Practice simulation is paused.'
                : 'Online match continues on the authoritative server while paused.'}
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={onTogglePause}
                className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                Resume Match
              </button>
              <button
                onClick={onExitMatch}
                className="w-full py-2.5 bg-rose-900/70 hover:bg-rose-800 border border-rose-700/60 text-rose-100 text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Leave Arena
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
