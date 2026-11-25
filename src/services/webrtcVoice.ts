import type { VoiceChannelMode } from '../game/types';

export interface VoicePeerState {
  peerId: string;
  username: string;
  speaking: boolean;
  muted: boolean;
  localMuted: boolean;
}

export class WebRtcVoiceService {
  private localStream: MediaStream | null = null;
  private peers = new Map<string, RTCPeerConnection>();
  private audioElements = new Map<string, HTMLAudioElement>();
  private peerMeta = new Map<string, VoicePeerState>();
  private blockedIds = new Set<string>();
  private sendSignal: (type: string, payload: unknown) => void;
  private onStateChange: () => void;

  public connected = false;
  public micMuted = true;
  public speakerMuted = false;
  public speakerVolume = 0.85;
  public channel: VoiceChannelMode = 'team';
  public pushToTalk = false;
  public permissionState: 'prompt' | 'granted' | 'denied' | 'unavailable' = 'prompt';
  public errorMessage: string | null = null;

  constructor(
    sendSignal: (type: string, payload: unknown) => void,
    onStateChange: () => void,
  ) {
    this.sendSignal = sendSignal;
    this.onStateChange = onStateChange;
  }

  public getPeers(): VoicePeerState[] {
    return Array.from(this.peerMeta.values());
  }

  public setBlockedIds(ids: string[]): void {
    this.blockedIds = new Set(ids);
    for (const [id, audio] of this.audioElements.entries()) {
      audio.muted = this.speakerMuted || this.blockedIds.has(id);
    }
    this.onStateChange();
  }

  public async connectVoice(channel: VoiceChannelMode): Promise<boolean> {
    this.channel = channel;
    this.errorMessage = null;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.permissionState = 'unavailable';
      this.errorMessage = 'Microphone API unavailable in this browser context.';
      this.onStateChange();
      return false;
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      this.permissionState = 'granted';
      this.connected = true;
      this.micMuted = this.pushToTalk;
      this.applyMicEnabled();
      this.sendSignal('rtc:join', { channel });
      this.onStateChange();
      return true;
    } catch {
      this.permissionState = 'denied';
      this.connected = false;
      this.errorMessage = 'Microphone permission denied. Voice chat remains disconnected.';
      this.onStateChange();
      return false;
    }
  }

  public setPushToTalkActive(active: boolean): void {
    if (!this.connected || !this.pushToTalk) return;
    this.micMuted = !active;
    this.applyMicEnabled();
    this.sendSignal('rtc:speaking', { speaking: active, muted: this.micMuted });
    this.onStateChange();
  }

  public toggleMicMute(): void {
    if (!this.connected) return;
    this.micMuted = !this.micMuted;
    this.applyMicEnabled();
    this.sendSignal('rtc:speaking', { speaking: !this.micMuted, muted: this.micMuted });
    this.onStateChange();
  }

  public toggleSpeakerMute(): void {
    this.speakerMuted = !this.speakerMuted;
    for (const [id, audio] of this.audioElements.entries()) {
      audio.muted = this.speakerMuted || this.blockedIds.has(id);
    }
    this.onStateChange();
  }

  public setSpeakerVolume(vol: number): void {
    this.speakerVolume = Math.max(0, Math.min(1, vol));
    for (const audio of this.audioElements.values()) {
      audio.volume = this.speakerVolume;
    }
    this.onStateChange();
  }

  public togglePeerLocalMute(peerId: string): void {
    const meta = this.peerMeta.get(peerId);
    if (!meta) return;
    meta.localMuted = !meta.localMuted;
    const audio = this.audioElements.get(peerId);
    if (audio) {
      audio.muted = this.speakerMuted || meta.localMuted || this.blockedIds.has(peerId);
    }
    this.onStateChange();
  }

  private applyMicEnabled(): void {
    if (!this.localStream) return;
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !this.micMuted;
    }
  }

  private createPeerConnection(peerId: string, username: string): RTCPeerConnection {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.sendSignal('rtc:signal', { targetId: peerId, signal: { candidate: e.candidate } });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (!stream) return;
      let audio = this.audioElements.get(peerId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        this.audioElements.set(peerId, audio);
      }
      audio.srcObject = stream;
      audio.volume = this.speakerVolume;
      const meta = this.peerMeta.get(peerId);
      audio.muted = this.speakerMuted || Boolean(meta?.localMuted) || this.blockedIds.has(peerId);
    };

    this.peers.set(peerId, pc);
    if (!this.peerMeta.has(peerId)) {
      this.peerMeta.set(peerId, {
        peerId,
        username,
        speaking: false,
        muted: false,
        localMuted: false,
      });
    }
    return pc;
  }

  public async handlePeerJoined(peerId: string, username: string): Promise<void> {
    if (!this.connected) return;
    const pc = this.createPeerConnection(peerId, username);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.sendSignal('rtc:signal', { targetId: peerId, signal: { sdp: offer } });
    this.onStateChange();
  }

  public async handleSignal(fromId: string, fromName: string, signal: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }): Promise<void> {
    if (!this.connected) return;
    const pc = this.createPeerConnection(fromId, fromName);
    if (signal.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      if (signal.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal('rtc:signal', { targetId: fromId, signal: { sdp: answer } });
      }
    } else if (signal.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
    this.onStateChange();
  }

  public handlePeerSpeaking(peerId: string, speaking: boolean, muted: boolean): void {
    const meta = this.peerMeta.get(peerId);
    if (meta) {
      meta.speaking = speaking;
      meta.muted = muted;
      this.onStateChange();
    }
  }

  public disconnectAll(): void {
    for (const pc of this.peers.values()) {
      pc.close();
    }
    this.peers.clear();
    for (const audio of this.audioElements.values()) {
      audio.srcObject = null;
    }
    this.audioElements.clear();
    this.peerMeta.clear();
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }
    this.connected = false;
    this.micMuted = true;
    this.onStateChange();
  }
}
