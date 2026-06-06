import { mergeFields, buildMergeContext } from '../merge';

describe('mergeFields', () => {
  it('replaces known merge fields', () => {
    const result = mergeFields('Hello {{playerFirstName}}!', { playerFirstName: 'Jake' });
    expect(result).toBe('Hello Jake!');
  });

  it('leaves unknown fields as-is', () => {
    const result = mergeFields('Hello {{unknown}}!', {});
    expect(result).toBe('Hello {{unknown}}!');
  });

  it('HTML-escapes injected values', () => {
    const result = mergeFields('{{val}}', { val: '<script>alert(1)</script>' });
    expect(result).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('handles multiple fields in one template', () => {
    const result = mergeFields('{{a}} and {{b}}', { a: 'foo', b: 'bar' });
    expect(result).toBe('foo and bar');
  });

  it('handles repeated fields', () => {
    const result = mergeFields('{{name}} is {{name}}', { name: 'Jake' });
    expect(result).toBe('Jake is Jake');
  });
});

describe('buildMergeContext', () => {
  it('maps all required fields', () => {
    const ctx = buildMergeContext({
      playerFirstName: 'Jake',
      playerLastName:  'Smith',
      parentName:      'Mike Smith',
      teamName:        '12U AAA',
      seasonLabel:     '2027',
      deadline:        'July 31, 2026',
      acceptUrl:       'https://app.example.com/accept/abc',
      declineUrl:      'https://app.example.com/decline/xyz',
    });
    expect(ctx.playerFirstName).toBe('Jake');
    expect(ctx.team).toBe('12U AAA');
    expect(ctx.season).toBe('2027');
    expect(ctx.orgName).toBe('Hamilton Jr Chargers');
  });
});
