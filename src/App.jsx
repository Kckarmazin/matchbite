import React, { useState, useEffect } from 'react';
import { useRoom } from './context/RoomContext.jsx';
import { Header } from './components/Common/Header.jsx';
import { Toast } from './components/Common/Toast.jsx';
import { CreateRoom } from './components/Lobby/CreateRoom.jsx';
import { JoinRoom } from './components/Lobby/JoinRoom.jsx';
import { RoomLobby } from './components/Lobby/RoomLobby.jsx';
import { SwipeDeck } from './components/Swiper/SwipeDeck.jsx';
import { MatchCelebration } from './components/Match/MatchCelebration.jsx';
import { ConsensusLeaderboard } from './components/Tiebreaker/ConsensusLeaderboard.jsx';
import { RouletteWheel } from './components/Tiebreaker/RouletteWheel.jsx';
import { VipUpgradeModal } from './components/Monetization/VipUpgradeModal.jsx';
import { Sparkles, Users, ArrowLeft } from 'lucide-react';

export function AppContent() {
  const {
    room,
    startVoting,
    showToast,
    viewMode,
    setViewMode,
    isVipModalOpen,
    setIsVipModalOpen,
    restartRoom,
  } = useRoom();
  const [activeTab, setActiveTab] = useState('create');
  const [urlRoomCode, setUrlRoomCode] = useState('');

  // Check URL parameters on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const codeFromUrl = params.get('room');
      if (codeFromUrl) {
        setUrlRoomCode(codeFromUrl.toUpperCase());
        setActiveTab('join');
      }
    }
  }, []);

  const handleStartSwiping = async () => {
    try {
      await startVoting();
    } catch (err) {
      console.error('Failed to start voting:', err);
    }
  };

  return (
    <div className="app-container">
      <Header />

      <main style={{ flex: 1 }}>
        {room ? (
          // In active room
          room.status === 'lobby' ? (
            <RoomLobby onStartSwiping={handleStartSwiping} />
          ) : viewMode === 'leaderboard' || room.status === 'results' ? (
            <div>
              {room.status === 'voting' && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm mb-3"
                  onClick={() => setViewMode('normal')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <ArrowLeft size={14} /> Back to Swiping
                </button>
              )}
              <ConsensusLeaderboard
                onOpenWheel={() => setViewMode('roulette')}
                onRestart={() => restartRoom()}
              />
            </div>
          ) : viewMode === 'roulette' ? (
            <div>
              {room.status === 'voting' && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm mb-3"
                  onClick={() => setViewMode('normal')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <ArrowLeft size={14} /> Back to Swiping
                </button>
              )}
              <RouletteWheel
                onBackToLeaderboard={() => setViewMode('leaderboard')}
                onWinnerRevealed={() => setViewMode('normal')}
              />
            </div>
          ) : room.status === 'voting' ? (
            <SwipeDeck />
          ) : room.status === 'matched' ? (
            <MatchCelebration onRestart={() => restartRoom()} />
          ) : (
            <div className="card text-center" style={{ padding: '40px 20px' }}>
              <Sparkles size={36} color="var(--primary)" style={{ margin: '0 auto 16px' }} />
              <h2 className="card-title">Session Complete</h2>
              <p className="card-subtitle">
                Room status: <strong>{room.status}</strong>
              </p>
            </div>
          )
        ) : (
          // Not in a room: Show Create / Join tabs
          <div>
            <div className="tab-container">
              <button
                type="button"
                className={`tab-btn ${activeTab === 'create' ? 'active' : ''}`}
                onClick={() => setActiveTab('create')}
              >
                Create Room
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'join' ? 'active' : ''}`}
                onClick={() => setActiveTab('join')}
              >
                Join with Code
              </button>
            </div>

            {activeTab === 'create' ? (
              <CreateRoom onSwitchToJoin={() => setActiveTab('join')} />
            ) : (
              <JoinRoom
                initialCode={urlRoomCode}
                onSwitchToCreate={() => setActiveTab('create')}
              />
            )}
          </div>
        )}
      </main>

      <VipUpgradeModal
        isOpen={isVipModalOpen}
        onClose={() => setIsVipModalOpen(false)}
      />

      <Toast />
    </div>
  );
}

export default function App() {
  return <AppContent />;
}
