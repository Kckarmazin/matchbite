import React, { useState, useEffect } from 'react';
import { useRoom } from '../../context/RoomContext.jsx';
import { QRCodeSVG } from 'qrcode.react';
import { Share2, Copy, Play, Check, Users, Sparkles, SlidersHorizontal, Bell, UserX, Utensils, MapPin, Layers, QrCode } from 'lucide-react';
import { CUISINE_OPTIONS, DIETARY_OPTIONS } from './CreateRoom.jsx';

export function RoomLobby({ onStartSwiping }) {
  const { room, participant, updateSettings, showToast, kickParticipant, nudgeParticipant, sendReaction, latestReaction } = useRoom();
  const [copied, setCopied] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  const [showSettingsEdit, setShowSettingsEdit] = useState(false);
  const [editDeckSize, setEditDeckSize] = useState(room?.settings?.deckSize || 'all');
  const [editDistance, setEditDistance] = useState(room?.settings?.distance || 'short_drive');
  const [editCuisines, setEditCuisines] = useState(room?.settings?.cuisinePreferences || []);
  const [editDietary, setEditDietary] = useState(room?.settings?.dietaryFilters || []);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    if (room?.settings) {
      setEditDeckSize(room.settings.deckSize || 'all');
      setEditDistance(room.settings.distance || 'short_drive');
      setEditCuisines(room.settings.cuisinePreferences || []);
      setEditDietary(room.settings.dietaryFilters || []);
    }
  }, [room?.settings]);

  // Handle incoming live reactions from other participants
  useEffect(() => {
    if (latestReaction?.emoji) {
      spawnFloatingEmoji(latestReaction.emoji, latestReaction.senderName);
    }
  }, [latestReaction]);

  const spawnFloatingEmoji = (emoji, senderName = null) => {
    const id = `${Date.now()}-${Math.random()}`;
    const startX = Math.floor(Math.random() * 70) + 15; // 15% to 85%
    const rotation = (Math.random() - 0.5) * 36;
    const scale = 0.9 + Math.random() * 0.35;
    setFloatingEmojis((prev) => [...prev.slice(-25), { id, emoji, senderName, startX, rotation, scale }]);
    setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((item) => item.id !== id));
    }, 2600);
  };

  const handleSendEmoji = (emoji) => {
    spawnFloatingEmoji(emoji, participant?.name || 'You');
    if (sendReaction) {
      sendReaction(emoji).catch(() => {});
    }
  };

  const toggleEditCuisine = (id) => {
    setEditCuisines((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const toggleEditDietary = (id) => {
    setEditDietary((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const handleSaveAdjustments = async () => {
    setIsSavingSettings(true);
    await updateSettings({
      deckSize: editDeckSize === 'all' ? 'all' : Number(editDeckSize),
      distance: editDistance,
      cuisinePreferences: editCuisines,
      dietaryFilters: editDietary,
    });
    setIsSavingSettings(false);
    setShowSettingsEdit(false);
  };

  const getCuisineLabel = (id) => {
    const found = CUISINE_OPTIONS.find((c) => c.id === id);
    return found ? found.label : id;
  };

  if (!room) return null;

  const isHost = participant?.isHost || room.hostId === participant?.id;
  const joinUrl = `${window.location.origin}/?room=${room.code}`;
  const qrJoinUrl = `${window.location.origin}/?room=${room.code}&ref=qr`;

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(joinUrl);
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = joinUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      showToast('Invite link copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      showToast('Could not copy link automatically', 'error');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join our MatchBite room!',
          text: `Help us pick where to go! Join room ${room.code}:`,
          url: joinUrl,
        });
      } catch (err) {
        // User cancelled share
      }
    } else {
      handleCopyLink();
    }
  };

  const participantsList = Array.isArray(room.participants)
    ? room.participants
    : Object.values(room.participants || {});

  return (
    <div>
      {/* Code Banner */}
      <div className="code-display">
        <span className="code-title">Room Code</span>
        <span className="code-number">{room.code}</span>
        <p style={{ fontSize: '0.85rem', color: '#9F1239', marginTop: '6px' }}>
          Share this code with your friends, scan the QR code, or send the direct link below!
        </p>

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px', width: '100%', maxWidth: '360px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1, minWidth: '100px', padding: '10px 12px', fontSize: '0.88rem' }}
            onClick={handleCopyLink}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? 'Copied!' : 'Copy Link'}</span>
          </button>

          <button
            type="button"
            className={`btn ${showQrCode ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, minWidth: '120px', padding: '10px 12px', fontSize: '0.88rem' }}
            onClick={() => setShowQrCode((prev) => !prev)}
            aria-expanded={showQrCode}
            aria-label="Toggle Room QR Code"
          >
            <QrCode size={16} />
            <span>{showQrCode ? 'Hide QR' : 'Show QR Code'}</span>
          </button>

          {typeof navigator !== 'undefined' && navigator.share && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1, minWidth: '90px', padding: '10px 12px', fontSize: '0.88rem' }}
              onClick={handleShare}
            >
              <Share2 size={16} />
              <span>Share</span>
            </button>
          )}
        </div>

        {/* Dynamic In-Lobby QR Code */}
        {showQrCode && (
          <div
            className="qr-code-box"
            style={{
              marginTop: '16px',
              padding: '16px',
              background: '#FFFFFF',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)',
              boxShadow: 'var(--shadow-md)',
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <div style={{ padding: '8px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <QRCodeSVG
                value={qrJoinUrl}
                size={170}
                level="M"
                includeMargin={false}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', display: 'block' }}>
                Scan to Join Instantly
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Point mobile camera at QR code • Room {room.code}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Participants Roster Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="card-title" style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} color="var(--primary)" />
            <span>Group Members ({participantsList.length})</span>
          </h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {participantsList.length > 1 ? 'Ready to vote' : 'Waiting for friends...'}
          </span>
        </div>

        <div className="roster-grid">
          {participantsList.map((p) => {
            const isSelf = p.id === participant?.id;
            const isTargetHost = p.isHost || p.id === room.hostId;

            return (
              <div
                key={p.id}
                className="roster-badge"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '1.2rem' }}>{p.avatar || '🍕'}</span>
                  <span>{p.name}</span>
                  {isTargetHost && (
                    <span className="host-tag">Host</span>
                  )}
                </div>

                {isHost && !isSelf && !isTargetHost && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => nudgeParticipant(p.id)}
                      title={`Nudge ${p.name}`}
                      aria-label={`Nudge ${p.name}`}
                      style={{
                        background: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        borderRadius: '999px',
                        padding: '6px 12px',
                        minHeight: '38px',
                        minWidth: '38px',
                        cursor: 'pointer',
                        color: '#D97706',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                      }}
                    >
                      <Bell size={13} />
                      <span>Nudge</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Remove ${p.name} from this room?`)) {
                          kickParticipant(p.id);
                        }
                      }}
                      title={`Remove ${p.name}`}
                      aria-label={`Remove ${p.name}`}
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '999px',
                        padding: '6px 12px',
                        minHeight: '38px',
                        minWidth: '38px',
                        cursor: 'pointer',
                        color: '#DC2626',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                      }}
                    >
                      <UserX size={13} />
                      <span>Remove</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Activity Settings Summary */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 className="card-title" style={{ fontSize: '1.15rem' }}>Session Settings</h3>
          {isHost && (
            <button
              type="button"
              onClick={() => setShowSettingsEdit(!showSettingsEdit)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--primary)',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <SlidersHorizontal size={14} />
              <span>{showSettingsEdit ? 'Close' : 'Adjust'}</span>
            </button>
          )}
        </div>

        {showSettingsEdit && isHost ? (
          <div style={{ background: 'var(--surface-muted)', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '10px', color: 'var(--primary)' }}>
              Adjust Session Settings
            </h4>

            {/* Deck Size */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <Layers size={13} /> PLACES TO SWIPE
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                {[
                  { id: 'all', label: '🌟 All Places' },
                  { id: '25', label: '🔥 25 Spots' },
                  { id: '15', label: '👌 15 Spots' },
                  { id: '8', label: '⚡ 8 Spots' },
                ].map((opt) => (
                  <button
                    type="button"
                    key={opt.id}
                    className={`chip-btn ${editDeckSize === opt.id ? 'active' : ''}`}
                    style={{ padding: '6px 8px', fontSize: '0.8rem', textAlign: 'center' }}
                    onClick={() => setEditDeckSize(opt.id)}
                    aria-pressed={editDeckSize === opt.id}
                  >
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Radius */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <MapPin size={13} /> RADIUS
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[
                  { id: 'walkable', label: '🚶 Walk (<1mi)' },
                  { id: 'short_drive', label: '🚗 Drive (<5mi)' },
                  { id: 'metro_area', label: '🏙️ Any (<15mi)' },
                ].map((dist) => (
                  <button
                    type="button"
                    key={dist.id}
                    className={`chip-btn ${editDistance === dist.id ? 'active' : ''}`}
                    style={{ flex: 1, padding: '6px 4px', fontSize: '0.75rem' }}
                    onClick={() => setEditDistance(dist.id)}
                    aria-pressed={editDistance === dist.id}
                  >
                    <span>{dist.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Food & Cuisines */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Utensils size={13} /> CUISINE & FOOD TYPE
                </label>
                {editCuisines.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditCuisines([])}
                    style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Clear (All)
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {CUISINE_OPTIONS.map((item) => {
                  const isActive = editCuisines.includes(item.id);
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`chip-btn ${isActive ? 'active' : ''}`}
                      style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                      onClick={() => toggleEditCuisine(item.id)}
                      aria-pressed={isActive}
                    >
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dietary */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                DIETARY & VIBE
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {DIETARY_OPTIONS.map((item) => {
                  const isActive = editDietary.includes(item.id);
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`chip-btn ${isActive ? 'active' : ''}`}
                      style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                      onClick={() => toggleEditDietary(item.id)}
                      aria-pressed={isActive}
                    >
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, padding: '10px', fontSize: '0.9rem' }}
                disabled={isSavingSettings}
                onClick={handleSaveAdjustments}
              >
                <span>{isSavingSettings ? 'Saving...' : 'Save & Update Session'}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '10px 14px', fontSize: '0.9rem' }}
                onClick={() => setShowSettingsEdit(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.9rem' }}>
            <div style={{ background: 'var(--surface-muted)', padding: '10px 12px', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>CATEGORY</div>
              <div style={{ fontWeight: 700 }}>
                {room.settings?.activityCategory === 'bars' ? 'Bars & Lounges' :
                 room.settings?.activityCategory === 'entertainment' ? 'Activities' :
                 room.settings?.activityCategory === 'coffee' ? 'Cafe & Brunch' : 'Dining'}
              </div>
            </div>

            <div style={{ background: 'var(--surface-muted)', padding: '10px 12px', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>GROUP VIBE</div>
              <div style={{ fontWeight: 700 }}>
                {room.settings?.groupType === 'couples' ? 'Date Night' :
                 room.settings?.groupType === 'coworkers' ? 'Team Lunch' :
                 room.settings?.groupType === 'family' ? 'Family' : 'Friends Out'}
              </div>
            </div>

            <div style={{ background: 'var(--surface-muted)', padding: '10px 12px', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>PRICE</div>
              <div style={{ fontWeight: 700 }}>
                {(room.settings?.priceRange || [1, 2]).map((tier) => '$'.repeat(tier)).join(', ')}
              </div>
            </div>

            <div style={{ background: 'var(--surface-muted)', padding: '10px 12px', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>RADIUS</div>
              <div style={{ fontWeight: 700 }}>
                {room.settings?.distance === 'walkable' ? 'Walk (<1mi)' :
                 room.settings?.distance === 'metro_area' ? 'Any (<15mi)' : 'Drive (<5mi)'}
              </div>
            </div>

            <div style={{ background: 'var(--surface-muted)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', gridColumn: room.settings?.locationName ? 'auto' : 'span 2' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>PLACES TO SWIPE</div>
              <div style={{ fontWeight: 700, color: 'var(--primary)' }}>
                {room.settings?.deckSize === 'all' ? 'All Places (Every spot)' :
                 `${room.settings?.deckSize || 12} Spots`}
              </div>
            </div>

            {room.settings?.locationName && (
              <div style={{ background: 'var(--surface-muted)', padding: '10px 12px', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>LOCATION</div>
                <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={room.settings.locationName}>
                  {room.settings.locationName}
                </div>
              </div>
            )}

            <div style={{ background: 'var(--surface-muted)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', gridColumn: 'span 2' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>CUISINE & FOOD TYPE</div>
              <div style={{ fontWeight: 700, display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                {room.settings?.cuisinePreferences && room.settings.cuisinePreferences.length > 0 ? (
                  room.settings.cuisinePreferences.map((c) => (
                    <span
                      key={c}
                      style={{
                        background: 'var(--surface-card)',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '0.78rem',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {getCuisineLabel(c)}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    🌟 All Cuisines (Any Food)
                  </span>
                )}
              </div>
            </div>

            {room.settings?.dietaryFilters && room.settings.dietaryFilters.length > 0 && (
              <div style={{ background: 'var(--surface-muted)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', gridColumn: 'span 2' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>DIETARY & VIBE</div>
                <div style={{ fontWeight: 700, display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {room.settings.dietaryFilters.map((f) => (
                    <span
                      key={f}
                      style={{
                        background: 'var(--surface-card)',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '0.78rem',
                        border: '1px solid var(--border)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {f.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Interactive Lobby Emoji Reaction Bar */}
      <div
        className="card"
        style={{
          marginTop: '16px',
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #FFFFFF, #FFF1F2)',
          border: '1.5px solid #FECDD3',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '6px' }}>
          <Sparkles size={16} color="var(--primary)" />
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            Lobby Reactions & Banter
          </span>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
          Tap an emoji to react across all squad members' screens while waiting!
        </p>
        <div
          className="lobby-reaction-bar"
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          {[
            { emoji: '🍻', label: 'Cheers' },
            { emoji: '🌮', label: 'Starving' },
            { emoji: '🎉', label: 'Party' },
            { emoji: '⏰', label: 'Hurry Up!' },
          ].map(({ emoji, label }) => (
            <button
              key={emoji}
              type="button"
              className="lobby-reaction-btn"
              onClick={() => handleSendEmoji(emoji)}
              title={label}
              aria-label={`Send ${label} reaction`}
              style={{
                background: '#FFFFFF',
                border: '1.5px solid var(--border)',
                borderRadius: '999px',
                padding: '8px 14px',
                minHeight: '44px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '1.25rem',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span>{emoji}</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Start Swiping CTA */}
      <div style={{ marginTop: '16px' }}>
        {isHost ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '16px', fontSize: '1.1rem' }}
            onClick={onStartSwiping}
          >
            <Play size={20} />
            <span>Start Swiping!</span>
          </button>
        ) : (
          <div
            className="card text-center"
            style={{
              background: 'var(--primary-light)',
              border: '1px solid #FECDD3',
              padding: '16px',
            }}
          >
            <p style={{ fontWeight: 700, color: 'var(--primary)' }}>
              Waiting for host to start the swiping round...
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Keep this screen open. Swiping will start automatically!
            </p>
          </div>
        )}
      </div>

      {/* Floating lobby reaction particles container */}
      <div
        className="lobby-particles-overlay"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 9999,
          overflow: 'hidden',
        }}
      >
        {floatingEmojis.map((item) => (
          <div
            key={item.id}
            className="lobby-floating-particle"
            style={{
              position: 'absolute',
              bottom: '80px',
              left: `${item.startX}%`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              transform: `rotate(${item.rotation}deg) scale(${item.scale})`,
              animation: 'floatLobbyParticle 2.5s cubic-bezier(0.22, 1, 0.36, 1) forwards',
            }}
          >
            <span style={{ fontSize: '2.4rem', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))' }}>
              {item.emoji}
            </span>
            {item.senderName && (
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  background: 'rgba(0,0,0,0.75)',
                  color: '#FFFFFF',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  marginTop: '2px',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.senderName}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
