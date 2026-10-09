import React, { useState } from 'react';
import { useRoom } from '../../context/RoomContext.jsx';
import { PlusCircle, MapPin, X, Utensils } from 'lucide-react';

export function CustomVenueModal({ isOpen, onClose }) {
  const { addCustomVenue, showToast } = useRoom();

  const [name, setName] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [address, setAddress] = useState('');
  const [priceTier, setPriceTier] = useState(2);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Spot name is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      await addCustomVenue({
        name: name.trim(),
        cuisine: cuisine.trim() || 'Local Favorite',
        address: address.trim() || 'Neighborhood Spot',
        priceTier: Number(priceTier),
        description: description.trim() || 'A hidden gem recommended by group member.',
      });
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to add custom spot');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-card"
        style={{
          background: 'var(--surface-card, #FFFFFF)',
          borderRadius: 'var(--radius-lg, 20px)',
          maxWidth: '420px',
          width: '100%',
          padding: '24px',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
          }}
        >
          <X size={20} />
        </button>

        <div className="text-center" style={{ marginBottom: '16px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-full)',
              background: '#EEF2FF',
              color: 'var(--secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 10px',
            }}
          >
            <Utensils size={24} />
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>
            Add Secret Spot
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Inject your personal favorite restaurant or bar into the swipe deck.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
              Spot Name *
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Luigi's Secret Pizzeria"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                Cuisine / Type
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Italian Pizza"
                value={cuisine}
                onChange={(e) => setCuisine(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                Price Tier
              </label>
              <select
                className="form-input"
                value={priceTier}
                onChange={(e) => setPriceTier(e.target.value)}
              >
                <option value={1}>$ - Budget</option>
                <option value={2}>$$ - Moderate</option>
                <option value={3}>$$$ - Upscale</option>
                <option value={4}>$$$$ - Fine Dining</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
              Address / Area
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. North End, Main St"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
              Why you love it
            </label>
            <textarea
              className="form-input"
              placeholder="Best wood-fired pizza in the city..."
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {errorMsg && (
            <div style={{ color: 'var(--danger)', fontSize: '0.82rem', textAlign: 'center' }}>
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ marginTop: '6px', padding: '12px', fontWeight: 800 }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Adding...' : 'Add to Swipe Deck ✨'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default CustomVenueModal;
