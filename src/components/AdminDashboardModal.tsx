import React, { useEffect, useState } from 'react';
import {
  Activity,
  Ban,
  CheckCircle,
  Megaphone,
  Shield,
  Sliders,
  Smartphone,
  X,
} from 'lucide-react';
import { auth } from '../firebase';
import {
  ARENA_MAPS,
  GAME_MODES,
  type GameModeId,
  type MapId,
  type PlayerProfileData,
} from '../game/types';
import {
  adminFetchProfiles,
  adminFetchReports,
  adminPublishAnnouncement,
  adminSaveArenaConfig,
  adminSuspendUser,
  adminUpdateReportStatus,
  type ReportRecord,
} from '../services/firestoreService';

interface ServerHealthData {
  status: string;
  uptimeSec: number;
  connectedPlayers: number;
  activeRooms: number;
  activeMatches: number;
  queueDepth: number;
  totalMatchesStarted: number;
  totalMatchesCompleted: number;
  totalTagsValidated: number;
  tickRateHz: number;
}

export const AdminDashboardModal: React.FC<{
  enabledMaps: MapId[];
  enabledModes: GameModeId[];
  onConfigUpdated: (maps: MapId[], modes: GameModeId[]) => void;
  onClose: () => void;
}> = ({ enabledMaps, enabledModes, onConfigUpdated, onClose }) => {
  const [tab, setTab] = useState<'health' | 'reports' | 'config' | 'announcements' | 'android'>('health');
  const [health, setHealth] = useState<ServerHealthData | null>(null);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [profiles, setProfiles] = useState<PlayerProfileData[]>([]);
  const [mapsState, setMapsState] = useState<MapId[]>(enabledMaps);
  const [modesState, setModesState] = useState<GameModeId[]>(enabledModes);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annSeverity, setAnnSeverity] = useState<'info' | 'event' | 'maintenance'>('info');
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const h = await fetch('/api/health').then((r) => r.json());
      setHealth(h);
    } catch {
      // ignore
    }
    try {
      const [rep, prof] = await Promise.all([adminFetchReports(), adminFetchProfiles()]);
      setReports(rep);
      setProfiles(prof);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'Unable to load Firestore admin records.');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleResolveReport = async (rep: ReportRecord, status: ReportRecord['status'], suspend: boolean) => {
    const uid = auth.currentUser?.uid || 'admin';
    await adminUpdateReportStatus(rep.id, status, uid);
    if (suspend) {
      await adminSuspendUser(rep.reportedUid, true, `Report ${rep.reason}: ${rep.details}`);
    }
    setFeedback(suspend ? `Suspended ${rep.reportedUsername} and marked report ${status}.` : `Report marked ${status}.`);
    loadData();
  };

  const handleSaveConfig = async () => {
    if (mapsState.length === 0 || modesState.length === 0) {
      setFeedback('Keep at least one map and one mode active.');
      return;
    }
    await adminSaveArenaConfig({
      enabledMaps: mapsState,
      enabledModes: modesState,
      updatedBy: auth.currentUser?.uid || 'admin',
    });
    onConfigUpdated(mapsState, modesState);
    setFeedback('Arena map and mode configuration saved to Firestore.');
  };

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) return;
    await adminPublishAnnouncement({
      title: annTitle.trim(),
      body: annBody.trim(),
      severity: annSeverity,
      createdBy: auth.currentUser?.uid || 'admin',
    });
    setAnnTitle('');
    setAnnBody('');
    setFeedback('Live announcement published to all players.');
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[90vh] bg-[#0D1526] border border-slate-700 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-purple-400" />
            <div>
              <h2 className="font-display text-lg font-bold text-white">WORLD ARENA Operations Console</h2>
              <p className="text-xs text-slate-400">Backend-verified administration and moderation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-3 border-b border-slate-800 flex flex-wrap gap-2">
          {[
            { id: 'health', label: 'Server Health', icon: Activity },
            { id: 'reports', label: `Reports (${reports.filter((r) => r.status === 'open').length})`, icon: Ban },
            { id: 'config', label: 'Maps & Modes', icon: Sliders },
            { id: 'announcements', label: 'Announcements', icon: Megaphone },
            { id: 'android', label: 'Android APK / AAB', icon: Smartphone },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id as typeof tab)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 flex items-center gap-1.5 transition-colors ${
                  tab === item.id
                    ? 'border-cyan-400 text-cyan-300 bg-slate-900/60'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {feedback && (
            <div className="p-3 bg-cyan-950/70 border border-cyan-500/40 rounded-xl text-xs text-cyan-200">
              {feedback}
            </div>
          )}

          {tab === 'health' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Connected Sockets', val: health?.connectedPlayers ?? 0 },
                  { label: 'Active Rooms', val: health?.activeRooms ?? 0 },
                  { label: 'Live Matches', val: health?.activeMatches ?? 0 },
                  { label: 'Queue Depth', val: health?.queueDepth ?? 0 },
                  { label: 'Matches Started', val: health?.totalMatchesStarted ?? 0 },
                  { label: 'Matches Completed', val: health?.totalMatchesCompleted ?? 0 },
                  { label: 'Server-Validated Tags', val: health?.totalTagsValidated ?? 0 },
                  { label: 'Server Tick Rate', val: `${health?.tickRateHz ?? 20} Hz` },
                ].map((k) => (
                  <div key={k.label} className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
                    <div className="text-xs text-slate-400">{k.label}</div>
                    <div className="font-mono-tabular text-2xl font-bold text-white mt-1">{k.val}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-300">Registered Player Profiles ({profiles.length})</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2 pr-3">Player</th>
                        <th className="py-2 px-2">ID</th>
                        <th className="py-2 px-2">Country</th>
                        <th className="py-2 px-2 text-right">Rating</th>
                        <th className="py-2 pl-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profiles.map((p) => (
                        <tr key={p.uid} className="border-b border-slate-800/60 text-slate-200">
                          <td className="py-2 pr-3 font-medium">{p.username}</td>
                          <td className="py-2 px-2 font-mono-tabular text-slate-400">{p.playerCode}</td>
                          <td className="py-2 px-2">{p.country}</td>
                          <td className="py-2 px-2 text-right font-mono-tabular">{p.rating}</td>
                          <td className="py-2 pl-2 text-right">
                            <button
                              onClick={() => adminSuspendUser(p.uid, true, 'Suspended by administrator')}
                              className="px-2.5 py-1 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/50 text-rose-200 rounded text-[11px]"
                            >
                              Suspend 7d
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'reports' && (
            <div className="space-y-3">
              {reports.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">No player reports submitted.</div>
              ) : (
                reports.map((rep) => (
                  <div key={rep.id} className="p-4 bg-slate-900/75 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {rep.reportedUsername} · <span className="text-xs text-rose-400">{rep.reason}</span> ·{' '}
                        <span className="text-xs text-slate-400">{rep.status}</span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">{rep.details || 'No details provided.'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleResolveReport(rep, 'dismissed', false)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => handleResolveReport(rep, 'resolved', false)}
                        className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-xs text-white rounded-lg flex items-center gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Resolve
                      </button>
                      <button
                        onClick={() => handleResolveReport(rep, 'resolved', true)}
                        className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-xs text-white rounded-lg"
                      >
                        Suspend Account
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'config' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-2.5">
                  <div className="text-xs font-semibold text-cyan-400">Active 3D Maps</div>
                  {(Object.keys(ARENA_MAPS) as MapId[]).map((m) => (
                    <label key={m} className="flex items-center justify-between text-xs text-slate-200">
                      <span>{ARENA_MAPS[m].name}</span>
                      <input
                        type="checkbox"
                        checked={mapsState.includes(m)}
                        onChange={(e) =>
                          setMapsState((prev) =>
                            e.target.checked ? [...prev, m] : prev.filter((x) => x !== m),
                          )
                        }
                        className="accent-cyan-500 w-4 h-4"
                      />
                    </label>
                  ))}
                </div>
                <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-2.5">
                  <div className="text-xs font-semibold text-purple-400">Active Game Modes</div>
                  {(Object.keys(GAME_MODES) as GameModeId[]).map((m) => (
                    <label key={m} className="flex items-center justify-between text-xs text-slate-200">
                      <span>{GAME_MODES[m].name}</span>
                      <input
                        type="checkbox"
                        checked={modesState.includes(m)}
                        onChange={(e) =>
                          setModesState((prev) =>
                            e.target.checked ? [...prev, m] : prev.filter((x) => x !== m),
                          )
                        }
                        className="accent-cyan-500 w-4 h-4"
                      />
                    </label>
                  ))}
                </div>
              </div>
              <button
                onClick={handleSaveConfig}
                className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-xl"
              >
                Save Global Configuration
              </button>
            </div>
          )}

          {tab === 'announcements' && (
            <form onSubmit={handlePublishAnnouncement} className="space-y-3 max-w-xl">
              <input
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder="Announcement headline"
                maxLength={80}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white"
              />
              <select
                value={annSeverity}
                onChange={(e) => setAnnSeverity(e.target.value as 'info' | 'event' | 'maintenance')}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white"
              >
                <option value="info">Info Notice</option>
                <option value="event">Arena Tournament / Event</option>
                <option value="maintenance">Scheduled Maintenance</option>
              </select>
              <textarea
                value={annBody}
                onChange={(e) => setAnnBody(e.target.value)}
                placeholder="Announcement details..."
                maxLength={400}
                rows={3}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white"
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-xl"
              >
                Publish Announcement
              </button>
            </form>
          )}

          {tab === 'android' && (
            <div className="p-4 bg-slate-900/75 border border-slate-800 rounded-xl space-y-3 text-xs text-slate-300 leading-relaxed">
              <div className="font-display text-sm font-bold text-white">
                Native Android Kotlin + Jetpack Compose + Filament Project (/android-project)
              </div>
              <p>
                The complete native Android Gradle project (<code className="text-cyan-300">com.worldarena.game</code>) is generated in the <code className="text-cyan-300">/android-project</code> directory with Jetpack Compose UI, Google Filament 3D rendering, OkHttp WebSocket synchronization, WebRTC voice chat, and Firebase Auth/Firestore integration.
              </p>
              <p>
                Because the cloud web sandbox runs Node.js without JDK or the Android SDK, binary <code className="text-cyan-300">.apk</code> and <code className="text-cyan-300">.aab</code> packages must be compiled locally in Android Studio or via Gradle:
              </p>
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono-tabular text-[11px] text-cyan-200 overflow-x-auto">
{`cd android-project
# 1. Place google-services.json from Firebase Console into android-project/app/
# 2. Build Debug APK for phone testing:
./gradlew assembleDebug
# 3. Build signed Release Android App Bundle (.aab) for Google Play Console:
./gradlew bundleRelease`}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
