import React, { useEffect, useRef } from 'react';
import { useRoom } from '../../context/RoomContext.jsx';

export const MAX_PARTICLES = 50;

/**
 * Flyweight Particle Structure (pre-allocated pool, zero allocations during animation)
 */
export class ReactionParticle {
  constructor(id) {
    this.id = id;
    this.active = false;
    this.emoji = '🔥';
    this.avatar = '🦊';
    this.senderName = '';
    this.x = 0;
    this.y = 0;
    this.currentX = 0;
    this.vx = 0;
    this.vy = 0;
    this.amplitude = 0;
    this.frequency = 0;
    this.phase = 0;
    this.scale = 1;
    this.opacity = 1;
    this.birthTime = 0;
    this.lifespan = 2400; // ms
  }

  spawn(emoji, avatar, senderName, startX, startY, now) {
    this.active = true;
    this.emoji = emoji;
    this.avatar = avatar;
    this.senderName = senderName;
    this.x = startX;
    this.y = startY;
    this.currentX = startX;
    this.vx = (Math.random() - 0.5) * 0.4;
    this.vy = -(180 + Math.random() * 80); // Upward velocity (px/sec)
    this.amplitude = 16 + Math.random() * 14;
    this.frequency = 2.5 + Math.random() * 1.5;
    this.phase = Math.random() * Math.PI * 2;
    this.scale = 0.3;
    this.opacity = 0;
    this.birthTime = now;
    this.lifespan = 2200 + Math.random() * 400;
  }

  update(now, deltaSec, canvasHeight) {
    if (!this.active) return false;

    const age = now - this.birthTime;
    if (age >= this.lifespan) {
      this.active = false;
      return false;
    }

    const progress = age / this.lifespan;

    // Upward drift + Sinusoidal wobble
    this.y += this.vy * deltaSec;
    const wobble = Math.sin((age / 1000) * this.frequency + this.phase) * this.amplitude;
    this.currentX = this.x + wobble;

    // Scale & Opacity keyframe curve
    if (progress < 0.08) {
      const t = progress / 0.08;
      this.scale = 0.3 + 0.95 * t;
      this.opacity = t;
    } else if (progress < 0.75) {
      this.scale = 1.25 - 0.25 * ((progress - 0.08) / 0.67);
      this.opacity = 1.0;
    } else {
      const t = (progress - 0.75) / 0.25;
      this.scale = 1.0 - 0.35 * t;
      this.opacity = Math.max(0, 1.0 - t);
    }

    return true;
  }

  render(ctx) {
    if (!this.active || this.opacity <= 0) return;

    ctx.save();
    ctx.translate(this.currentX, this.y);
    ctx.scale(this.scale, this.scale);
    ctx.globalAlpha = this.opacity;

    // Render 3D emoji
    ctx.font = '36px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.emoji, 0, 0);

    // Contributor badge pill (if sender is attached)
    if (this.senderName) {
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const badgeText = `${this.avatar ? `${this.avatar} ` : ''}${this.senderName}`;
      const textWidth = ctx.measureText(badgeText).width;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-textWidth / 2 - 8, 22, textWidth + 16, 18, 9);
      } else {
        ctx.rect(-textWidth / 2 - 8, 22, textWidth + 16, 18);
      }
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(badgeText, 0, 31);
    }

    ctx.restore();
  }
}

/**
 * Floating Reaction Canvas Overlay
 * Implements a 50-slot flyweight particle pool with sleeping rAF loop.
 */
export function FloatingReactionCanvas() {
  const canvasRef = useRef(null);
  const poolRef = useRef([]);
  const animFrameIdRef = useRef(null);
  const isRunningRef = useRef(false);
  const lastTimeRef = useRef(0);

  // Initialize fixed particle pool once (Flyweight Pattern)
  useEffect(() => {
    poolRef.current = Array.from({ length: MAX_PARTICLES }, (_, i) => new ReactionParticle(i));
    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      poolRef.current = [];
    };
  }, []);

  const renderLoop = (timestamp) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      isRunningRef.current = false;
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      isRunningRef.current = false;
      return;
    }

    const deltaSec = Math.min(0.1, (timestamp - lastTimeRef.current) / 1000);
    lastTimeRef.current = timestamp;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let activeCount = 0;
    const pool = poolRef.current;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (p.active) {
        if (p.update(timestamp, deltaSec, canvas.height)) {
          p.render(ctx);
          activeCount++;
        }
      }
    }

    if (activeCount > 0) {
      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    } else {
      // Put render loop to sleep when idle (0% CPU overhead)
      isRunningRef.current = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const spawnFromPool = (emoji, avatar = '', senderName = '') => {
    const pool = poolRef.current;
    if (!pool || pool.length === 0) return;

    const freeParticle = pool.find((p) => !p.active);
    if (!freeParticle) return; // Pool saturated: cleanly drop excess

    const canvas = canvasRef.current;
    if (!canvas) return;

    const startX = canvas.width * (0.2 + Math.random() * 0.6);
    const startY = canvas.height * 0.82;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    freeParticle.spawn(emoji, avatar, senderName, startX, startY, now);

    // Wake render loop if sleeping
    if (!isRunningRef.current) {
      isRunningRef.current = true;
      lastTimeRef.current = now;
      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    }
  };

  // Resize canvas to match screen resolution with DPR support
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const width = typeof window !== 'undefined' ? window.innerWidth : 400;
      const height = typeof window !== 'undefined' ? window.innerHeight : 800;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Listen to coalesced batches from RoomContext
  const { lastReactionBatch, localReactionEvent } = useRoom();

  // Handle incoming batched reactions from peers with micro-burst stagger
  useEffect(() => {
    if (!lastReactionBatch?.counts) return;

    const { counts, contributors = [] } = lastReactionBatch;
    let delay = 0;
    const timeouts = [];

    for (const [emoji, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i++) {
        const contributor = contributors.find((c) => c.emoji === emoji);
        const t = setTimeout(() => {
          spawnFromPool(
            emoji,
            contributor?.avatar || '',
            contributor?.name || ''
          );
        }, delay);
        timeouts.push(t);
        delay += 35 + Math.random() * 25; // 35-60ms stagger jitter prevents particle overlap
      }
    }

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [lastReactionBatch]);

  // Handle immediate local reaction from current user
  useEffect(() => {
    if (!localReactionEvent?.emoji) return;
    spawnFromPool(
      localReactionEvent.emoji,
      localReactionEvent.avatar || '🦊',
      'You'
    );
  }, [localReactionEvent]);

  return (
    <canvas
      ref={canvasRef}
      className="reaction-canvas-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
      aria-hidden="true"
    />
  );
}

export default FloatingReactionCanvas;
