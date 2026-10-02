/*
 * "Nhac study" tren man cho (1.14.0).
 *
 * Moi am thanh deu SINH RA bang Web Audio ngay trong trinh duyet — khong tai tep
 * nhac nao, nen khong vuong ban quyen va khong ton bang thong. Bon kieu:
 * - dan lofi: vong hop am Cmaj7–Am7–Dm7–G7 cham, not ngu cung roi rac, tieng dia than;
 * - mua: tieng on hong loc cao, them tieng lop dop ngau nhien;
 * - song bien: tieng on nau, am luong len xuong theo nhip ~11 giay;
 * - tap trung: tieng on nau deu (che tieng van phong).
 *
 * Mot AudioContext cho ca phien; chi tao khi nguoi dung bam (trinh duyet chan tu phat).
 */

export type AmbientKind = 'lofi' | 'rain' | 'waves' | 'brown';

export const AMBIENT_KINDS: readonly AmbientKind[] = ['lofi', 'rain', 'waves', 'brown'];

export const AMBIENT_INFO: Record<AmbientKind, { label: string; description: string }> = {
  lofi: { label: 'Đàn lofi', description: 'Hợp âm chậm, tiếng đĩa than' },
  rain: { label: 'Mưa', description: 'Mưa rơi đều ngoài cửa sổ' },
  waves: { label: 'Sóng biển', description: 'Sóng vỗ chậm' },
  brown: { label: 'Tập trung', description: 'Tiếng ồn nâu che tạp âm' },
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let stopCurrent: (() => void) | null = null;
let current: AmbientKind | null = null;
let volume = 0.6;

function context(): { audio: AudioContext; out: GainNode } {
  if (!ctx || !master) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { audio: ctx, out: master };
}

type NoiseColor = 'white' | 'pink' | 'brown';

function noiseBuffer(audio: AudioContext, color: NoiseColor): AudioBuffer {
  const length = audio.sampleRate * 4;
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    if (color === 'white') data[i] = white;
    else if (color === 'brown') {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
    }
  }
  return buffer;
}

function loopNoise(audio: AudioContext, color: NoiseColor): AudioBufferSourceNode {
  const source = audio.createBufferSource();
  source.buffer = noiseBuffer(audio, color);
  source.loop = true;
  return source;
}

function fadeIn(audio: AudioContext, gain: GainNode, to: number): void {
  gain.gain.setValueAtTime(0, audio.currentTime);
  gain.gain.linearRampToValueAtTime(to, audio.currentTime + 2);
}

function startRain(audio: AudioContext, out: GainNode): () => void {
  const gain = audio.createGain();
  const source = loopNoise(audio, 'pink');
  const high = audio.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 600;
  const low = audio.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 7000;
  source.connect(high).connect(low).connect(gain).connect(out);
  fadeIn(audio, gain, 0.5);
  source.start();

  /* Giot mua lop dop: mot xung on ngan, loc dai thong, cu 40–200ms mot giot. */
  const drops = audio.createGain();
  drops.gain.value = 0.25;
  drops.connect(out);
  const white = noiseBuffer(audio, 'white');
  let timer = 0;
  const drop = () => {
    const shot = audio.createBufferSource();
    shot.buffer = white;
    const band = audio.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2500 + Math.random() * 3000;
    band.Q.value = 8;
    const env = audio.createGain();
    const t = audio.currentTime;
    env.gain.setValueAtTime(0.4 * Math.random() + 0.01, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    shot.connect(band).connect(env).connect(drops);
    shot.start(t, Math.random() * 3, 0.06);
    timer = window.setTimeout(drop, 40 + Math.random() * 160);
  };
  drop();
  return () => {
    window.clearTimeout(timer);
    source.stop();
    gain.disconnect();
    drops.disconnect();
  };
}

function startWaves(audio: AudioContext, out: GainNode): () => void {
  const source = loopNoise(audio, 'brown');
  const low = audio.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 900;
  const gain = audio.createGain();
  const swell = audio.createGain();
  swell.gain.value = 0.5;
  const lfo = audio.createOscillator();
  lfo.frequency.value = 0.09;
  const depth = audio.createGain();
  depth.gain.value = 0.45;
  lfo.connect(depth).connect(swell.gain);
  source.connect(low).connect(swell).connect(gain).connect(out);
  fadeIn(audio, gain, 0.9);
  source.start();
  lfo.start();
  return () => {
    source.stop();
    lfo.stop();
    gain.disconnect();
  };
}

function startBrown(audio: AudioContext, out: GainNode): () => void {
  const source = loopNoise(audio, 'brown');
  const low = audio.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 500;
  const gain = audio.createGain();
  source.connect(low).connect(gain).connect(out);
  fadeIn(audio, gain, 0.8);
  source.start();
  return () => {
    source.stop();
    gain.disconnect();
  };
}

const midiHz = (note: number) => 440 * 2 ** ((note - 69) / 12);
/* Cmaj7 – Am7 – Dm7 – G7, quang hep o giua ban phim. */
const CHORDS = [
  [48, 55, 59, 64],
  [45, 52, 55, 60],
  [50, 57, 60, 65],
  [43, 50, 53, 59],
];
const MELODY = [72, 74, 76, 79, 81, 84];

function startLofi(audio: AudioContext, out: GainNode): () => void {
  const bus = audio.createGain();
  const warm = audio.createBiquadFilter();
  warm.type = 'lowpass';
  warm.frequency.value = 1800;
  bus.connect(warm).connect(out);
  fadeIn(audio, bus, 0.55);

  /* Tieng dia than: on trang rat nho, loc cao. */
  const crackle = loopNoise(audio, 'white');
  const crackleFilter = audio.createBiquadFilter();
  crackleFilter.type = 'highpass';
  crackleFilter.frequency.value = 3000;
  const crackleGain = audio.createGain();
  crackleGain.gain.value = 0.012;
  crackle.connect(crackleFilter).connect(crackleGain).connect(out);
  crackle.start();

  const note = (hz: number, at: number, length: number, level: number) => {
    const osc = audio.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = hz;
    osc.detune.value = (Math.random() - 0.5) * 12;
    const env = audio.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + 0.04);
    env.gain.exponentialRampToValueAtTime(0.0008, at + length);
    osc.connect(env).connect(bus);
    osc.start(at);
    osc.stop(at + length + 0.05);
  };

  const BAR = 3.2;
  let bar = 0;
  let timer = 0;
  const playBar = () => {
    const t = audio.currentTime + 0.05;
    const chord = CHORDS[bar % CHORDS.length];
    chord.forEach((n, i) => note(midiHz(n), t + i * 0.03, BAR * 1.1, 0.07));
    note(midiHz(chord[0] - 12), t, BAR, 0.09);
    for (let beat = 0; beat < 4; beat += 1) {
      if (Math.random() < 0.45) {
        const pick = MELODY[Math.floor(Math.random() * MELODY.length)];
        note(midiHz(pick), t + beat * (BAR / 4) + Math.random() * 0.1, 1.2, 0.045);
      }
    }
    bar += 1;
    timer = window.setTimeout(playBar, BAR * 1000);
  };
  playBar();
  return () => {
    window.clearTimeout(timer);
    crackle.stop();
    bus.disconnect();
    crackleGain.disconnect();
  };
}

const STARTERS: Record<AmbientKind, (audio: AudioContext, out: GainNode) => () => void> = {
  lofi: startLofi,
  rain: startRain,
  waves: startWaves,
  brown: startBrown,
};

export function playAmbient(kind: AmbientKind): void {
  stopAmbient();
  const { audio, out } = context();
  stopCurrent = STARTERS[kind](audio, out);
  current = kind;
}

export function stopAmbient(): void {
  stopCurrent?.();
  stopCurrent = null;
  current = null;
}

export function currentAmbient(): AmbientKind | null {
  return current;
}

export function setAmbientVolume(value: number): void {
  volume = value;
  if (ctx && master) master.gain.setTargetAtTime(value, ctx.currentTime, 0.1);
}

export function ambientVolume(): number {
  return volume;
}

/** Tieng chuong ngan khi het gio dem nguoc. */
export function chime(): void {
  const { audio } = context();
  const t = audio.currentTime;
  [880, 1318.5].forEach((hz, i) => {
    const start = t + i * 0.35;
    const osc = audio.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    const env = audio.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(0.3, start + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, start + 1.6);
    osc.connect(env).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 1.7);
  });
}
