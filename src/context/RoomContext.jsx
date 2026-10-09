import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as api from '../utils/api.js';
import {
  getParticipantProfile,
  saveParticipantProfile,
  getStoredParticipantId,
  getRoomSession,
  saveRoomSession,
  clearRoomSession,
} from '../utils/session.js';

const RoomContext = createContext(null);

export function RoomProvider({ children }) {
  const [room, setRoom] = useState(null);
  const [participant, setParticipant] = useState(() => getParticipantProfile());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeTiebreakerSpin, setActiveTiebreakerSpin] = useState(null);
  const [viewMode, setViewMode] = useState('normal'); // 'normal', 'leaderboard', 'roulette'
  const [isVipModalOpen, setIsVipModalOpen] = useState(false);

  const streamDisconnectRef = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  // Handle incoming real-time SSE / polling events
  const handleRoomEvent = useCallback((eventName, data) => {
    switch (eventName) {
      case 'room:init':
        if (data.room) setRoom(data.room);
        setIsConnected(true);
        break;

      case 'participant:joined':
        if (data.participant) {
          setRoom((prev) => {
            if (!prev) return prev;
            const updatedList = prev.participants ? [...prev.participants] : [];
            const existingIdx = updatedList.findIndex((p) => p.id === data.participant.id);
            if (existingIdx >= 0) {
              updatedList[existingIdx] = data.participant;
            } else {
              updatedList.push(data.participant);
            }
            return {
              ...prev,
              participants: updatedList,
              participantCount: updatedList.length,
            };
          });
          showToast(`${data.participant.name} joined the room!`, 'success');
        }
        break;

      case 'participant:left':
        if (data.participantId) {
          setRoom((prev) => {
            if (!prev) return prev;
            const updatedList = (prev.participants || []).filter((p) => p.id !== data.participantId);
            return {
              ...prev,
              participants: updatedList,
              participantCount: updatedList.length,
            };
          });
        }
        break;

      case 'settings:updated':
        if (data.settings) {
          setRoom((prev) => (prev ? { ...prev, settings: { ...prev.settings, ...data.settings } } : prev));
          showToast('Room settings updated', 'info');
        }
        break;

      case 'voting:started':
        setRoom((prev) => (prev ? { ...prev, status: 'voting', deck: data.deck || [] } : prev));
        showToast('Swiping has started!', 'success');
        break;

      case 'participant:progress':
        if (data?.participantId) {
          setRoom((prev) => {
            if (!prev || !prev.participants) return prev;
            const updatedList = prev.participants.map((p) => {
              if (p.id === data.participantId) {
                return {
                  ...p,
                  swipedCount: data.swipedCount,
                  totalCards: data.totalCards,
                  currentVenueId: data.venueId || p.currentVenueId,
                  progressPercent: data.progressPercent || Math.round((data.swipedCount / (data.totalCards || 1)) * 100),
                };
              }
              return p;
            });
            return {
              ...prev,
              participants: updatedList,
            };
          });
        }
        break;

      case 'match:revealed':
        if (data?.venue) {
          setRoom((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              status: 'matched',
              matchedVenueId: data.venueId,
              matchedVenue: data.venue,
              match: data,
            };
          });
          showToast(`🎉 Match Found! Everyone agreed on ${data.venue.name}!`, 'success');
        }
        break;

      case 'voting:ended':
        setRoom((prev) => (prev ? { ...prev, status: 'results' } : prev));
        showToast('Swiping completed! Calculating group consensus...', 'info');
        break;

      case 'tiebreaker:spin':
        setActiveTiebreakerSpin(data);
        if (data?.winningVenue) {
          setRoom((prev) => (prev ? {
            ...prev,
            status: 'matched',
            matchedVenueId: data.winningVenueId,
            matchedVenue: data.winningVenue,
            tiebreakerResult: data,
          } : prev));
          showToast(`🎡 Roulette Spin! The wheel chose ${data.winningVenue.name}!`, 'info');
        }
        break;

      case 'room:restarted':
        setActiveTiebreakerSpin(null);
        setViewMode('normal');
        if (data?.room) {
          setRoom(data.room);
        } else {
          setRoom((prev) => (prev ? {
            ...prev,
            status: data.status || 'voting',
            matchedVenueId: null,
            matchedVenue: null,
            tiebreakerResult: null,
          } : prev));
        }
        showToast('Round restarted! Swiping again!', 'success');
        break;

      case 'room:upgraded':
        setRoom((prev) => (prev ? {
          ...prev,
          isVip: true,
          vipPlan: data.vipPlan || 'vip-pass',
          vipPerks: data.vipPerks || null,
        } : prev));
        showToast('⭐ Room upgraded to VIP Pass!', 'success');
        break;

      case 'deck:updated':
        if (data?.deck) {
          setRoom((prev) => (prev ? { ...prev, deck: data.deck } : prev));
        }
        if (data?.addedVenue) {
          showToast(`Added custom spot: ${data.addedVenue.name}!`, 'success');
        }
        break;

      case 'room:sync':
        if (data) {
          setRoom(data);
          setIsConnected(true);
        }
        break;

      case 'room:closed':
        if (room?.code) clearRoomSession(room.code);
        setRoom(null);
        showToast('The room has been closed', 'error');
        break;

      case 'participant:kicked':
        if (data.kickedId === participant?.id) {
          if (room?.code) clearRoomSession(room.code);
          setRoom(null);
          showToast('You have been removed from the session by the host.', 'error');
        } else {
          setRoom((prev) => {
            if (!prev) return prev;
            const updatedList = (prev.participants || []).filter((p) => p.id !== data.kickedId);
            return {
              ...prev,
              participants: updatedList,
              participantCount: updatedList.length,
            };
          });
          showToast(`${data.kickedName || 'A participant'} was removed by the host`, 'info');
        }
        break;

      case 'participant:nudged':
        if (data.targetParticipantId === participant?.id) {
          showToast(`🔔 ${data.message || 'Your host is nudging you to vote!'}`, 'info');
        }
        break;

      default:
        break;
    }
  }, [showToast, room?.code]);

  // Connect / disconnect SSE stream when room changes
  useEffect(() => {
    if (!room?.code || !participant?.id) {
      if (streamDisconnectRef.current) {
        streamDisconnectRef.current();
        streamDisconnectRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    const session = getRoomSession(room.code);
    const token = participant.sessionToken || session?.sessionToken || null;

    // Connect SSE
    const disconnect = api.connectRoomStream(
      room.code,
      participant.id,
      token,
      handleRoomEvent,
      (err) => {
        console.warn('Room stream warning/fallback:', err);
      }
    );
    streamDisconnectRef.current = disconnect;
    setIsConnected(true);

    return () => {
      disconnect();
      streamDisconnectRef.current = null;
      setIsConnected(false);
    };
  }, [room?.code, participant?.id, participant?.sessionToken, handleRoomEvent]);

  // Create a room action
  const handleCreateRoom = async (formData) => {
    setIsLoading(true);
    setError(null);
    try {
      const profile = saveParticipantProfile({
        name: formData.hostName,
        avatar: formData.hostAvatar,
      });

      const res = await api.createRoom({
        ...formData,
        hostId: profile.id,
        hostName: profile.name,
        hostAvatar: profile.avatar,
      });

      if (res.success && res.room) {
        const sessionToken = res.sessionToken || res.participant?.sessionToken || null;
        const hostKey = res.hostKey || null;

        saveRoomSession(res.room.code, {
          participantId: res.participant.id,
          sessionToken,
          hostKey,
          isHost: true,
        });

        setRoom(res.room);
        const hostParticipant = {
          ...profile,
          id: res.participant.id,
          isHost: true,
          sessionToken,
          hostKey,
        };
        setParticipant(hostParticipant);
        showToast(`Room created! Code: ${res.room.code}`, 'success');
        return { success: true, room: res.room, joinUrl: res.joinUrl };
      } else {
        throw new Error(res.error || 'Failed to create room');
      }
    } catch (err) {
      setError(err.message || 'Error creating room');
      showToast(err.message || 'Error creating room', 'error');
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Join a room action
  const handleJoinRoom = async (code, joinData) => {
    setIsLoading(true);
    setError(null);
    try {
      const cleanCode = code.trim().toUpperCase();
      const existingSession = getRoomSession(cleanCode);

      const profile = saveParticipantProfile({
        name: joinData.name,
        avatar: joinData.avatar,
      });

      const res = await api.joinRoom(cleanCode, {
        participantId: existingSession?.participantId || profile.id,
        name: profile.name,
        avatar: profile.avatar,
        sessionToken: existingSession?.sessionToken || undefined,
      });

      if (res.success && res.room) {
        const sessionToken = res.sessionToken || res.participant?.sessionToken || existingSession?.sessionToken || null;
        const isHost = res.participant?.isHost ?? Boolean(existingSession?.isHost);
        const hostKey = isHost ? (res.hostKey || existingSession?.hostKey || null) : null;

        saveRoomSession(res.room.code, {
          participantId: res.participant.id,
          sessionToken,
          hostKey,
          isHost,
        });

        setRoom(res.room);
        setParticipant({
          ...profile,
          id: res.participant.id,
          isHost,
          sessionToken,
          hostKey,
        });
        showToast(`Joined room ${res.room.code}!`, 'success');
        return { success: true, room: res.room };
      } else {
        throw new Error(res.error || 'Failed to join room');
      }
    } catch (err) {
      setError(err.message || 'Error joining room');
      showToast(err.message || 'Error joining room', 'error');
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Update room settings (Host only)
  const handleUpdateSettings = async (newSettings) => {
    if (!room?.code || !participant?.id) return;
    try {
      const session = getRoomSession(room.code);
      const token = participant.sessionToken || session?.sessionToken || null;
      const hostKey = participant.hostKey || session?.hostKey || null;

      const res = await api.updateSettings(room.code, participant.id, newSettings, token, hostKey);
      if (res.success) {
        setRoom((prev) => (prev ? { ...prev, settings: res.settings } : prev));
        showToast('Settings saved', 'success');
        return { success: true, settings: res.settings };
      }
    } catch (err) {
      showToast(err.message || 'Failed to update settings', 'error');
      return { success: false, error: err.message };
    }
  };

  // Leave active room
  const handleLeaveRoom = async () => {
    if (room?.code && participant?.id) {
      try {
        const session = getRoomSession(room.code);
        const token = participant.sessionToken || session?.sessionToken || null;
        await api.leaveRoom(room.code, participant.id, token);
      } catch (e) {
        // ignore leave errors
      }
      clearRoomSession(room.code);
    }
    if (streamDisconnectRef.current) {
      streamDisconnectRef.current();
      streamDisconnectRef.current = null;
    }
    setRoom(null);
    setParticipant((prev) => ({ ...prev, isHost: false, sessionToken: null, hostKey: null }));
    showToast('Left the room', 'info');
  };

  // Start voting (Host only)
  const handleStartVoting = async () => {
    if (!room?.code || !participant?.id) return { success: false };
    setIsLoading(true);
    try {
      const session = getRoomSession(room.code);
      const token = participant.sessionToken || session?.sessionToken || null;
      const hostKey = participant.hostKey || session?.hostKey || null;

      const res = await api.startVoting(room.code, participant.id, token, hostKey);
      if (res.success) {
        setRoom((prev) => (prev ? { ...prev, status: 'voting', deck: res.deck } : prev));
        showToast('Swiping deck unlocked! Start voting!', 'success');
        return { success: true, deck: res.deck };
      } else {
        throw new Error(res.error || 'Failed to start voting');
      }
    } catch (err) {
      showToast(err.message || 'Failed to start voting', 'error');
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  // Cast swipe vote
  const handleCastVote = async (venueId, voteType) => {
    if (!room?.code || !participant?.id) return { success: false };
    try {
      const session = getRoomSession(room.code);
      const token = participant.sessionToken || session?.sessionToken || null;

      const res = await api.voteVenue(room.code, participant.id, venueId, voteType, token);

      // If this vote triggered a unanimous match:
      if (res.isMatch && res.matchedVenue) {
        setRoom((prev) => (prev ? {
          ...prev,
          status: 'matched',
          matchedVenueId: res.matchedVenue.id,
          matchedVenue: res.matchedVenue,
          match: res.match || {
            venueId: res.matchedVenue.id,
            venue: res.matchedVenue,
            isUnanimous: true,
          },
        } : prev));
      }

      return res;
    } catch (err) {
      showToast(err.message || 'Failed to submit vote', 'error');
      throw err;
    }
  };

  // Get Tie-Breaker Candidates
  const handleGetTiebreakerCandidates = async (limit = 6) => {
    if (!room?.code) return { candidates: [] };
    try {
      const res = await api.getTiebreakerCandidates(room.code, limit);
      return res;
    } catch (err) {
      console.error('Failed to get tiebreaker candidates:', err);
      return { candidates: [] };
    }
  };

  // Trigger Tie-Breaker Roulette Spin (Host only)
  const handleSpinTiebreaker = async (options = {}) => {
    if (!room?.code || !participant?.id) return { success: false };
    setIsLoading(true);
    try {
      const session = getRoomSession(room.code);
      const token = participant.sessionToken || session?.sessionToken || null;
      const hostKey = participant.hostKey || session?.hostKey || null;

      const res = await api.spinTiebreaker(room.code, participant.id, options, token, hostKey);
      if (res.success) {
        setActiveTiebreakerSpin(res);
        return res;
      } else {
        throw new Error(res.error || 'Spin failed');
      }
    } catch (err) {
      showToast(err.message || 'Failed to spin wheel', 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Manually select winner from leaderboard (Host only)
  const handleSelectWinner = async (venueId) => {
    if (!room?.code || !participant?.id) return { success: false };
    setIsLoading(true);
    try {
      const session = getRoomSession(room.code);
      const token = participant.sessionToken || session?.sessionToken || null;
      const hostKey = participant.hostKey || session?.hostKey || null;

      const res = await api.selectTiebreakerWinner(room.code, participant.id, venueId, token, hostKey);
      if (res.success) {
        setRoom((prev) => (prev ? {
          ...prev,
          status: 'matched',
          matchedVenueId: venueId,
          matchedVenue: res.venue,
        } : prev));
        showToast(`🎉 Winner selected: ${res.venue?.name}!`, 'success');
        return res;
      }
    } catch (err) {
      showToast(err.message || 'Failed to select winner', 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Restart Round / Reset (Host only)
  const handleRestartRoom = async (options = {}) => {
    if (!room?.code || !participant?.id) return { success: false };
    setIsLoading(true);
    try {
      const session = getRoomSession(room.code);
      const token = participant.sessionToken || session?.sessionToken || null;
      const hostKey = participant.hostKey || session?.hostKey || null;

      const res = await api.restartRoom(room.code, participant.id, options, token, hostKey);
      if (res.success) {
        setActiveTiebreakerSpin(null);
        setViewMode('normal');
        setRoom(res.room);
        showToast('Round restarted! Swiping again!', 'success');
        return res;
      }
    } catch (err) {
      showToast(err.message || 'Failed to restart room', 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Upgrade Room to VIP
  const handleUpgradeRoom = async (upgradeData = {}) => {
    if (!room?.code || !participant?.id) return { success: false };
    setIsLoading(true);
    try {
      const session = getRoomSession(room.code);
      const token = participant.sessionToken || session?.sessionToken || null;
      const hostKey = participant.hostKey || session?.hostKey || null;

      const res = await api.upgradeRoom(room.code, participant.id, upgradeData, token, hostKey);
      if (res.success) {
        setRoom((prev) => (prev ? {
          ...prev,
          isVip: true,
          vipPlan: res.vipPlan || 'vip-pass',
          vipPerks: res.perks || null,
        } : prev));
        showToast('⭐ Room successfully upgraded to VIP!', 'success');
        setIsVipModalOpen(false);
        return res;
      }
    } catch (err) {
      showToast(err.message || 'Upgrade failed', 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Add Custom Venue (VIP only)
  const handleAddCustomVenue = async (venueData = {}) => {
    if (!room?.code || !participant?.id) return { success: false };
    setIsLoading(true);
    try {
      const session = getRoomSession(room.code);
      const token = participant.sessionToken || session?.sessionToken || null;
      const hostKey = participant.hostKey || session?.hostKey || null;

      const res = await api.addCustomVenue(room.code, participant.id, venueData, token, hostKey);
      if (res.success) {
        setRoom((prev) => (prev ? { ...prev, deck: res.deck } : prev));
        showToast(`Added custom spot: ${res.venue?.name}!`, 'success');
        return res;
      }
    } catch (err) {
      showToast(err.message || 'Failed to add custom spot', 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Kick participant (Host only)
  const handleKickParticipant = async (targetParticipantId) => {
    if (!room?.code || !participant?.id || !targetParticipantId) return { success: false };
    try {
      const session = getRoomSession(room.code);
      const token = participant.sessionToken || session?.sessionToken || null;
      const hostKey = participant.hostKey || session?.hostKey || null;

      const res = await api.kickParticipant(room.code, participant.id, targetParticipantId, token, hostKey);
      if (res.success) {
        setRoom((prev) => {
          if (!prev) return prev;
          const updatedList = (prev.participants || []).filter((p) => p.id !== targetParticipantId);
          return {
            ...prev,
            participants: updatedList,
            participantCount: updatedList.length,
          };
        });
        showToast('Participant removed from session', 'info');
        return res;
      }
    } catch (err) {
      showToast(err.message || 'Failed to remove participant', 'error');
      throw err;
    }
  };

  // Nudge participant (Host only)
  const handleNudgeParticipant = async (targetParticipantId) => {
    if (!room?.code || !participant?.id || !targetParticipantId) return { success: false };
    try {
      const session = getRoomSession(room.code);
      const token = participant.sessionToken || session?.sessionToken || null;
      const hostKey = participant.hostKey || session?.hostKey || null;

      const res = await api.nudgeParticipant(room.code, participant.id, targetParticipantId, token, hostKey);
      if (res.success) {
        showToast(`Nudge sent to ${res.targetName || 'participant'}!`, 'success');
        return res;
      }
    } catch (err) {
      showToast(err.message || 'Failed to nudge participant', 'error');
      throw err;
    }
  };

  // Sudden Death Showdown (Host only)
  const handleStartSuddenDeath = async (limit = 3) => {
    if (!room?.code || !participant?.id) return { success: false };
    setIsLoading(true);
    try {
      const session = getRoomSession(room.code);
      const token = participant.sessionToken || session?.sessionToken || null;
      const hostKey = participant.hostKey || session?.hostKey || null;

      const res = await api.startSuddenDeath(room.code, participant.id, limit, token, hostKey);
      if (res.success) {
        setViewMode('normal');
        setRoom((prev) => (prev ? {
          ...prev,
          status: 'voting',
          isSuddenDeath: true,
          deck: res.deck,
        } : prev));
        showToast('⚡ Sudden Death Round Started! Vote on the finalists!', 'success');
        return res;
      }
    } catch (err) {
      showToast(err.message || 'Failed to start Sudden Death', 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <RoomContext.Provider
      value={{
        room,
        participant,
        isLoading,
        error,
        isConnected,
        toast,
        showToast,
        hideToast,
        viewMode,
        setViewMode,
        activeTiebreakerSpin,
        setActiveTiebreakerSpin,
        isVipModalOpen,
        setIsVipModalOpen,
        createRoom: handleCreateRoom,
        joinRoom: handleJoinRoom,
        updateSettings: handleUpdateSettings,
        leaveRoom: handleLeaveRoom,
        startVoting: handleStartVoting,
        castVote: handleCastVote,
        getTiebreakerCandidates: handleGetTiebreakerCandidates,
        spinTiebreaker: handleSpinTiebreaker,
        selectWinner: handleSelectWinner,
        restartRoom: handleRestartRoom,
        upgradeRoom: handleUpgradeRoom,
        addCustomVenue: handleAddCustomVenue,
        kickParticipant: handleKickParticipant,
        nudgeParticipant: handleNudgeParticipant,
        startSuddenDeath: handleStartSuddenDeath,
      }}
    >
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom() {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
}
