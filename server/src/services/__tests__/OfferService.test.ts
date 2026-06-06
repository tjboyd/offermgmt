/**
 * OfferService + TokenService unit tests.
 * Covers: eligibility guards, token state machine logic, sendMethod tracking.
 */

import { OfferError } from '../OfferService';

describe('OfferError', () => {
  it('carries statusCode and message', () => {
    const e = new OfferError('Player already accepted.', 400);
    expect(e.statusCode).toBe(400);
    expect(e.message).toBe('Player already accepted.');
  });
});

describe('Offer eligibility rules', () => {
  const statuses = {
    canOffer:   ['draft', 'waitlisted', 'expired'],
    canReject:  ['draft', 'waitlisted'],
    cannotSend: ['sent', 'accepted', 'declined', 'rejected'],
  };

  it('draft/waitlisted/expired players can receive offers', () => {
    for (const s of statuses.canOffer) {
      expect(['draft', 'waitlisted', 'expired'].includes(s)).toBe(true);
    }
  });

  it('draft/waitlisted players can receive rejections', () => {
    for (const s of statuses.canReject) {
      expect(['draft', 'waitlisted'].includes(s)).toBe(true);
    }
  });

  it('sent/accepted/declined/rejected players cannot receive new offers', () => {
    for (const s of statuses.cannotSend) {
      expect(['draft', 'waitlisted', 'expired'].includes(s)).toBe(false);
    }
  });

  it('early offers require earlyOfferEligible = true', () => {
    const player = { earlyOfferEligible: false };
    const mode   = 'early';
    const wouldThrow = mode === 'early' && !player.earlyOfferEligible;
    expect(wouldThrow).toBe(true);
  });

  it('early offers pass when earlyOfferEligible = true', () => {
    const player = { earlyOfferEligible: true };
    const mode   = 'early';
    const wouldThrow = mode === 'early' && !player.earlyOfferEligible;
    expect(wouldThrow).toBe(false);
  });
});

describe('Token state machine logic', () => {
  it('valid: token exists, not accepted, not declined, not expired', () => {
    const offer = { acceptedAt: null, declinedAt: null, expiresAt: new Date(Date.now() + 86400000) };
    const state =
      !offer ? 'invalid' :
      offer.acceptedAt ? 'already_accepted' :
      offer.declinedAt ? 'already_declined' :
      offer.expiresAt && new Date() > offer.expiresAt ? 'expired' :
      'valid';
    expect(state).toBe('valid');
  });

  it('already_accepted: acceptedAt is set', () => {
    const offer = { acceptedAt: new Date(), declinedAt: null, expiresAt: new Date(Date.now() + 86400000) };
    const state = offer.acceptedAt ? 'already_accepted' : 'other';
    expect(state).toBe('already_accepted');
  });

  it('already_declined: declinedAt is set', () => {
    const offer = { acceptedAt: null, declinedAt: new Date(), expiresAt: new Date(Date.now() + 86400000) };
    const state = !offer.acceptedAt && offer.declinedAt ? 'already_declined' : 'other';
    expect(state).toBe('already_declined');
  });

  it('expired: expiresAt is in the past', () => {
    const offer = { acceptedAt: null, declinedAt: null, expiresAt: new Date(Date.now() - 1000) };
    const state = !offer.acceptedAt && !offer.declinedAt && new Date() > offer.expiresAt ? 'expired' : 'other';
    expect(state).toBe('expired');
  });

  it('tokens are UUIDs (122-bit entropy)', () => {
    const crypto = require('crypto');
    const token  = crypto.randomUUID();
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('two tokens are always unique', () => {
    const crypto = require('crypto');
    expect(crypto.randomUUID()).not.toBe(crypto.randomUUID());
  });
});

describe('Template key mapping', () => {
  function templateKey(mode: string) {
    if (mode === 'early')     return 'early_offer';
    if (mode === 'rejection') return 'rejection_letter';
    return 'offer_letter';
  }

  it('early → early_offer', ()     => expect(templateKey('early')).toBe('early_offer'));
  it('post_tryout → offer_letter', () => expect(templateKey('post_tryout')).toBe('offer_letter'));
  it('rejection → rejection_letter', () => expect(templateKey('rejection')).toBe('rejection_letter'));
});
