/**
 * Nebula Odyssey Procedural Audio Engine
 * Powered by browser Web Audio API.
 * Synthesizes all music and SFX in real-time. No assets required.
 */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    
    // Volume levels (0.0 to 1.0)
    this.volumes = {
      master: 0.7,
      music: 0.6,
      sfx: 0.8
    };

    this.isPlayingMusic = false;
    this.musicIntervalId = null;
    this.tempo = 110; // BPM
    this.activeTrack = 'synthwave'; // synthwave, retro, ambient
    
    // Music sequencing state
    this.step = 0;
    this.chordProgression = [
      [57, 60, 64], // Am (A3, C4, E4)
      [53, 57, 60], // F  (F3, A3, C4)
      [48, 52, 55], // C  (C3, E3, G3)
      [55, 59, 62]  // G  (G3, B3, D4)
    ];
    this.currentChordIdx = 0;
    this.urgencyMode = false; // Fast tempo during boss fights
  }

  setSoundtrack(track) {
    if (this.activeTrack === track) return;
    this.activeTrack = track;
    
    // Adjust base tempo based on selected genre
    if (track === 'synthwave') this.tempo = 110;
    else if (track === 'retro') this.tempo = 90;
    else this.tempo = 70; // ambient

    if (this.isPlayingMusic) {
      this.stopMusic();
      this.startMusic();
    }
  }

  init() {
    if (this.ctx) return; // Already initialized

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Create node graph
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volumes.master;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.volumes.music;
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.volumes.sfx;
    this.sfxGain.connect(this.masterGain);
  }

  // --- VOLUME CONTROLS ---
  setMasterVolume(val) {
    this.volumes.master = val;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }
  }

  setMusicVolume(val) {
    this.volumes.music = val;
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }
  }

  setSfxVolume(val) {
    this.volumes.sfx = val;
    if (this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }
  }

  resumeContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // --- SOUND EFFECTS SYNTHESIS ---

  // Player lasers
  playLaserSound(pitch = 1.0) {
    this.init();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    
    // Main laser oscillator
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    // Synth type (triangle has a nice deep punch, saw is buzzier)
    osc.type = 'sawtooth';
    
    // Frequency sweep (starts high, drops rapidly)
    const baseFreq = 880 * pitch;
    osc.frequency.setValueAtTime(baseFreq, time);
    osc.frequency.exponentialRampToValueAtTime(110 * pitch, time + 0.15);
    
    // Apply bandpass filter to make it fit in the space theme
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, time);
    filter.frequency.exponentialRampToValueAtTime(300, time + 0.15);
    filter.Q.value = 1.5;

    // Gain envelope
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    // Connections
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(time);
    osc.stop(time + 0.2);
  }

  // Enemy lasers (differs in waveform and direction)
  playEnemyLaserSound() {
    this.init();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.2);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, time);
    filter.frequency.exponentialRampToValueAtTime(200, time + 0.2);

    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(time);
    osc.stop(time + 0.22);
  }

  // Explosions (White noise with low-pass sweep)
  playExplosionSound(scale = 1.0) {
    this.init();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const duration = 0.4 * scale;
    
    // Generate white noise buffer
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;

    // Filter to shape noise (lowpass for rumble, bandpass for details)
    const lpFilter = this.ctx.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.setValueAtTime(800, time);
    lpFilter.frequency.exponentialRampToValueAtTime(30, time + duration);
    lpFilter.Q.value = 1.0;

    // Add extra bass thump oscillator for big explosions
    if (scale > 1.2) {
      const thump = this.ctx.createOscillator();
      const thumpGain = this.ctx.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(100, time);
      thump.frequency.exponentialRampToValueAtTime(20, time + 0.3);
      
      thumpGain.gain.setValueAtTime(0.8, time);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
      
      thump.connect(thumpGain);
      thumpGain.connect(this.sfxGain);
      thump.start(time);
      thump.stop(time + 0.3);
    }

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4 * scale, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noiseSource.connect(lpFilter);
    lpFilter.connect(gain);
    gain.connect(this.sfxGain);

    noiseSource.start(time);
    noiseSource.stop(time + duration);
  }

  // Player damage thud
  playHitSound() {
    this.init();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);

    gain.gain.setValueAtTime(0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(time);
    osc.stop(time + 0.18);
  }

  // Boss Warning Siren
  playBossAlarmSound() {
    this.init();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sine';

    // Discordant dual siren tones
    osc1.frequency.setValueAtTime(330, time);
    osc1.frequency.linearRampToValueAtTime(392, time + 0.25);
    osc1.frequency.linearRampToValueAtTime(330, time + 0.5);

    osc2.frequency.setValueAtTime(333, time);
    osc2.frequency.linearRampToValueAtTime(395, time + 0.25);
    osc2.frequency.linearRampToValueAtTime(333, time + 0.5);

    gain.gain.setValueAtTime(0.2, time);
    gain.gain.linearRampToValueAtTime(0.2, time + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(time);
    osc2.start(time);
    
    osc1.stop(time + 0.5);
    osc2.stop(time + 0.5);
  }

  // Shop item purchase chime
  playUpgradeSound() {
    this.init();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25]; // C major arpeggio
    
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time + idx * 0.06);
      
      gain.gain.setValueAtTime(0.15, time + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, time + idx * 0.06 + 0.2);
      
      osc.connect(gain);
      gain.connect(this.sfxGain);
      
      osc.start(time + idx * 0.06);
      osc.stop(time + idx * 0.06 + 0.2);
    });
  }

  // Powerup collector chime
  playPowerupSound() {
    this.init();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, time);
    osc.frequency.exponentialRampToValueAtTime(1760, time + 0.35); // Sweeping up

    gain.gain.setValueAtTime(0.18, time);
    gain.gain.linearRampToValueAtTime(0.18, time + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = 1000;
    filter.Q.value = 4.0;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(time);
    osc.stop(time + 0.35);
  }

  // Educational Correct Answer sound (Uplifting rapid major scale arpeggio)
  playCorrectSound() {
    this.init();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25]; // C major scale chord C-E-G-C-E
    
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time + idx * 0.05);
      
      gain.gain.setValueAtTime(0.15, time + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, time + idx * 0.05 + 0.18);
      
      osc.connect(gain);
      gain.connect(this.sfxGain);
      
      osc.start(time + idx * 0.05);
      osc.stop(time + idx * 0.05 + 0.2);
    });
  }

  // Educational Incorrect Answer sound (Low warning buzzer sweep)
  playWrongSound() {
    this.init();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    
    osc1.frequency.setValueAtTime(130, time);
    osc1.frequency.linearRampToValueAtTime(60, time + 0.35);

    osc2.frequency.setValueAtTime(132, time);
    osc2.frequency.linearRampToValueAtTime(61, time + 0.35);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, time);
    filter.Q.value = 3.0;

    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.38);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.38);
    osc2.stop(time + 0.38);
  }

  // --- PROCEDURAL SYNTHWAVE MUSIC SEQUENCER ---

  startMusic() {
    this.init();
    this.resumeContext();
    if (!this.ctx || this.isPlayingMusic) return;

    this.isPlayingMusic = true;
    this.step = 0;
    this.currentChordIdx = 0;
    
    // Calculate interval in ms based on 8th notes (2 steps per beat)
    const intervalMs = (60 / this.tempo / 2) * 1000;
    
    this.musicIntervalId = setInterval(() => {
      this.playMusicStep();
    }, intervalMs);
  }

  stopMusic() {
    if (this.musicIntervalId) {
      clearInterval(this.musicIntervalId);
      this.musicIntervalId = null;
    }
    this.isPlayingMusic = false;
  }

  setUrgency(urgent = false) {
    if (this.urgencyMode === urgent) return;
    this.urgencyMode = urgent;
    
    // Speed up tempo during bosses depending on selected track style
    if (this.activeTrack === 'synthwave') {
      this.tempo = urgent ? 135 : 110;
    } else if (this.activeTrack === 'retro') {
      this.tempo = urgent ? 115 : 90;
    } else {
      this.tempo = 70; // Ambient remains slow and focused
    }
    
    if (this.isPlayingMusic) {
      this.stopMusic();
      this.startMusic();
    }
  }

  midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  playMusicStep() {
    if (!this.ctx || this.ctx.state === 'suspended') return;

    const time = this.ctx.currentTime;
    const stepInMeasure = this.step % 16;
    
    // Every 16 steps, move to the next chord in our progression
    if (stepInMeasure === 0) {
      this.currentChordIdx = (this.currentChordIdx + 1) % this.chordProgression.length;
    }

    const chord = this.chordProgression[this.currentChordIdx];
    const rootMidi = chord[0] - 12;

    // --- TRACK STYLE 1: SYNTHWAVE (AGGRESSIVE) ---
    if (this.activeTrack === 'synthwave') {
      const playBass = () => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        osc.type = 'sawtooth';
        const octaveOffset = (stepInMeasure % 2 === 0) ? 0 : 12;
        const noteFreq = this.midiToFreq(rootMidi + octaveOffset);
        osc.frequency.setValueAtTime(noteFreq, time);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, time);
        filter.frequency.exponentialRampToValueAtTime(120, time + 0.18);
        filter.Q.value = 2.0;
        gain.gain.setValueAtTime(0.2, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + 0.22);
      };

      playBass();

      // Kick & Snare
      if (stepInMeasure === 0 || stepInMeasure === 8) {
        const kickOsc = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(150, time);
        kickOsc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
        kickGain.gain.setValueAtTime(0.4, time);
        kickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
        kickOsc.connect(kickGain);
        kickGain.connect(this.musicGain);
        kickOsc.start(time);
        kickOsc.stop(time + 0.15);
      }
      if (stepInMeasure === 4 || stepInMeasure === 12) {
        const snDuration = 0.15;
        const snBufferSize = this.ctx.sampleRate * snDuration;
        const snBuffer = this.ctx.createBuffer(1, snBufferSize, this.ctx.sampleRate);
        const snData = snBuffer.getChannelData(0);
        for (let i = 0; i < snBufferSize; i++) snData[i] = Math.random() * 2 - 1;
        const snareSrc = this.ctx.createBufferSource();
        snareSrc.buffer = snBuffer;
        const snareFilter = this.ctx.createBiquadFilter();
        snareFilter.type = 'bandpass';
        snareFilter.frequency.value = 1000;
        const snareGain = this.ctx.createGain();
        snareGain.gain.setValueAtTime(0.12, time);
        snareGain.gain.exponentialRampToValueAtTime(0.001, time + snDuration);
        snareSrc.connect(snareFilter);
        snareFilter.connect(snareGain);
        snareGain.connect(this.musicGain);
        snareSrc.start(time);
        snareSrc.stop(time + snDuration);
      }

      // Melody
      const playMelodyNote = (midiNote) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const delay = this.ctx.createDelay();
        const delayGain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(this.midiToFreq(midiNote), time);
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1000, time);
        gain.gain.setValueAtTime(0.07, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
        delay.delayTime.value = 0.18;
        delayGain.gain.value = 0.3;
        osc.connect(lp);
        lp.connect(gain);
        gain.connect(delay);
        delay.connect(delayGain);
        delayGain.connect(this.musicGain);
        gain.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + 0.3);
      };

      const arpSteps = [0, 4, 8, 12, 2, 6, 10, 14];
      if (arpSteps.includes(stepInMeasure)) {
        let noteIdx = 0;
        if (stepInMeasure === 4 || stepInMeasure === 6) noteIdx = 1;
        if (stepInMeasure === 8 || stepInMeasure === 10) noteIdx = 2;
        if (stepInMeasure === 12 || stepInMeasure === 14) noteIdx = 1;
        let note = chord[noteIdx] + 12;
        if (this.urgencyMode && stepInMeasure % 4 === 2) note += 7;
        playMelodyNote(note);
      }
    }
    // --- TRACK STYLE 2: RETRO KOSMO-BIT (MEDIUM CHIP) ---
    else if (this.activeTrack === 'retro') {
      const playRetroBass = () => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        // Walking intervals
        let noteOffset = 0;
        if (stepInMeasure % 4 === 1) noteOffset = 7; // fifth
        else if (stepInMeasure % 4 === 2) noteOffset = 12; // octave
        else if (stepInMeasure % 4 === 3) noteOffset = 7;
        const noteFreq = this.midiToFreq(rootMidi + noteOffset);
        osc.frequency.setValueAtTime(noteFreq, time);
        gain.gain.setValueAtTime(0.22, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + 0.25);
      };

      if (stepInMeasure % 2 === 0) playRetroBass();

      // Soft Kick
      if (stepInMeasure === 0 || stepInMeasure === 8) {
        const kickOsc = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(100, time);
        kickOsc.frequency.exponentialRampToValueAtTime(40, time + 0.1);
        kickGain.gain.setValueAtTime(0.3, time);
        kickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
        kickOsc.connect(kickGain);
        kickGain.connect(this.musicGain);
        kickOsc.start(time);
        kickOsc.stop(time + 0.12);
      }

      // Chiptune lead
      if (stepInMeasure % 4 === 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        const noteIdx = (stepInMeasure / 4) % 3;
        const note = chord[noteIdx] + 12;
        osc.frequency.setValueAtTime(this.midiToFreq(note), time);
        gain.gain.setValueAtTime(0.08, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + 0.4);
      }
    }
    // --- TRACK STYLE 3: CYBER AMBIENT (FOCUS/STUDY) ---
    else {
      // Soft Sinewave Drone Pad on Chord shift
      if (stepInMeasure === 0) {
        chord.forEach(note => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const filter = this.ctx.createBiquadFilter();
          osc.type = 'sine';
          // Octave 3 for pads
          osc.frequency.setValueAtTime(this.midiToFreq(note - 12), time);
          filter.type = 'lowpass';
          filter.frequency.value = 500;
          gain.gain.setValueAtTime(0.08, time);
          gain.gain.exponentialRampToValueAtTime(0.001, time + 2.0); // very long decay
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.musicGain);
          osc.start(time);
          osc.stop(time + 2.2);
        });
      }

      // Slow Ambient Melody notes (Sine wave, very quiet)
      if (stepInMeasure === 2 || stepInMeasure === 10) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        const note = chord[1] + 12; // Middle note
        osc.frequency.setValueAtTime(this.midiToFreq(note), time);
        gain.gain.setValueAtTime(0.06, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.6);
        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + 0.6);
      }
    }

    this.step++;
  }
}

// Instantiate global audio object
const gameAudio = new AudioEngine();
