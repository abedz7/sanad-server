import type { ScanStatus } from '../../tickets/ticket.model.js';

// Seam for malware scanning. Phase 1/2 ships the honest no-op (scanStatus: "skipped" — we do not
// pretend files were scanned); the interface exists so a real scanner is a one-line swap.
export interface VirusScanner {
  scan(buffer: Buffer): Promise<ScanStatus | 'infected'>;
}

export class NoopScanner implements VirusScanner {
  scan(): Promise<ScanStatus> {
    return Promise.resolve('skipped');
  }
}

// Documented adapter stub for a real deployment: point it at a clamd host (e.g. the official
// clamav/clamav container) and implement scan() with an INSTREAM session over TCP — the protocol
// is a length-prefixed byte stream answered by "stream: OK" or "stream: <sig> FOUND", which maps
// to 'clean' / 'infected'. Deliberately not implemented here: it would add a daemon dependency
// that breaks "runs in under 10 minutes", and a stub that fakes 'clean' would be a lie.
export class ClamAvScanner implements VirusScanner {
  constructor() {
    throw new Error(
      'ClamAvScanner is not configured. Run a clamd instance and implement scan() via INSTREAM; see the comment above.',
    );
  }

  scan(): Promise<ScanStatus | 'infected'> {
    return Promise.reject(new Error('ClamAvScanner is not configured'));
  }
}

export const virusScanner: VirusScanner = new NoopScanner();
