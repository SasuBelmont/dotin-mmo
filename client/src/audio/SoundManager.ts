/**
 * SoundManager.ts - Generador de Audio Procedural y BGM con Web Audio API
 * No requiere descargar archivos externos de audio: sintetiza en tiempo real
 * con cero latencia y alta fidelidad.
 */

export class SoundManager {
  private static instance: SoundManager | null = null;
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private isBgmPlaying: boolean = true;
  private currentBgmTrack: 'overworld' | 'combat' | 'none' = 'overworld';
  private overworldAudio: HTMLAudioElement | null = null;
  private combatAudio: HTMLAudioElement | null = null;
  private masterGain: GainNode | null = null;

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  constructor() {
    // Inicialización de audio en el primer gesto del usuario
    const initAudio = () => {
      this.initContext();
      if (this.isBgmPlaying && this.currentBgmTrack !== 'none') {
        if (this.currentBgmTrack === 'combat') {
          this.playCombatBGM();
        } else {
          this.playOverworldBGM();
        }
      }
      window.removeEventListener('click', initAudio);
      window.removeEventListener('keydown', initAudio);
    };
    window.addEventListener('click', initAudio, { once: true });
    window.addEventListener('keydown', initAudio, { once: true });
  }

  private initContext(): void {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.7, this.ctx.currentTime);
    }
    if (this.overworldAudio) {
      this.overworldAudio.volume = this.isMuted ? 0 : 0.35;
    }
    if (this.combatAudio) {
      this.combatAudio.volume = this.isMuted ? 0 : 0.38;
    }
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  // --- EFECTOS DE SONIDO (SFX) ---

  /** Golpe / Corte de Espada Metin2 */
  public playSlash(): void {
    if (this.isMuted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Ruido blanco filtrado para el tajo de viento
    const bufferSize = this.ctx.sampleRate * 0.12;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(3200, now + 0.08);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);

    // Oscilador metálico
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.1);

    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  /** Impacto fuerte de daño recibido */
  public playImpact(): void {
    if (this.isMuted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.18);

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  /** Hechizo de Fuego / Sura (Golpe Llama) */
  public playFire(): void {
    if (this.isMuted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.4);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.45);
  }

  /** Curación / Hechizo Chamán */
  public playHeal(): void {
    if (this.isMuted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

    freqs.forEach((freq, idx) => {
      const startTime = now + idx * 0.08;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.25, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(startTime);
      osc.stop(startTime + 0.32);
    });
  }

  /** Tintineo de Monedas Yang */
  public playYangCoin(): void {
    if (this.isMuted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    [1975.5, 2349.3].forEach((f, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const st = now + idx * 0.05;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, st);

      gain.gain.setValueAtTime(0.3, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(st);
      osc.stop(st + 0.16);
    });
  }

  /** Fanfarria de Subida de Nivel (Level Up!) */
  public playLevelUp(): void {
    if (this.isMuted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99]; // C4, E4, G4, C5, E5, G5

    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const st = now + i * 0.09;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, st);

      gain.gain.setValueAtTime(0.4, st);
      gain.gain.exponentialRampToValueAtTime(0.005, st + 0.28);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(st);
      osc.stop(st + 0.3);
    });
  }

  /** Éxito del Herrero (+1) */
  public playBlacksmithSuccess(): void {
    if (this.isMuted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    // Acorde brillante celestial
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(now);
      osc.stop(now + 0.85);
    });
  }

  /** Fallo del Herrero */
  public playBlacksmithFail(): void {
    if (this.isMuted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(80, now + 0.5);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.52);
  }

  /** Clic de Interfaz táctil */
  public playButtonClick(): void {
    if (this.isMuted || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  // --- MÚSICA AUTÉNTICA DE METIN2 (Overworld y Combate) ---

  public playOverworldBGM(): void {
    this.currentBgmTrack = 'overworld';
    if (!this.isBgmPlaying) return;
    this.initContext();

    if (this.combatAudio) {
      this.combatAudio.pause();
    }

    if (!this.overworldAudio) {
      this.overworldAudio = new Audio('/assets/audio/enter_the_east.mp3');
      this.overworldAudio.loop = true;
    }
    this.overworldAudio.volume = this.isMuted ? 0 : 0.35;
    this.overworldAudio.play().catch(() => {
      // Navegador bloquea autoplay hasta el primer click
    });
  }

  public playCombatBGM(): void {
    this.currentBgmTrack = 'combat';
    if (!this.isBgmPlaying) return;
    this.initContext();

    if (this.overworldAudio) {
      this.overworldAudio.pause();
    }

    if (!this.combatAudio) {
      this.combatAudio = new Audio('/assets/audio/Only_my_battle.mp3');
      this.combatAudio.loop = true;
    }
    this.combatAudio.volume = this.isMuted ? 0 : 0.38;
    this.combatAudio.play().catch(() => {
      // Navegador bloquea autoplay hasta el primer click
    });
  }

  public startAmbientBGM(): void {
    this.isBgmPlaying = true;
    if (this.currentBgmTrack === 'combat') {
      this.playCombatBGM();
    } else {
      this.playOverworldBGM();
    }
  }

  public stopAmbientBGM(): void {
    this.isBgmPlaying = false;
    if (this.overworldAudio) {
      this.overworldAudio.pause();
    }
    if (this.combatAudio) {
      this.combatAudio.pause();
    }
  }

  public toggleAmbientBGM(): boolean {
    if (this.isBgmPlaying) {
      this.stopAmbientBGM();
      return false;
    } else {
      this.startAmbientBGM();
      return true;
    }
  }
}
