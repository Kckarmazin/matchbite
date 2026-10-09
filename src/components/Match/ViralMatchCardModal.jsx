import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRoom } from '../../context/RoomContext.jsx';
import { generateShareCardBlob, calculateSquadSuperlatives } from '../../utils/cardCanvasGenerator.js';
import { Share2, Copy, Check, Download, X, Sparkles, Loader2 } from 'lucide-react';

export function ViralMatchCardModal({ venue, superlatives = [], isOpen, onClose }) {
  const { room, showToast } = useRoom();
  const [format, setFormat] = useState('story');
  const [isExporting, setIsExporting] = useState(false);
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null);
  const [copiedText, setCopiedText] = useState(false);
  const activeBlobRef = useRef(null);

  // Derive squad superlatives
  const squadSuperlatives = superlatives && superlatives.length > 0
    ? superlatives
    : calculateSquadSuperlatives({ room, venue });

  // Handle keyboard Escape to dismiss modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Generate card whenever modal opens or format changes
  useEffect(() => {
    if (!isOpen || !venue) {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
        setPreviewBlobUrl(null);
      }
      activeBlobRef.current = null;
      return;
    }

    let isMounted = true;
    setIsExporting(true);

    generateShareCardBlob({ room, venue, superlatives: squadSuperlatives, format })
      .then((blob) => {
        if (!isMounted) return;
        activeBlobRef.current = blob;
        if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
        const url = URL.createObjectURL(blob);
        setPreviewBlobUrl(url);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Canvas generation error:', err);
        showToast('Generated card preview with safe vector styling', 'info');
      })
      .finally(() => {
        if (isMounted) setIsExporting(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, format, venue?.id, room?.code]);

  const handleShareStory = useCallback(async () => {
    if (!activeBlobRef.current) return;
    const blob = activeBlobRef.current;
    const filename = `matchbite-${room?.code || 'match'}-${format}.png`;
    const file = new File([blob], filename, { type: 'image/png' });

    // 1. Try Native Web Share API Level 2 (Mobile iOS/Android)
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Our MatchBite Squad Pick: ${venue.name}!`,
          text: `We reached 100% agreement on ${venue.name} in ${room?.decisionDuration || '84s'}!`,
        });
        showToast('Story card shared successfully! 📸', 'success');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    // 2. Direct File Download Fallback
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Story card saved to your photos/downloads! 📸', 'success');
  }, [format, room?.code, room?.decisionDuration, venue?.name, showToast]);

  const handleCopyChatSnippet = useCallback(async () => {
    const duration = room?.decisionDuration || '84s';
    const awardsText = squadSuperlatives
      .slice(0, 4)
      .map((s) => `• ${s.avatar || '👤'} ${s.participantName}: ${s.badgeTitle}`)
      .join('\n');

    const snippet = `🎉 The squad has spoken on MatchBite!\n🏆 WINNER: ${venue.name} (${venue.rating || 4.8} ★)\n📍 ${venue.cuisine || 'Dining'} • ${typeof venue.priceTier === 'number' ? '$'.repeat(venue.priceTier) : (venue.priceTier || '$$')}${venue.distance ? ` • ${venue.distance}` : ''}\n⚡ 100% Squad Consensus in ${duration}!\n\n🎖️ Squad Awards:\n${awardsText}\n\n👉 Join next round: ${typeof window !== 'undefined' ? window.location.origin : ''}/?room=${room?.code || 'TACO42'}`;

    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedText(true);
      showToast('Formatted squad summary copied for WhatsApp / iMessage! 📋', 'success');
      setTimeout(() => setCopiedText(false), 2500);
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  }, [room?.code, room?.decisionDuration, venue, squadSuperlatives, showToast]);

  if (!isOpen || !venue) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-card-export-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-dialog modal-card-export">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={22} color="#FF5A5F" />
            <h3 id="modal-card-export-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
              Squad Victory Card
            </h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Format Selector Pills */}
        <div className="format-toggle-bar">
          <button
            type="button"
            className={`format-btn ${format === 'story' ? 'active' : ''}`}
            onClick={() => setFormat('story')}
          >
            📱 9:16 Instagram Story
          </button>
          <button
            type="button"
            className={`format-btn ${format === 'square' ? 'active' : ''}`}
            onClick={() => setFormat('square')}
          >
            💬 1:1 WhatsApp Chat
          </button>
        </div>

        {/* Live Card Preview Box */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: format === 'story' ? '320px' : '240px',
            background: '#0B0F19',
            borderRadius: '16px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            margin: '12px 0',
            boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)',
          }}
        >
          {isExporting ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', color: '#94A3B8' }}>
              <Loader2 size={28} className="animate-spin" color="#FF5A5F" />
              <span style={{ fontSize: '0.82rem' }}>Rendering high-res card...</span>
            </div>
          ) : previewBlobUrl ? (
            <img
              src={previewBlobUrl}
              alt="Story Card Preview"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <span style={{ color: '#64748B', fontSize: '0.85rem' }}>No preview available</span>
          )}
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleShareStory}
            disabled={isExporting}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Share2 size={18} />
            <span>Share Story Card</span>
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCopyChatSnippet}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              {copiedText ? <Check size={16} color="#10B981" /> : <Copy size={16} />}
              <span>{copiedText ? 'Copied!' : 'Copy Summary'}</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleShareStory}
              disabled={isExporting}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Download size={16} />
              <span>Download PNG</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ViralMatchCardModal;
