import confetti from 'canvas-confetti';

/**
 * Fires a multi-stage high-energy celebratory confetti sequence.
 * Safe for SSR and headless test environments.
 */
export function fireCelebrationConfetti() {
  if (typeof window === 'undefined') return;

  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
    zIndex: 10000,
    disableForReducedMotion: true,
  };

  function fire(particleRatio, opts) {
    try {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
      });
    } catch {
      // Graceful fallback if canvas is unavailable or mocked
    }
  }

  // Phase 1: Center blast with colorful pellets
  fire(0.25, {
    spread: 26,
    startVelocity: 55,
    colors: ['#FF5A5F', '#8B5CF6', '#F59E0B', '#10B981'],
  });

  fire(0.2, {
    spread: 60,
    colors: ['#FF5A5F', '#FFFFFF', '#F59E0B'],
  });

  // Phase 2: Wide fan blast
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
    colors: ['#8B5CF6', '#10B981', '#3B82F6'],
  });

  // Phase 3: High-velocity streamers
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
  });

  fire(0.1, {
    spread: 120,
    startVelocity: 45,
  });

  // Phase 4: Staggered side cannons (left and right edges firing inward)
  const duration = 2000;
  const animationEnd = Date.now() + duration;

  const interval = setInterval(() => {
    const timeLeft = animationEnd - Date.now();
    if (timeLeft <= 0) {
      return clearInterval(interval);
    }
    const particleMultiplier = Math.max(0, timeLeft / duration);

    try {
      confetti({
        particleCount: Math.floor(30 * particleMultiplier),
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.65 },
        zIndex: 10000,
        colors: ['#FF5A5F', '#F59E0B', '#10B981'],
      });
      confetti({
        particleCount: Math.floor(30 * particleMultiplier),
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.65 },
        zIndex: 10000,
        colors: ['#8B5CF6', '#3B82F6', '#FF5A5F'],
      });
    } catch {
      clearInterval(interval);
    }
  }, 250);
}

/**
 * Plays a cheerful celebratory arpeggio chime using the native Web Audio API.
 * Zero-dependency, zero network latency, completely offline.
 */
export function playMatchChime() {
  if (typeof window === 'undefined') return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Notes: C5 (523.25Hz) -> E5 (659.25Hz) -> G5 (783.99Hz) -> C6 (1046.50Hz)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);

      gain.gain.setValueAtTime(0, now + idx * 0.1);
      gain.gain.linearRampToValueAtTime(0.22, now + idx * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.45);
    });
  } catch {
    // Graceful fallback if audio is blocked or headless
  }
}
