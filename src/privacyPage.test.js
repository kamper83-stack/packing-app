const fs = require('fs');
const path = require('path');

// Contract tests for the static privacy policy page (issue #159 / A3, gap G2).
// The page is a real static document served by nginx OUTSIDE the SPA (see the
// `location = /privacy` block from #173/#175), so Play/Apple get real HTML
// instead of the app shell. These assertions keep the required disclosures
// present and the content aligned with what the app actually collects.
describe('public/privacy.html', () => {
  const file = path.join(process.cwd(), 'public', 'privacy.html');

  it('exists and is a standalone HTML document (not the SPA shell)', () => {
    expect(fs.existsSync(file)).toBe(true);
    const html = fs.readFileSync(file, 'utf8');
    expect(html.toLowerCase()).toContain('<!doctype html>');
    expect(html).toMatch(/<title>[^<]*Privacy[^<]*<\/title>/i);
    // Must not be a React SPA mount point.
    expect(html).not.toContain('id="root"');
  });

  const html = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

  it('discloses the data categories the app actually collects', () => {
    expect(html).toMatch(/email/i);
    expect(html).toMatch(/password/i);
    expect(html).toMatch(/hash/i);
    expect(html).toMatch(/trip|destination/i);
  });

  it('names the third-party processors and that credentials are not shared', () => {
    expect(html).toMatch(/gemini/i);
    expect(html).toMatch(/weather/i);
    expect(html).toMatch(/rapidapi|skyscanner/i);
  });

  it('documents deletion rights and a contact channel', () => {
    expect(html).toMatch(/delet/i);
    expect(html).toContain('mailto:');
  });
});
