import { describe, expect, it } from 'vitest';
import { manifest } from '../apps/Alipay/manifest';

describe('Alipay launcher asset', () => {
  it('uses the bundled logo image instead of an approximate line drawing', () => {
    expect(typeof manifest.icon).toBe('string');
    expect(manifest.icon).toContain('launcher.png');
  });
});
