import React, { useState } from 'react';
import { useRoom } from '../../context/RoomContext.jsx';
import {
  Crown,
  Check,
  CreditCard,
  Tag,
  ShieldCheck,
  X,
  Sparkles,
} from 'lucide-react';

export function VipUpgradeModal({ isOpen, onClose }) {
  const { room, upgradeRoom, showToast } = useRoom();

  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [name, setName] = useState('');
  const [coupon, setCoupon] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  // Pricing calculation
  const basePrice = 2.99;
  const isVipFree = appliedCoupon === 'VIPFREE';
  const isHalfOff = appliedCoupon === 'HALFOFF';
  const finalPrice = isVipFree ? 0 : isHalfOff ? 1.49 : basePrice;

  const handleApplyCoupon = (e) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanCoupon = coupon.trim().toUpperCase();
    if (cleanCoupon === 'VIPFREE') {
      setAppliedCoupon('VIPFREE');
      showToast('🎉 100% OFF coupon applied: Free VIP Upgrade!', 'success');
    } else if (cleanCoupon === 'HALFOFF') {
      setAppliedCoupon('HALFOFF');
      showToast('🏷️ 50% OFF coupon applied: $1.49 total!', 'success');
    } else {
      setErrorMsg('Invalid coupon code. Try "VIPFREE" or "HALFOFF".');
    }
  };

  const handleQuickFill = (type) => {
    setErrorMsg('');
    if (type === 'visa') {
      setCardNumber('4242 4242 4242 4242');
      setExpiry('12/28');
      setCvv('123');
      setName('Alex Rivera');
    } else if (type === 'coupon') {
      setCoupon('VIPFREE');
      setAppliedCoupon('VIPFREE');
    } else if (type === 'declined') {
      setCardNumber('4000 0000 0000 0002');
      setExpiry('10/27');
      setCvv('000');
      setName('Test Declined');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    let paymentToken = 'tok_visa';
    if (!isVipFree) {
      const cleanCard = cardNumber.replace(/\s+/g, '');
      if (cleanCard.length < 15) {
        setErrorMsg('Please enter a valid credit card number.');
        return;
      }
      if (!expiry || expiry.length < 4) {
        setErrorMsg('Please enter a valid expiry date (MM/YY).');
        return;
      }
      if (!cvv || cvv.length < 3) {
        setErrorMsg('Please enter a valid 3-digit CVV.');
        return;
      }

      if (cleanCard.endsWith('0002')) {
        paymentToken = 'tok_declined';
      } else if (cleanCard.startsWith('5')) {
        paymentToken = 'tok_mastercard';
      } else {
        paymentToken = 'tok_visa';
      }
    }

    try {
      setIsSubmitting(true);
      await upgradeRoom({
        planId: 'vip-pass',
        paymentToken,
        couponCode: appliedCoupon,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Payment processing failed');
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
          maxWidth: '440px',
          width: '100%',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          position: 'relative',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Close Button */}
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

        {/* Modal Header */}
        <div className="text-center" style={{ marginBottom: '16px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, #FDE68A, #F59E0B)',
              color: '#78350F',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}
          >
            <Crown size={28} />
          </div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0 }}>
            MatchBite VIP Pass
          </h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Elevate your group decision experience with premium powers.
          </p>
        </div>

        {/* Perks Checklist */}
        <div
          style={{
            background: 'var(--surface-muted, #F8FAFC)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            marginBottom: '16px',
            border: '1px solid var(--border)',
          }}
        >
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              <Check size={16} color="var(--success)" />
              <span>Add custom restaurants & secret spots to deck</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              <Check size={16} color="var(--success)" />
              <span>Unlimited round resets and continuous swiping</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              <Check size={16} color="var(--success)" />
              <span>3x Decision Roulette re-spin passes</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              <Check size={16} color="var(--success)" />
              <span>Priority 100% consensus matching boost</span>
            </li>
          </ul>
        </div>

        {/* Quick Test Fill Chips */}
        <div style={{ marginBottom: '14px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Quick Test Fill:
          </span>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ fontSize: '0.75rem', padding: '3px 8px' }}
              onClick={() => handleQuickFill('visa')}
            >
              Valid Card
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ fontSize: '0.75rem', padding: '3px 8px' }}
              onClick={() => handleQuickFill('coupon')}
            >
              Coupon VIPFREE
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ fontSize: '0.75rem', padding: '3px 8px', color: 'var(--danger)' }}
              onClick={() => handleQuickFill('declined')}
            >
              Declined Card
            </button>
          </div>
        </div>

        {/* Coupon Code Input */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Tag size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Coupon (e.g. VIPFREE)"
              value={coupon}
              onChange={(e) => setCoupon(e.target.value)}
              style={{ paddingLeft: '32px', fontSize: '0.88rem' }}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleApplyCoupon}
            style={{ fontSize: '0.85rem', padding: '0 14px' }}
          >
            Apply
          </button>
        </div>

        {appliedCoupon && (
          <div
            style={{
              padding: '6px 10px',
              background: '#ECFDF5',
              border: '1px solid #A7F3D0',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.82rem',
              color: '#065F46',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Check size={14} />
            <span>Coupon applied: <strong>{appliedCoupon}</strong> ({isVipFree ? '100% OFF' : '50% OFF'})</span>
          </div>
        )}

        {/* Payment Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {!isVipFree && (
            <>
              <div>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Cardholder Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ fontSize: '0.88rem' }}
                />
              </div>

              <div style={{ position: 'relative' }}>
                <CreditCard size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Card Number (4242 4242 ...)"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  maxLength={19}
                  style={{ paddingLeft: '32px', fontSize: '0.88rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="MM/YY"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  maxLength={5}
                  style={{ fontSize: '0.88rem' }}
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="CVV"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value)}
                  maxLength={4}
                  style={{ fontSize: '0.88rem' }}
                />
              </div>
            </>
          )}

          {errorMsg && (
            <div style={{ color: 'var(--danger)', fontSize: '0.82rem', textAlign: 'center', marginTop: '4px' }}>
              {errorMsg}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-primary"
            style={{
              marginTop: '8px',
              padding: '12px',
              fontSize: '1rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
            disabled={isSubmitting}
          >
            <ShieldCheck size={18} />
            <span>
              {isSubmitting
                ? 'Processing...'
                : finalPrice === 0
                ? 'Claim VIP Free Upgrade 🎉'
                : `Pay $${finalPrice.toFixed(2)} & Upgrade`}
            </span>
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '10px' }}>
          Simulated checkout environment. No actual charge will occur.
        </p>
      </div>
    </div>
  );
}

export default VipUpgradeModal;
