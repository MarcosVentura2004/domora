// iOS Safari doesn't shrink the layout viewport when the keyboard opens, so
// fixed bottom sheets end up hidden behind it. Expose the visible area as CSS
// variables (--vv-top, --vv-height) so .modal-overlay can track it.
function syncVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const style = document.documentElement.style;
  style.setProperty('--vv-height', `${vv.height}px`);
  style.setProperty('--vv-top', `${vv.offsetTop}px`);
}

if (typeof window !== 'undefined' && window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncVisualViewport);
  window.visualViewport.addEventListener('scroll', syncVisualViewport);
  syncVisualViewport();
}
