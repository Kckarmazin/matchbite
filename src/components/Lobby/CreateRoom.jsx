import React, { useState } from 'react';
import { useRoom } from '../../context/RoomContext.jsx';
import { AVATAR_OPTIONS } from '../../utils/session.js';
import { Sparkles, Users, Utensils, DollarSign, MapPin, Navigation, Compass, Layers, Leaf } from 'lucide-react';

const GROUP_TYPES = [
  { id: 'couples', label: '👫 Date Night', desc: 'Romantic spots' },
  { id: 'friends', label: '🎉 Friends Out', desc: 'Lively vibes' },
  { id: 'coworkers', label: '💼 Team Lunch', desc: 'Quick & casual' },
  { id: 'family', label: '👨‍👩‍👧 Family', desc: 'All-ages friendly' },
];

const CATEGORIES = [
  { id: 'dining', label: '🍽️ Dining', desc: 'Restaurants & bites' },
  { id: 'bars', label: '🍸 Bars & Lounges', desc: 'Drinks & nightlife' },
  { id: 'entertainment', label: '🎯 Activities', desc: 'Arcades & games' },
  { id: 'coffee', label: '☕ Cafe & Brunch', desc: 'Relaxed coffee' },
];

const DIETARY_OPTIONS = [
  { id: 'vegetarian', label: '🌱 Vegetarian' },
  { id: 'vegan', label: '🥑 Vegan' },
  { id: 'gluten_free', label: '🌾 Gluten-Free' },
  { id: 'halal', label: '🥩 Halal' },
  { id: 'patio', label: '☀️ Patio' },
  { id: 'late_night', label: '🌙 Open Late' },
];

export function CreateRoom({ onSwitchToJoin }) {
  const { participant, createRoom, isLoading } = useRoom();

  const [hostName, setHostName] = useState(participant.name || '');
  const [hostAvatar, setHostAvatar] = useState(participant.avatar || '🍕');
  const [groupType, setGroupType] = useState('friends');
  const [activityCategory, setActivityCategory] = useState('dining');
  const [priceRange, setPriceRange] = useState([1, 2]);
  const [distance, setDistance] = useState('short_drive');
  const [deckSize, setDeckSize] = useState('all');
  const [dietaryFilters, setDietaryFilters] = useState([]);
  const [locationName, setLocationName] = useState('');
  const [coordinates, setCoordinates] = useState({ lat: null, lng: null });
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationStatus, setLocationStatus] = useState(null);

  const toggleDietary = (id) => {
    setDietaryFilters((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const togglePrice = (price) => {
    setPriceRange((prev) => {
      if (prev.includes(price)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter((p) => p !== price);
      } else {
        return [...prev, price].sort();
      }
    });
  };

  const handleDetectLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationStatus('GPS not supported');
      return;
    }
    setIsDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoordinates({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocationName('Current Location (GPS)');
        setLocationStatus('detected');
        setIsDetectingLocation(false);
      },
      (err) => {
        console.warn('Geolocation warning:', err.message);
        setLocationName('Austin, TX (Default)');
        setLocationStatus('fallback');
        setIsDetectingLocation(false);
      },
      { timeout: 7000 }
    );
  };

  const handleLocationChange = async (val) => {
    setLocationName(val);
    const clean = val.trim();
    if (!clean) {
      setCoordinates({ lat: null, lng: null });
      setLocationStatus(null);
      return;
    }

    // Auto-resolve 5-digit zip code in real time
    if (/^\d{5}$/.test(clean)) {
      setLocationStatus('resolving');
      try {
        const res = await fetch(`/api/places/geocode?query=${clean}`);
        if (res.ok) {
          const data = await res.json();
          setCoordinates({ lat: data.lat, lng: data.lng });
          setLocationStatus(`detected:${data.city ? `${data.city}, ${data.state}` : data.name}`);
          return;
        }
      } catch {
        // fallback
      }
    }

    setCoordinates({ lat: null, lng: null });
    setLocationStatus(clean ? 'custom' : null);
  };

  const handleSelectCityChip = async (city) => {
    setLocationName(city);
    setLocationStatus('resolving');
    try {
      const res = await fetch(`/api/places/geocode?query=${encodeURIComponent(city)}`);
      if (res.ok) {
        const data = await res.json();
        setCoordinates({ lat: data.lat, lng: data.lng });
        setLocationStatus(`detected:${city}`);
        return;
      }
    } catch {
      // fallback
    }
    setLocationStatus('custom');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hostName.trim()) return;

    let finalLat = coordinates.lat;
    let finalLng = coordinates.lng;

    if (finalLat == null && locationName.trim()) {
      try {
        const res = await fetch(`/api/places/geocode?query=${encodeURIComponent(locationName.trim())}`);
        if (res.ok) {
          const data = await res.json();
          finalLat = data.lat;
          finalLng = data.lng;
        }
      } catch {
        // fallback to server resolution
      }
    }

    await createRoom({
      hostName: hostName.trim(),
      hostAvatar,
      groupType,
      activityCategory,
      priceRange,
      distance,
      deckSize: deckSize === 'all' ? 'all' : Number(deckSize),
      dietaryFilters,
      locationName: locationName.trim() || undefined,
      lat: finalLat,
      lng: finalLng,
    });
  };

  return (
    <div className="card">
      <h2 className="card-title">Create a Decision Session</h2>
      <p className="card-subtitle">
        Invite friends with a short code and swipe together to find a unanimous match!
      </p>

      <form onSubmit={handleSubmit}>
        {/* Host Name & Avatar */}
        <div className="form-group">
          <label className="form-label">Your Name or Nickname</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Maya, Sam..."
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
            maxLength={30}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Choose Your Avatar</label>
          <div className="avatar-selector">
            {AVATAR_OPTIONS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                className={`avatar-btn ${hostAvatar === emoji ? 'selected' : ''}`}
                onClick={() => setHostAvatar(emoji)}
                aria-label={`Select avatar ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Group Type */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Users size={16} /> Group Vibe
          </label>
          <div className="chip-grid">
            {GROUP_TYPES.map((type) => (
              <button
                type="button"
                key={type.id}
                className={`chip-btn ${groupType === type.id ? 'active' : ''}`}
                onClick={() => setGroupType(type.id)}
              >
                <span>{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Category */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Utensils size={16} /> Category
          </label>
          <div className="chip-grid">
            {CATEGORIES.map((cat) => (
              <button
                type="button"
                key={cat.id}
                className={`chip-btn ${activityCategory === cat.id ? 'active' : ''}`}
                onClick={() => setActivityCategory(cat.id)}
              >
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Price Tier */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <DollarSign size={16} /> Price Tier
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[1, 2, 3, 4].map((tier) => {
              const label = '$'.repeat(tier);
              const isActive = priceRange.includes(tier);
              return (
                <button
                  type="button"
                  key={tier}
                  className={`chip-btn ${isActive ? 'active' : ''}`}
                  style={{ flex: 1, padding: '10px 0' }}
                  onClick={() => togglePrice(tier)}
                >
                  <span style={{ fontWeight: 800 }}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dietary & Vibe (Optional) */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Leaf size={16} /> Dietary & Vibe (Optional)
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {DIETARY_OPTIONS.map((item) => {
              const isActive = dietaryFilters.includes(item.id);
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`chip-btn ${isActive ? 'active' : ''}`}
                  style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                  onClick={() => toggleDietary(item.id)}
                >
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Location / Area */}
        <div className="form-group">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Navigation size={16} /> Location / City
            </label>
            <button
              type="button"
              onClick={handleDetectLocation}
              disabled={isDetectingLocation}
              style={{
                background: 'rgba(255, 90, 95, 0.1)',
                border: '1px solid rgba(255, 90, 95, 0.3)',
                color: 'var(--primary)',
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Compass size={13} /> {isDetectingLocation ? 'Detecting...' : '📍 Use My GPS'}
            </button>
          </div>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. 78704, Austin, or 90210 (or tap GPS / cities below)"
            value={locationName}
            onChange={(e) => handleLocationChange(e.target.value)}
          />

          {locationStatus === 'resolving' && (
            <div style={{ marginTop: '6px', fontSize: '0.82rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span>🔍 Resolving zip code & coordinates...</span>
            </div>
          )}

          {locationStatus && locationStatus.startsWith('detected:') && (
            <div style={{ marginTop: '6px', fontSize: '0.82rem', color: '#10B981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span>✓ Located: {locationStatus.replace('detected:', '')} — Live local spots ready!</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            {['Austin, TX', 'New York, NY', 'San Francisco, CA', 'Chicago, IL', 'Miami, FL'].map((city) => (
              <button
                type="button"
                key={city}
                className={`chip-btn ${locationName === city ? 'active' : ''}`}
                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                onClick={() => handleSelectCityChip(city)}
              >
                {city.split(',')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Distance */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={16} /> Radius
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { id: 'walkable', label: '🚶 Walk (<1mi)' },
              { id: 'short_drive', label: '🚗 Drive (<5mi)' },
              { id: 'metro_area', label: '🏙️ Any (<15mi)' },
            ].map((dist) => (
              <button
                type="button"
                key={dist.id}
                className={`chip-btn ${distance === dist.id ? 'active' : ''}`}
                style={{ flex: 1, padding: '10px 4px' }}
                onClick={() => setDistance(dist.id)}
              >
                <span>{dist.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Places to Swipe (Deck Size) */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers size={16} /> Places to Swipe
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            {[
              { id: 'all', label: '🌟 All Places', desc: 'Every spot near zip' },
              { id: '50', label: '🔥 50 Spots', desc: 'Deep Dive' },
              { id: '25', label: '👌 25 Spots', desc: 'Standard' },
              { id: '12', label: '⚡ 12 Spots', desc: 'Quick session' },
            ].map((opt) => (
              <button
                type="button"
                key={opt.id}
                className={`chip-btn ${deckSize === opt.id ? 'active' : ''}`}
                style={{
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  textAlign: 'left',
                }}
                onClick={() => setDeckSize(opt.id)}
              >
                <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{opt.label}</span>
                <span style={{ fontSize: '0.72rem', opacity: 0.75 }}>{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary mt-4"
          disabled={isLoading || !hostName.trim()}
        >
          <Sparkles size={18} />
          {isLoading ? 'Creating Room...' : 'Create Room & Get Code'}
        </button>

        {onSwitchToJoin && (
          <div className="text-center mt-4">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onSwitchToJoin}
              style={{ fontSize: '0.9rem', padding: '10px' }}
            >
              Have a code already? Join Room
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
