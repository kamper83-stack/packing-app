import { registerServiceWorker } from './serviceWorkerRegistration';

describe('service worker registration', () => {
  const originalEnv = process.env.NODE_ENV;

  const defineServiceWorker = (value) => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value,
      configurable: true,
      writable: true,
    });
  };

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    delete navigator.serviceWorker;
  });

  it('does not register outside production builds', async () => {
    process.env.NODE_ENV = 'test';
    const register = jest.fn();
    defineServiceWorker({ register });

    await expect(registerServiceWorker()).resolves.toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it('registers /service-worker.js with root scope in production', async () => {
    process.env.NODE_ENV = 'production';
    const registration = { scope: '/' };
    const register = jest.fn().mockResolvedValue(registration);
    defineServiceWorker({ register });

    await expect(registerServiceWorker()).resolves.toBe(registration);
    expect(register).toHaveBeenCalledWith('/service-worker.js', { scope: '/' });
  });

  it('resolves null when service workers are unsupported', async () => {
    process.env.NODE_ENV = 'production';
    defineServiceWorker(undefined);

    await expect(registerServiceWorker()).resolves.toBeNull();
  });

  it('swallows registration errors instead of breaking the app', async () => {
    process.env.NODE_ENV = 'production';
    const register = jest.fn().mockRejectedValue(new Error('offline'));
    defineServiceWorker({ register });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(registerServiceWorker()).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
