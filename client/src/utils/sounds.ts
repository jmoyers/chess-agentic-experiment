// Chess sound effects using Web Audio API
// Lichess-style sounds - clean, subtle wooden clicks

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

// Unlock audio context on first user interaction (required by browsers)
export function unlockAudio(): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
}

// Lichess-style move sound - soft wooden click
export function playMoveSound(): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Very short noise burst - key to Lichess sound
  const bufferSize = Math.floor(ctx.sampleRate * 0.05);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // Generate noise with gentler exponential decay
  for (let i = 0; i < bufferSize; i++) {
    const t = i / ctx.sampleRate;
    // Softer decay for gentler click
    const decay = Math.exp(-t * 80);
    data[i] = (Math.random() * 2 - 1) * decay;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  // Highpass to remove rumble, then bandpass for wood character
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 200;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 800;
  bandpass.Q.value = 0.6;

  // Lowpass to tame harshness
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 2500;

  // Gentle low thump for body
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(70, now + 0.03);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.08, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.18;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.4;

  noise.connect(highpass);
  highpass.connect(bandpass);
  bandpass.connect(lowpass);
  lowpass.connect(noiseGain);
  noiseGain.connect(masterGain);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  masterGain.connect(ctx.destination);

  noise.start(now);
  osc.start(now);
  osc.stop(now + 0.03);
}

// Lichess-style capture sound - slightly heavier wooden thud
export function playCaptureSound(): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Short noise burst, slightly longer than move
  const bufferSize = Math.floor(ctx.sampleRate * 0.06);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    const t = i / ctx.sampleRate;
    // Gentler decay
    const decay = Math.exp(-t * 60);
    data[i] = (Math.random() * 2 - 1) * decay;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  // Lower frequency bandpass for heavier wood sound
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 150;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 700;
  bandpass.Q.value = 0.5;

  // Lowpass to tame harshness
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 2000;

  // Heavier low thump
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(55, now + 0.04);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.1, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.2;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.45;

  noise.connect(highpass);
  highpass.connect(bandpass);
  bandpass.connect(lowpass);
  lowpass.connect(noiseGain);
  noiseGain.connect(masterGain);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  masterGain.connect(ctx.destination);

  noise.start(now);
  osc.start(now);
  osc.stop(now + 0.04);
}

// Lichess-style check sound - subtle metallic ping
export function playCheckSound(): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Soft bell-like tone - lower frequency for warmth
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 880; // A5

  // Subtle harmonic
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 1320; // E6

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.03, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc.connect(gain);
  osc2.connect(gain2);
  gain.connect(ctx.destination);
  gain2.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.15);
  osc2.start(now);
  osc2.stop(now + 0.12);
}

// Castling sound - two moves in quick succession
export function playCastleSound(): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // First piece (king)
  playMoveAtTime(ctx, now);
  // Second piece (rook) slightly delayed
  playMoveAtTime(ctx, now + 0.1);
}

function playMoveAtTime(ctx: AudioContext, time: number): void {
  // Match the soft move sound
  const bufferSize = Math.floor(ctx.sampleRate * 0.05);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    const t = i / ctx.sampleRate;
    const decay = Math.exp(-t * 80);
    data[i] = (Math.random() * 2 - 1) * decay;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 200;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 800;
  bandpass.Q.value = 0.6;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 2500;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, time);
  osc.frequency.exponentialRampToValueAtTime(70, time + 0.03);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.08, time);
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.15;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.35;

  noise.connect(highpass);
  highpass.connect(bandpass);
  bandpass.connect(lowpass);
  lowpass.connect(noiseGain);
  noiseGain.connect(masterGain);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  masterGain.connect(ctx.destination);

  noise.start(time);
  osc.start(time);
  osc.stop(time + 0.03);
}

// Illegal move sound - soft error blip
export function playIllegalSound(): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.linearRampToValueAtTime(130, now + 0.12);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.12);
}

// Game start/new game sound - pleasant chime
export function playGameStartSound(): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const frequencies = [440, 554.37, 659.25]; // A4, C#5, E5 chord - warmer

  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now + i * 0.06);
    gain.gain.linearRampToValueAtTime(0.08, now + i * 0.06 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + i * 0.06);
    osc.stop(now + 0.6);
  });
}

// Lichess-style game end sound - gentle, understated
export function playGameOverSound(): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Soft low tone - not dramatic
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 294; // D4 - slightly lower for warmth

  // Gentle harmonic
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 392; // G4

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.07, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.04, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc.connect(gain);
  osc2.connect(gain2);
  gain.connect(ctx.destination);
  gain2.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.3);
  osc2.start(now);
  osc2.stop(now + 0.25);
}

// Promotion sound - gentle rising tone
export function playPromotionSound(): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(350, now);
  osc.frequency.exponentialRampToValueAtTime(700, now + 0.2);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.35);

  // Add subtle sparkle effect
  setTimeout(() => {
    const sparkle = ctx.createOscillator();
    sparkle.type = 'sine';
    sparkle.frequency.value = 1000;

    const sparkleGain = ctx.createGain();
    sparkleGain.gain.setValueAtTime(0.05, ctx.currentTime);
    sparkleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    sparkle.connect(sparkleGain);
    sparkleGain.connect(ctx.destination);

    sparkle.start(ctx.currentTime);
    sparkle.stop(ctx.currentTime + 0.12);
  }, 180);
}

// Notify sound - subtle ping for AI responses
export function playNotifySound(): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 660;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.18);
}

// Sound preferences
let soundEnabled = true;

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

// Wrapper functions that check if sound is enabled
export const sounds = {
  move: () => soundEnabled && playMoveSound(),
  capture: () => soundEnabled && playCaptureSound(),
  check: () => soundEnabled && playCheckSound(),
  castle: () => soundEnabled && playCastleSound(),
  illegal: () => soundEnabled && playIllegalSound(),
  gameStart: () => soundEnabled && playGameStartSound(),
  gameOver: () => soundEnabled && playGameOverSound(),
  promotion: () => soundEnabled && playPromotionSound(),
  notify: () => soundEnabled && playNotifySound(),
  unlock: unlockAudio,
};

export default sounds;

