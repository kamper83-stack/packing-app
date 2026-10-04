const fs = require('fs');
const path = require('path');

// Contract tests for the production service worker (public/service-worker.js).
// The worker is not a module, so we assert on its source: the rules that keep
// user data out of the cache and keep the app shell available offline.
describe('public/service-worker.js contract', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'public', 'service-worker.js'),
    'utf8'
  );

  it('never serves API responses from cache', () => {
    expect(source).toContain("startsWith('/api/')");
    expect(source).toContain('isApiRequest');
    // The API branch must bail out before any respondWith() call, so no API
    // response is ever stored or replayed from the cache.
    const apiBranch = source.slice(source.indexOf('function isApiRequest'));
    expect(apiBranch).toMatch(/if \(isApiRequest\(url\)\) return;/);
  });

  it('precaches the app shell so the app opens offline', () => {
    expect(source).toContain('cache.addAll');
    expect(source).toContain("'/index.html'");
    expect(source).toContain('caches.match');
  });

  it('drops stale cache versions on activate', () => {
    expect(source).toContain('caches.delete');
    expect(source).toContain('const VERSION');
  });

  it('only handles GET requests from the same origin', () => {
    expect(source).toContain("request.method !== 'GET'");
    expect(source).toContain('url.origin !== self.location.origin');
  });
});
