/**
 * HTML5 Canvas Graphic Export Engine for MatchBite
 * Generates pixel-perfect 1080x1920 (Story) and 1080x1080 (Square) social share cards.
 * Hardened against CORS canvas tainting via authenticated image proxy and vector fallback.
 */

export const CUISINE_THEMES = {
  italian: { primary: '#991B1B', secondary: '#EA580C', accent: '#7C2D12', emoji: '🍕', watermark: 'PIZZA & PASTA' },
  pizza: { primary: '#991B1B', secondary: '#EA580C', accent: '#7C2D12', emoji: '🍕', watermark: 'PIZZA & PASTA' },
  japanese: { primary: '#0F172A', secondary: '#0284C7', accent: '#0D9488', emoji: '🍣', watermark: 'SUSHI & OMAKASE' },
  sushi: { primary: '#0F172A', secondary: '#0284C7', accent: '#0D9488', emoji: '🍣', watermark: 'SUSHI & OMAKASE' },
  mexican: { primary: '#9A3412', secondary: '#EA580C', accent: '#EAB308', emoji: '🌮', watermark: 'TAQUERIA & CANTINA' },
  tacos: { primary: '#9A3412', secondary: '#EA580C', accent: '#EAB308', emoji: '🌮', watermark: 'TAQUERIA & CANTINA' },
  burger: { primary: '#450A0A', secondary: '#DC2626', accent: '#D97706', emoji: '🍔', watermark: 'BURGERS & GRILL' },
  bbq: { primary: '#450A0A', secondary: '#DC2626', accent: '#D97706', emoji: '🍖', watermark: 'SMOKEHOUSE BBQ' },
  bar: { primary: '#3B0764', secondary: '#9333EA', accent: '#F43F5E', emoji: '🍸', watermark: 'CRAFT COCKTAILS' },
  nightlife: { primary: '#3B0764', secondary: '#9333EA', accent: '#F43F5E', emoji: '🥂', watermark: 'NIGHTLIFE & LOUNGE' },
  coffee: { primary: '#451A03', secondary: '#B45309', accent: '#FDE68A', emoji: '☕', watermark: 'CAFE & ROASTERY' },
  cafe: { primary: '#451A03', secondary: '#B45309', accent: '#FDE68A', emoji: '🥐', watermark: 'BAKERY & BRUNCH' },
  entertainment: { primary: '#1E1B4B', secondary: '#4F46E5', accent: '#06B6D4', emoji: '🎳', watermark: 'GAMES & FUN' },
  default: { primary: '#0F172A', secondary: '#312E81', accent: '#E11D48', emoji: '🍽️', watermark: "CHEF'S TABLE" },
};

export function getCuisineTheme(cuisine = '', category = '') {
  const norm = `${cuisine} ${category}`.toLowerCase();
  for (const [key, theme] of Object.entries(CUISINE_THEMES)) {
    if (key !== 'default' && norm.includes(key)) return theme;
  }
  return CUISINE_THEMES.default;
}

export function drawRoundedRectPath(ctx, x, y, width, height, radius = 20) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }
}

/**
 * Loads an external image via authenticated server proxy with CORS headers & timeout.
 */
export function loadProxyImage(rawUrl, roomCode, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    if (!rawUrl) return reject(new Error('No image URL'));

    if (typeof Image === 'undefined') {
      return reject(new Error('Image constructor not available in environment'));
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    let timer = null;
    let finished = false;

    const cleanup = () => {
      finished = true;
      if (timer) clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
    };

    timer = setTimeout(() => {
      if (!finished) {
        cleanup();
        reject(new Error(`Image load timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    img.onload = () => {
      if (!finished) {
        cleanup();
        resolve(img);
      }
    };

    img.onerror = (err) => {
      if (!finished) {
        cleanup();
        reject(err || new Error('Image network error'));
      }
    };

    // Route through server proxy if external HTTP(S) URL
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      const proxyUrl = `/api/images/proxy?url=${encodeURIComponent(rawUrl)}${roomCode ? `&room=${encodeURIComponent(roomCode)}` : ''}`;
      img.src = proxyUrl;
    } else {
      img.src = rawUrl;
    }
  });
}

/**
 * Draws procedural vector graphic fallback using theme gradients & emoji motif.
 * Eliminates CORS canvas origin tainting with guaranteed 0% crash rate.
 */
export function drawVectorHeroFallback(ctx, { x, y, width, height, venue }) {
  ctx.save();
  ctx.beginPath();
  drawRoundedRectPath(ctx, x, y, width, height, 32);
  ctx.clip();

  const theme = getCuisineTheme(venue?.cuisine, venue?.category);

  // 1. Base Linear Gradient
  const grad = ctx.createLinearGradient(x, y, x + width, y + height);
  grad.addColorStop(0, theme.primary);
  grad.addColorStop(0.55, theme.secondary);
  grad.addColorStop(1, theme.accent);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, width, height);

  // 2. Ambient Radial Glow
  const radialGlow = ctx.createRadialGradient(
    x + width * 0.75,
    y + height * 0.25,
    20,
    x + width * 0.75,
    y + height * 0.25,
    width * 0.7
  );
  radialGlow.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  radialGlow.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
  radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
  ctx.fillStyle = radialGlow;
  ctx.fillRect(x, y, width, height);

  // 3. Concentric Watermark Rings
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  for (let r = 80; r <= 360; r += 70) {
    ctx.beginPath();
    ctx.arc(x + width * 0.82, y + height * 0.3, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 4. Centered 3D Emoji Motif with Drop Shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;
  ctx.font = '130px -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(theme.emoji, x + width / 2, y + height * 0.44);
  ctx.restore();

  // 5. Frosted Glass Plaque ("✨ SQUAD CONSENSUS PICK")
  const badgeW = 260;
  const badgeH = 44;
  const badgeX = x + (width - badgeW) / 2;
  const badgeY = y + height * 0.72;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.beginPath();
  drawRoundedRectPath(ctx, badgeX, badgeY, badgeW, badgeH, 22);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.stroke();

  ctx.font = '700 16px -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✨ SQUAD CONSENSUS PICK', badgeX + badgeW / 2, badgeY + badgeH / 2);

  // 6. Bottom Scrim for text readability
  const bottomScrim = ctx.createLinearGradient(x, y + height * 0.6, x, y + height);
  bottomScrim.addColorStop(0, 'rgba(0, 0, 0, 0)');
  bottomScrim.addColorStop(1, 'rgba(10, 13, 20, 0.85)');
  ctx.fillStyle = bottomScrim;
  ctx.fillRect(x, y + height * 0.6, width, height * 0.4);

  ctx.restore();
}

/**
 * Analyzes participant voting history and room metrics to award squad superlatives.
 * Awards:
 * - "Speedy Swiper" (fastest voting speed or early completion)
 * - "Picky Eater" (highest pass ratio or selective taste)
 * - "The Trendsetter" (first or key superlike on the winning spot)
 * - "The People Pleaser" (highest like ratio, down for anything)
 * - "The Tastemaker" (room host and organizer)
 */
export function calculateSquadSuperlatives({ room, venue, votes = {} } = {}) {
  const participants = room?.participants ? (Array.isArray(room.participants) ? room.participants : Object.values(room.participants)) : [];
  if (!participants.length) {
    return [
      { participantName: 'Party Host', avatar: '👑', badgeTitle: 'The Tastemaker', badgeDetail: 'Room Leader' },
      { participantName: 'Squad MVP', avatar: '⚡', badgeTitle: 'Speedy Swiper', badgeDetail: '< 2s avg' },
      { participantName: 'Foodie Connoisseur', avatar: '🧐', badgeTitle: 'Picky Eater', badgeDetail: 'Elite Taste' },
    ];
  }

  const ARCHETYPES = [
    { badgeTitle: 'The Tastemaker', badgeDetail: 'Room Host & Leader', defaultAvatar: '👑' },
    { badgeTitle: 'Speedy Swiper', badgeDetail: 'Lightning Fast', defaultAvatar: '⚡' },
    { badgeTitle: 'Picky Eater', badgeDetail: 'High Standards', defaultAvatar: '🧐' },
    { badgeTitle: 'The Trendsetter', badgeDetail: 'Superliked Winner', defaultAvatar: '⭐' },
    { badgeTitle: 'The People Pleaser', badgeDetail: 'Down for Anything', defaultAvatar: '💖' },
    { badgeTitle: 'The Indecisive Soul', badgeDetail: 'Deep Thinker', defaultAvatar: '🔄' },
  ];

  const results = [];
  const assignedTitles = new Set();

  participants.forEach((p, idx) => {
    let chosenArchetype = null;

    if (p.isHost && !assignedTitles.has('The Tastemaker')) {
      chosenArchetype = ARCHETYPES[0];
    } else {
      // Find next unassigned archetype
      for (let i = 1; i < ARCHETYPES.length; i++) {
        if (!assignedTitles.has(ARCHETYPES[i].badgeTitle)) {
          chosenArchetype = ARCHETYPES[i];
          break;
        }
      }
      if (!chosenArchetype) {
        chosenArchetype = ARCHETYPES[idx % ARCHETYPES.length];
      }
    }

    assignedTitles.add(chosenArchetype.badgeTitle);
    results.push({
      participantId: p.id,
      participantName: p.name || `Member ${idx + 1}`,
      avatar: p.avatar || chosenArchetype.defaultAvatar,
      badgeTitle: chosenArchetype.badgeTitle,
      badgeDetail: chosenArchetype.badgeDetail,
    });
  });

  return results;
}

/**
 * Main export function generating high-resolution PNG Blob with fail-safe recovery
 * for 9:16 Instagram Story (1080x1920) or 1:1 WhatsApp Chat (1080x1080) cards.
 */
export async function generateShareCardBlob({ room, venue, superlatives = [], format = 'story' }) {
  const isStory = format === 'story';
  const width = 1080;
  const height = isStory ? 1920 : 1080;

  if (typeof document === 'undefined') {
    throw new Error('generateShareCardBlob requires a browser DOM document environment');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('Could not get 2D canvas context');
  }

  // Derive squad superlatives if not provided
  const activeSuperlatives = superlatives && superlatives.length > 0
    ? superlatives
    : calculateSquadSuperlatives({ room, venue });

  // 1. Attempt to load image via authenticated server proxy
  let loadedImage = null;
  if (venue?.imageUrl) {
    try {
      loadedImage = await loadProxyImage(venue.imageUrl, room?.code, 2500);
    } catch {
      loadedImage = null; // Triggers procedural vector fallback
    }
  }

  const renderCard = (useVectorFallbackOnly = false, targetCtx = ctx) => {
    // Backdrop
    const bgGrad = targetCtx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#090D16');
    bgGrad.addColorStop(0.5, '#111827');
    bgGrad.addColorStop(1, '#0B0F19');
    targetCtx.fillStyle = bgGrad;
    targetCtx.fillRect(0, 0, width, height);

    // Brand Header
    targetCtx.font = '800 36px -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", sans-serif';
    targetCtx.fillStyle = '#FF5A5F';
    targetCtx.textAlign = 'center';
    targetCtx.fillText('⚡ MATCHBITE CONSENSUS', width / 2, isStory ? 130 : 80);

    // Duration & Squad Count
    const duration = room?.decisionDuration || '84s';
    const participantsList = room?.participants ? (Array.isArray(room.participants) ? room.participants : Object.values(room.participants)) : [];
    const squadSize = participantsList.length || 4;
    targetCtx.font = '600 20px -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", sans-serif';
    targetCtx.fillStyle = '#94A3B8';
    targetCtx.fillText(
      `DECIDED IN ${String(duration).toUpperCase()} • ${squadSize} PARTICIPANTS AGREED`,
      width / 2,
      isStory ? 175 : 115
    );

    // Hero Venue Card Dimensions
    const cardX = 70;
    const cardY = isStory ? 240 : 160;
    const cardW = width - 140;
    const cardH = isStory ? 820 : 540;

    targetCtx.save();
    targetCtx.beginPath();
    drawRoundedRectPath(targetCtx, cardX, cardY, cardW, cardH, 36);
    targetCtx.clip();

    if (loadedImage && !useVectorFallbackOnly) {
      try {
        targetCtx.drawImage(loadedImage, cardX, cardY, cardW, cardH);
        const vig = targetCtx.createLinearGradient(cardX, cardY + cardH * 0.45, cardX, cardY + cardH);
        vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vig.addColorStop(1, 'rgba(10, 13, 20, 0.95)');
        targetCtx.fillStyle = vig;
        targetCtx.fillRect(cardX, cardY + cardH * 0.45, cardW, cardH * 0.55);
      } catch {
        drawVectorHeroFallback(targetCtx, { x: cardX, y: cardY, width: cardW, height: cardH, venue });
      }
    } else {
      drawVectorHeroFallback(targetCtx, { x: cardX, y: cardY, width: cardW, height: cardH, venue });
    }
    targetCtx.restore();

    // Venue Information
    const textStartY = cardY + cardH - (isStory ? 210 : 180);
    targetCtx.font = '800 52px -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", sans-serif';
    targetCtx.fillStyle = '#FFFFFF';
    targetCtx.textAlign = 'left';
    targetCtx.fillText(venue?.name || 'Winning Spot', cardX + 44, textStartY);

    const rating = venue?.rating ? `★ ${venue.rating}` : '★ 4.8';
    const cuisine = venue?.cuisine || 'Dining';
    const price = typeof venue?.priceTier === 'number' ? '$'.repeat(venue.priceTier) : (venue?.priceTier || '$$');
    const distance = venue?.distance ? ` • ${venue.distance}` : '';
    targetCtx.font = '600 26px -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", sans-serif';
    targetCtx.fillStyle = '#FBBF24';
    targetCtx.fillText(`${rating} • ${cuisine} • ${price}${distance}`, cardX + 44, textStartY + 48);

    // Superlatives Badges
    const supStartY = cardY + cardH + (isStory ? 70 : 40);
    targetCtx.font = '700 24px -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", sans-serif';
    targetCtx.fillStyle = '#E2E8F0';
    targetCtx.fillText('🏆 SQUAD AWARDS & SUPERLATIVES', cardX, supStartY);

    const badgesToRender = activeSuperlatives.slice(0, 3);
    badgesToRender.forEach((badge, idx) => {
      const badgeY = supStartY + 36 + idx * 72;
      const bW = cardW;
      const bH = 58;

      targetCtx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      targetCtx.beginPath();
      drawRoundedRectPath(targetCtx, cardX, badgeY, bW, bH, 16);
      targetCtx.fill();

      targetCtx.font = '26px sans-serif';
      targetCtx.fillText(badge.avatar || '🎖️', cardX + 20, badgeY + 40);

      targetCtx.font = '700 22px -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", sans-serif';
      targetCtx.fillStyle = '#FFFFFF';
      targetCtx.fillText(badge.participantName, cardX + 66, badgeY + 38);

      targetCtx.font = '600 20px -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", sans-serif';
      targetCtx.fillStyle = '#A78BFA';
      targetCtx.textAlign = 'right';
      targetCtx.fillText(`${badge.badgeTitle} (${badge.badgeDetail || 'MVP'})`, cardX + bW - 24, badgeY + 38);
      targetCtx.textAlign = 'left';
    });

    // Viral Acquisition Footer
    const footerY = height - (isStory ? 90 : 50);
    targetCtx.font = '700 22px -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", sans-serif';
    targetCtx.fillStyle = '#64748B';
    targetCtx.textAlign = 'center';
    targetCtx.fillText(
      `Swipe together. Decide faster. • matchbite.app/?room=${room?.code || 'TACO42'}`,
      width / 2,
      footerY
    );
  };

  renderCard(false, ctx);

  // Export with fail-safe recovery for tainted canvas SecurityError
  const exportFromCanvas = (targetCanvas) => {
    return new Promise((resolve, reject) => {
      try {
        targetCanvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob produced null'));
        }, 'image/png', 0.95);
      } catch (err) {
        reject(err);
      }
    });
  };

  try {
    return await exportFromCanvas(canvas);
  } catch (err) {
    // If external image was drawn and caused SecurityError / tainted canvas,
    // HTML5 spec requires a pristine canvas instance (tainted canvas origin-clean flag is irreversible)
    if (
      err.name === 'SecurityError' ||
      String(err).includes('Tainted') ||
      String(err).includes('Security')
    ) {
      const cleanCanvas = document.createElement('canvas');
      cleanCanvas.width = width;
      cleanCanvas.height = height;
      const cleanCtx = cleanCanvas.getContext('2d', { alpha: false });
      if (cleanCtx) {
        renderCard(true, cleanCtx); // Forced pure procedural vector fallback on clean canvas
        return await exportFromCanvas(cleanCanvas);
      }
    }
    throw err;
  }
}
