import { describe, it, expect } from 'vitest';
import { assess } from '@/lib/image';

describe('assess', () => {
  it('flags a 4:5 image at or above full size as ok', () => {
    expect(assess(1080, 1350)).toBe('ok');
    expect(assess(2160, 2700)).toBe('ok'); // 4:5, larger
  });
  it('flags an off-ratio image as cropped', () => {
    expect(assess(1080, 1080)).toBe('cropped'); // square
    expect(assess(1920, 1080)).toBe('cropped'); // landscape
  });
  it('flags an on-ratio but too-small image as upscaled', () => {
    expect(assess(540, 675)).toBe('upscaled'); // 4:5 but narrower than 1080
  });
});
