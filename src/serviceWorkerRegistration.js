// Registers the production service worker (issue #157 / StoreReadiness A1).
// Kept in its own module so the registration guard is unit-testable.

export function registerServiceWorker() {
  if (process.env.NODE_ENV !== 'production') return Promise.resolve(null);
  if (typeof navigator === 'undefined') return Promise.resolve(null);

  const registration = navigator.serviceWorker;
  if (!registration || typeof registration.register !== 'function') {
    return Promise.resolve(null);
  }

  return registration.register('/service-worker.js', { scope: '/' }).catch((error) => {
    // A failed registration must never break the app — it only costs
    // installability/offline support.
    // eslint-disable-next-line no-console
    console.warn('Service worker registration failed:', error);
    return null;
  });
}

export default registerServiceWorker;
