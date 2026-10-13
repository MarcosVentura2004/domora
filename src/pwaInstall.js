// Captures `beforeinstallprompt` as early as possible (it can fire before the
// Settings screen mounts) so "Instalar app" can trigger it later.
// preventDefault() is NOT called: the browser's own install UI keeps working.

let deferredPrompt = null;
let installed = false;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    deferredPrompt = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true
  );
}

export function isIOS() {
  const ua = window.navigator.userAgent || '';
  // iPadOS 13+ reports itself as "Macintosh" but has touch.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function getInstallState() {
  if (installed || isStandalone()) return 'installed';
  if (deferredPrompt) return 'prompt';
  if (isIOS()) return 'ios';
  return 'unavailable';
}

export function subscribeToInstall(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  const promptEvent = deferredPrompt;
  deferredPrompt = null; // the event can only be used once
  promptEvent.prompt();
  const { outcome } = await promptEvent.userChoice;
  if (outcome === 'accepted') installed = true;
  notify();
  return outcome === 'accepted';
}
