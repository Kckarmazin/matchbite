import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useRoom } from '../../context/RoomContext.jsx';
import * as api from '../../utils/api.js';
import { Sparkles, Trophy, RotateCcw, ArrowLeft, Volume2, VolumeX } from 'lucide-react';

const WEDGE_COLORS = [
  '#FF5A5F', // Coral Red
  '#8B5CF6', // Purple
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#3B82F6', // Blue
  '#14B8A6', // Teal
  '#F97316', // Orange
];

export function RouletteWheel({ onBackToLeaderboard, onWinnerRevealed }) {
  const {
    room,
    participant,
    activeTiebreakerSpin,
    spinTiebreaker,
    restartRoom,
    showToast,
  } = useRoom();

  const canvasRef = useRef(null);
  const [candidates, setCandidates] = useState([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const currentAngleRef = useRef(0);
  const animFrameIdRef = useRef(null);
  const lastTickWedgeRef = useRef(-1);
  const audioCtxRef = useRef(null);

  const isHost = Boolean(participant?.isHost);

  // Play synthetic Web Audio API click/tick sound
  const playTick = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass();
        }
      }
      const ctx = audioCtxRef.current;
      if (!ctx || ctx.state === 'suspended') {
        if (ctx?.resume) ctx.resume().catch(() => {});
      }
      if (ctx) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(580, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.025);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.03);
      }
    } catch {
      // Audio context blocked or unsupported
    }
  }, [soundEnabled]);

  // Load candidates on mount
  useEffect(() => {
    let isMounted = true;
    const loadCandidates = async () => {
      if (!room?.code) return;
      try {
        const res = await api.getTiebreakerCandidates(room.code, 6);
        if (isMounted && res.candidates && res.candidates.length > 0) {
          const venues = res.candidates.map((c) => c.venue || c);
          setCandidates(venues);
        } else if (isMounted && room.deck && room.deck.length > 0) {
          setCandidates(room.deck.slice(0, 6));
        }
      } catch (err) {
        if (isMounted && room.deck && room.deck.length > 0) {
          setCandidates(room.deck.slice(0, 6));
        }
      }
    };

    loadCandidates();
    return () => {
      isMounted = false;
    };
  }, [room?.code, room?.deck]);

  // Canvas drawing routine
  const drawWheel = useCallback((angle) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 320;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 18;

    const numWedges = Math.max(1, candidates.length);
    const wedgeAngle = (2 * Math.PI) / numWedges;

    // Draw Wheel Wedges
    for (let i = 0; i < numWedges; i++) {
      const startAngle = angle + i * wedgeAngle;
      const endAngle = startAngle + wedgeAngle;
      const venue = candidates[i] || { name: `Option ${i + 1}` };
      const color = WEDGE_COLORS[i % WEDGE_COLORS.length];

      // Wedge background
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      // Wedge border
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();

      // Text label inside wedge
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(startAngle + wedgeAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 4;

      const maxLabelLen = numWedges > 4 ? 14 : 20;
      let label = venue.name || 'Venue';
      if (label.length > maxLabelLen) {
        label = label.slice(0, maxLabelLen - 1) + '…';
      }

      ctx.fillText(label, radius - 20, 4);
      ctx.restore();
    }

    // Outer wheel rim shadow
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.stroke();

    // Center Hub
    ctx.beginPath();
    ctx.arc(centerX, centerY, 24, 0, 2 * Math.PI);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'var(--text-main, #0F172A)';
    ctx.stroke();

    // Center icon
    ctx.fillStyle = 'var(--primary, #FF5A5F)';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🍽️', centerX, centerY);

    // Top Pointer Arrow pointing down into wheel
    ctx.save();
    ctx.translate(centerX, centerY - radius);
    ctx.beginPath();
    ctx.moveTo(-12, -14);
    ctx.lineTo(12, -14);
    ctx.lineTo(0, 8);
    ctx.closePath();
    ctx.fillStyle = '#0F172A';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }, [candidates]);

  // Initial draw and redraw when candidates change
  useEffect(() => {
    drawWheel(currentAngleRef.current);
  }, [drawWheel]);

  // Spin animation function
  const animateSpin = useCallback((targetAngleRad, durationMs, onFinished) => {
    const startAngle = currentAngleRef.current;
    const deltaAngle = targetAngleRad;
    const startTime = performance.now();
    lastTickWedgeRef.current = -1;

    const numWedges = Math.max(1, candidates.length);
    const wedgeAngle = (2 * Math.PI) / numWedges;

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);

      // Cubic Ease-Out
      const ease = 1 - Math.pow(1 - progress, 3);
      const angle = startAngle + deltaAngle * ease;
      currentAngleRef.current = angle;

      // Pointer tick calculation (pointer is at -Math.PI / 2)
      const pointerAngle = (3 * Math.PI / 2 - (angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const currentWedgeIdx = Math.floor(pointerAngle / wedgeAngle);
      if (currentWedgeIdx !== lastTickWedgeRef.current) {
        lastTickWedgeRef.current = currentWedgeIdx;
        playTick();
      }

      drawWheel(angle);

      if (progress < 1) {
        animFrameIdRef.current = requestAnimationFrame(tick);
      } else {
        setIsSpinning(false);
        if (onFinished) onFinished();
      }
    };

    setIsSpinning(true);
    animFrameIdRef.current = requestAnimationFrame(tick);
  }, [candidates.length, drawWheel, playTick]);

  // Handle incoming spin event from SSE / server
  useEffect(() => {
    if (activeTiebreakerSpin && !isSpinning) {
      const spin = activeTiebreakerSpin;
      const winningIdx = spin.winningIndex >= 0 ? spin.winningIndex : 0;
      const numWedges = Math.max(1, candidates.length);
      const wedgeAngle = (2 * Math.PI) / numWedges;

      // Target angle so pointer at top (3π/2) aligns with winningIndex
      const targetCenter = (winningIdx + 0.5) * wedgeAngle;
      const fullRotations = 6 * 2 * Math.PI;
      const targetRad = fullRotations + ((3 * Math.PI / 2) - targetCenter);

      animateSpin(targetRad, spin.durationMs || 3800, () => {
        const winningVenue = spin.winningVenue || candidates[winningIdx];
        setWinner(winningVenue);
        if (onWinnerRevealed) {
          onWinnerRevealed(winningVenue);
        }
      });
    }
  }, [activeTiebreakerSpin, candidates, animateSpin, onWinnerRevealed]);

  // Trigger Host Spin
  const handleHostSpin = async () => {
    if (!isHost || isSpinning) return;
    try {
      setIsSpinning(true);
      const candidateIds = candidates.map((c) => c.id);
      const res = await spinTiebreaker({
        candidateVenueIds: candidateIds,
        durationMs: 3800,
      });

      if (!res.success) {
        setIsSpinning(false);
      }
    } catch (err) {
      setIsSpinning(false);
      console.error('Spin failed:', err);
    }
  };

  return (
    <div className="roulette-wheel-container text-center">
      {/* Header */}
      <div className="wheel-header" style={{ marginBottom: '16px' }}>
        <div className="match-banner-pill" style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)' }}>
          <Sparkles size={16} />
          <span>Decision Roulette</span>
        </div>
        <h1 className="card-title" style={{ fontSize: '1.6rem', marginTop: '6px' }}>
          Wheel of Destiny
        </h1>
        <p className="card-subtitle">
          {candidates.length} top mutual contenders on the wheel.
        </p>
      </div>

      {/* Wheel Canvas Container */}
      <div
        className="wheel-canvas-wrap"
        style={{
          position: 'relative',
          width: '320px',
          height: '320px',
          margin: '0 auto 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '320px',
            height: '320px',
            display: 'block',
          }}
        />

        {/* Audio Mute/Unmute Pill */}
        <button
          type="button"
          onClick={() => setSoundEnabled((prev) => !prev)}
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            background: 'rgba(255, 255, 255, 0.9)',
            border: '1px solid var(--border)',
            borderRadius: '9999px',
            padding: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            boxShadow: 'var(--shadow-sm)',
          }}
          title={soundEnabled ? 'Mute wheel sound' : 'Enable wheel sound'}
        >
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
      </div>

      {/* Outcome Showcase if Winner Declared */}
      {winner && !isSpinning && (
        <div
          className="winner-announcement-card"
          style={{
            background: '#FEF3C7',
            border: '2px solid #F59E0B',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            marginBottom: '20px',
            animation: 'fadeIn 0.4s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#B45309', fontWeight: 800 }}>
            <Trophy size={20} />
            <span>Roulette Winner Decided!</span>
          </div>
          <h3 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '6px 0 2px' }}>
            {winner.name}
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#78350F' }}>
            {winner.cuisine} • {'$'.repeat(winner.priceTier || 2)} • {winner.distance}
          </p>
        </div>
      )}

      {/* Host Controls or Participant Waiting Message */}
      <div className="wheel-controls" style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '340px', margin: '0 auto' }}>
        {isHost ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: '1.05rem', fontWeight: 800 }}
            onClick={handleHostSpin}
            disabled={isSpinning || candidates.length === 0}
          >
            {isSpinning ? 'Wheel is Spinning... 🎡' : 'SPIN THE WHEEL 🎡'}
          </button>
        ) : (
          <div className="card text-center" style={{ padding: '14px', background: 'var(--surface-muted)' }}>
            <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-muted)' }}>
              {isSpinning ? '🎡 Wheel is spinning live!' : 'Waiting for host to spin the wheel...'}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-outline"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            onClick={onBackToLeaderboard}
            disabled={isSpinning}
          >
            <ArrowLeft size={16} />
            <span>Leaderboard</span>
          </button>

          {isHost && (
            <button
              type="button"
              className="btn btn-outline"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              onClick={() => restartRoom({ reshuffleDeck: false })}
              disabled={isSpinning}
            >
              <RotateCcw size={16} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default RouletteWheel;
