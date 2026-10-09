const fs = require('fs');
const path = require('path');

// Contract tests for the nginx security response headers
// (issue #174 / StoreReadiness A6, gap G5).
//
// The headers live in nginx/default.conf rather than the app, and CI builds the
// frontend image but never boots the nginx container or runs `nginx -t`, so a
// dropped or weakened header would otherwise reach production unnoticed. These
// assertions read the committed config and pin the required headers in place.
describe('nginx/default.conf security headers', () => {
  const conf = fs.readFileSync(
    path.join(process.cwd(), 'nginx', 'default.conf'),
    'utf8'
  );

  // Pull the single server block's directives (the file has exactly one).
  const headerLine = (name) => {
    const match = conf.match(
      new RegExp(`add_header\\s+${name}\\s+"([^"]*)"\\s*(always)?\\s*;`, 'i')
    );
    return match ? { value: match[1], always: match[2] === 'always' } : null;
  };

  it('sets HSTS with a one-year max-age and includeSubDomains, no preload', () => {
    const hsts = headerLine('Strict-Transport-Security');
    expect(hsts).not.toBeNull();
    expect(hsts.always).toBe(true);
    expect(hsts.value).toMatch(/max-age=\d{7,}/); // >= ~4 months, here 31536000
    expect(hsts.value).toMatch(/includeSubDomains/i);
    // preload is a hard-to-reverse commitment this change intentionally avoids.
    expect(hsts.value.toLowerCase()).not.toContain('preload');
  });

  it('sets X-Content-Type-Options: nosniff', () => {
    const header = headerLine('X-Content-Type-Options');
    expect(header).not.toBeNull();
    expect(header.always).toBe(true);
    expect(header.value.toLowerCase()).toBe('nosniff');
  });

  it('protects against clickjacking via X-Frame-Options', () => {
    const header = headerLine('X-Frame-Options');
    expect(header).not.toBeNull();
    expect(header.always).toBe(true);
    expect(header.value.toUpperCase()).toMatch(/^(SAMEORIGIN|DENY)$/);
  });

  it('sets a privacy-preserving Referrer-Policy', () => {
    const header = headerLine('Referrer-Policy');
    expect(header).not.toBeNull();
    expect(header.always).toBe(true);
    expect(header.value).toMatch(/strict-origin|no-referrer|same-origin/i);
  });

  describe('Content-Security-Policy', () => {
    const csp = headerLine('Content-Security-Policy');

    it('is present and emitted on every response (always)', () => {
      expect(csp).not.toBeNull();
      expect(csp.always).toBe(true);
    });

    it('defaults to self and blocks plugins and framing', () => {
      expect(csp.value).toMatch(/default-src\s+'self'/);
      expect(csp.value).toMatch(/object-src\s+'none'/);
      expect(csp.value).toMatch(/frame-ancestors\s+'self'/);
      expect(csp.value).toMatch(/base-uri\s+'self'/);
    });

    it("keeps script-src/style-src compatible with CRA's inlined runtime", () => {
      // CRA inlines the webpack runtime chunk as an inline <script> and injects
      // inline styles; a CSP without 'unsafe-inline' here would blank the app.
      expect(csp.value).toMatch(/script-src[^;]*'unsafe-inline'/);
      expect(csp.value).toMatch(/style-src[^;]*'unsafe-inline'/);
    });

    it('does not weaken script execution with unsafe-eval or a wildcard', () => {
      expect(csp.value).not.toContain("'unsafe-eval'");
      expect(csp.value).not.toMatch(/script-src[^;]*\*/);
    });
  });

  it('applies the headers at the server level, not inside a location block', () => {
    // Guards the inheritance assumption: nginx add_header is replace-not-merge,
    // so a future per-location add_header would silently drop this whole set.
    // Cut at the first real `location` directive (line-anchored, so the word
    // "location" inside a comment above does not count).
    const firstLocation = conf.search(/^\s*location\b/m);
    expect(firstLocation).toBeGreaterThan(-1);
    const serverHead = conf.slice(0, firstLocation);
    expect(serverHead).toMatch(/add_header\s+Content-Security-Policy/);
    expect(serverHead).toMatch(/add_header\s+Strict-Transport-Security/);
  });
});
