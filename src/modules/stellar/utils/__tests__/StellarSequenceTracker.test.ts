import { beforeEach, describe, expect, it } from 'vitest';

import { StellarSequenceTracker } from '../StellarSequenceTracker';

describe('StellarSequenceTracker', () => {
  const address = 'GB1234567890';

  beforeEach(() => {
    StellarSequenceTracker.reset(address);
  });

  describe('getAndIncrementSequence', () => {
    it('returns the networkSequence when first called and tracks it', () => {
      const seq = StellarSequenceTracker.getAndIncrementSequence(address, '100');
      expect(seq).toBe('100');
    });

    it('increments sequence if tracked sequence is greater than or equal to ledger sequence', () => {
      StellarSequenceTracker.getAndIncrementSequence(address, '100'); // Tracked becomes 100
      const seq = StellarSequenceTracker.getAndIncrementSequence(address, '100'); // Tracked is 100 >= 100, becomes 101
      expect(seq).toBe('101');
    });

    it('syncs with the ledger sequence if ledger sequence is higher than tracked', () => {
      StellarSequenceTracker.getAndIncrementSequence(address, '100'); // Tracked becomes 100
      const seq = StellarSequenceTracker.getAndIncrementSequence(address, '200'); // Tracked is 100 < 200, becomes 200
      expect(seq).toBe('200');
    });
  });

  describe('isKnownSequence & removeKnownSequence', () => {
    it('correctly tracks built transaction sequence numbers (baseSeq + 1)', () => {
      StellarSequenceTracker.getAndIncrementSequence(address, '100');
      expect(StellarSequenceTracker.isKnownSequence(address, '101')).toBe(true);

      StellarSequenceTracker.removeKnownSequence(address, '101');
      expect(StellarSequenceTracker.isKnownSequence(address, '101')).toBe(false);
    });
  });

  describe('rollbackSequence', () => {
    it('rolls back tracked sequence by 1 if sequenceUsed matches currently tracked', () => {
      StellarSequenceTracker.getAndIncrementSequence(address, '100'); // Tracked is 100
      StellarSequenceTracker.rollbackSequence(address, '100');

      const seq = StellarSequenceTracker.getAndIncrementSequence(address, '90'); // If rolled back, tracked matches 99, so 99 >= 90 => returns 100 (which is rolledBack (99) + 1)
      // Wait, let's verify math:
      // initial getAndIncrementSequence(address, '100') -> trackedSeq is set to '100'
      // rollbackSequence(address, '100') -> trackedSeq matches '100' -> rolledBack = 100 - 1 = 99. Set trackedSeq to '99'.
      // getAndIncrementSequence(address, '90') -> trackedSeq (99) >= 90 -> returns 99 + 1 = 100.
      expect(seq).toBe('100');
    });

    it('does not roll back sequence if sequenceUsed does not match tracked', () => {
      StellarSequenceTracker.getAndIncrementSequence(address, '100');
      StellarSequenceTracker.rollbackSequence(address, '200'); // mismatch

      const seq = StellarSequenceTracker.getAndIncrementSequence(address, '90'); // tracked is still 100 >= 90 => returns 101
      expect(seq).toBe('101');
    });
  });

  describe('syncSequence', () => {
    it('updates tracked sequence to the given sequence if higher', () => {
      StellarSequenceTracker.getAndIncrementSequence(address, '100');
      StellarSequenceTracker.syncSequence(address, '200');

      const seq = StellarSequenceTracker.getAndIncrementSequence(address, '90'); // tracked is 200 >= 90 => returns 201
      expect(seq).toBe('201');
    });
  });
});
