import { describe, it, expect } from 'vitest';
import { parseTask } from '@/lib/asana';

describe('parseTask', () => {
  it('returns a bare numeric id', () => {
    expect(parseTask('1209888777666555')).toBe('1209888777666555');
  });
  it('extracts from a /task/ URL', () => {
    expect(
      parseTask(
        'https://app.asana.com/1/15793206/project/1205550001112223/task/1209888777666555?focus=true',
      ),
    ).toBe('1209888777666555');
  });
  it('falls back to the last long run of digits', () => {
    expect(parseTask('https://app.asana.com/0/1200000000000000/1209888777666555')).toBe(
      '1209888777666555',
    );
  });
  it('returns empty for junk', () => {
    expect(parseTask('not a task')).toBe('');
  });
  it('returns empty for empty input', () => {
    expect(parseTask('')).toBe('');
  });
});
