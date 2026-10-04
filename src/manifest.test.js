const fs = require('fs');
const path = require('path');

// Contract tests for public/manifest.json (issue #158 / StoreReadiness A2).
// A CRA-default manifest is not installable-clean for Play/TWA: it lacks id,
// scope and a maskable icon, and its theme_color drifts from the HTML brand.
// These assertions keep the manifest aligned with the app shell.
describe('public/manifest.json', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'public', 'manifest.json'), 'utf8')
  );
  const indexHtml = fs.readFileSync(
    path.join(process.cwd(), 'public', 'index.html'),
    'utf8'
  );

  it('declares an explicit id and scope', () => {
    expect(manifest.id).toBe('/');
    expect(manifest.scope).toBe('/');
  });

  it('uses an absolute start_url, not the CRA default "."', () => {
    expect(manifest.start_url).toBe('/');
  });

  it('keeps theme_color consistent with the HTML brand color', () => {
    const htmlThemeColor = indexHtml.match(
      /<meta\s+name="theme-color"\s+content="([^"]+)"/i
    );
    expect(htmlThemeColor).not.toBeNull();
    expect(manifest.theme_color.toLowerCase()).toBe(
      htmlThemeColor[1].toLowerCase()
    );
  });

  it('ships a 512x512 maskable icon for adaptive launchers', () => {
    const maskable = manifest.icons.filter(
      (icon) => typeof icon.purpose === 'string' && icon.purpose.includes('maskable')
    );
    expect(maskable.length).toBeGreaterThan(0);
    expect(maskable.some((icon) => icon.sizes === '512x512')).toBe(true);
  });

  it('keeps short_name within the 12-character launcher budget', () => {
    expect(manifest.short_name.length).toBeGreaterThan(0);
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it('is installable: standalone display with a 512 icon present', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((icon) => icon.sizes === '512x512')).toBe(true);
  });
});
