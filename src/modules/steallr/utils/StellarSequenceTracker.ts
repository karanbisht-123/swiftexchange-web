export class StellarSequenceTracker {
  private static lastSequences = new Map<string, string>();
  private static knownSequences = new Set<string>();

  /**
   * Gets the next sequence number to build a transaction.
   * If a tracked sequence is already greater than or equal to the ledger's sequence,
   * we increment the tracked sequence. Otherwise, we sync with the ledger sequence.
   */
  static getAndIncrementSequence(address: string, networkSequence: string): string {
    const trackedSeq = this.lastSequences.get(address);
    let nextSeq: bigint;

    if (trackedSeq && BigInt(trackedSeq) >= BigInt(networkSequence)) {
      nextSeq = BigInt(trackedSeq) + 1n;
    } else {
      nextSeq = BigInt(networkSequence);
    }

    this.lastSequences.set(address, nextSeq.toString());

    // Track the transaction sequence number we built (seqNum = baseSeq + 1)
    const txSeq = (nextSeq + 1n).toString();
    this.knownSequences.add(`${address}:${txSeq}`);

    return nextSeq.toString();
  }

  /**
   * Checks if a sequence number was built by the tracker.
   */
  static isKnownSequence(address: string, txSeq: string): boolean {
    return this.knownSequences.has(`${address}:${txSeq}`);
  }

  /**
   * Removes a sequence number from the known set.
   */
  static removeKnownSequence(address: string, txSeq: string) {
    this.knownSequences.delete(`${address}:${txSeq}`);
  }

  /**
   * Rollback the sequence number if a transaction failed before submission or before reaching the ledger.
   * Only rolls back if the tracked sequence matches the one used, ensuring we don't disrupt newer transactions.
   */
  static rollbackSequence(address: string, sequenceUsed: string) {
    const trackedSeq = this.lastSequences.get(address);
    if (trackedSeq && BigInt(trackedSeq) === BigInt(sequenceUsed)) {
      const rolledBack = BigInt(sequenceUsed) - 1n;
      this.lastSequences.set(address, rolledBack.toString());
    }
  }

  /**
   * Reset tracking for an address. Call this when we get a hard sequence error (tx_bad_seq)
   * to force re-synchronization with the network ledger on the next build.
   */
  static reset(address: string) {
    this.lastSequences.delete(address);
    const prefix = `${address}:`;
    for (const key of Array.from(this.knownSequences)) {
      if (key.startsWith(prefix)) {
        this.knownSequences.delete(key);
      }
    }
  }

  /**
   * Syncs the tracked sequence to the given sequence if it's higher.
   */
  static syncSequence(address: string, sequence: string) {
    const trackedSeq = this.lastSequences.get(address);
    if (!trackedSeq || BigInt(sequence) > BigInt(trackedSeq)) {
      this.lastSequences.set(address, sequence);
    }
  }
}

