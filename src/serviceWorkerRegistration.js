// Registers /service-worker.js (built from src/service-worker.js) and exposes
// "new version waiting" to the UI. Never reloads the page on its own: a reload
// only happens after the user taps "Actualizar" (applyUpdate).

const SW_URL = `${process.env.PUBLIC_URL}/service-worker.js`;
const LEGACY_SW_PATH = '/sw.js';
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

let waitingWorker = null;
let userRequestedReload = false;
const listeners = new Set();

function setWaiting(worker) {
  waitingWorker = worker;
  listeners.forEach((listener) => listener(Boolean(worker)));
}

function isLegacyController() {
  const controller = navigator.serviceWorker.controller;
  return Boolean(controller && new URL(controller.scriptURL).pathname === LEGACY_SW_PATH);
}

function handleWaiting(worker) {
  if (!worker) return;
  if (!navigator.serviceWorker.controller) return; // first install: nothing to update
  if (isLegacyController()) {
    // Old hand-written /sw.js: the page already runs the latest code, so the
    // new worker can take over silently. No reload.
    worker.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  setWaiting(worker);
}

function trackInstalling(registration, installing) {
  if (!installing) return;
  installing.addEventListener('statechange', () => {
    if (installing.state === 'installed') handleWaiting(registration.waiting || installing);
  });
}

function watchRegistration(registration) {
  if (registration.waiting) handleWaiting(registration.waiting);
  trackInstalling(registration, registration.installing);

  registration.addEventListener('updatefound', () => {
    trackInstalling(registration, registration.installing);
  });

  // Installed apps can stay open for days: check for a new version when the
  // user comes back to the app, at most every 30 minutes.
  let lastCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
    lastCheck = Date.now();
    registration.update().catch(() => {});
  });
}

export function register() {
  if (process.env.NODE_ENV !== 'production') return;
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!userRequestedReload) return;
    userRequestedReload = false;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(SW_URL)
      .then(watchRegistration)
      .catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
  });
}

export function subscribeToUpdates(listener) {
  listeners.add(listener);
  listener(Boolean(waitingWorker));
  return () => listeners.delete(listener);
}

export function applyUpdate() {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  userRequestedReload = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  // Safety net in case controllerchange never fires.
  setTimeout(() => {
    if (userRequestedReload) window.location.reload();
  }, 4000);
}
