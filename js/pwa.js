(function () {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.protocol === 'http:')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        try { reg.update(); } catch (_) {}
      }).catch(() => {});
    });
  }

  const installBar = document.getElementById('pwa-install-bar');
  const btnInstall = document.getElementById('btn-install-pwa');

  if (!installBar || !btnInstall) return;

  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function isMobileDevice() {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
      return navigator.userAgentData.mobile;
    }
    const ua = navigator.userAgent || '';
    const isTouchMac = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
    return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile/i.test(ua) || isTouchMac;
  }

  let deferredPrompt = window.__deferredPwaPrompt || null;

  function revealInstallBarIfEligible() {
    if (deferredPrompt && isMobileDevice() && !isStandalone()) {
      installBar.classList.add('visible');
    }
  }

  revealInstallBarIfEligible();

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.__deferredPwaPrompt = e;
    revealInstallBarIfEligible();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installBar.classList.remove('visible');
  });

  btnInstall.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') {
      installBar.classList.remove('visible');
    }
  });
})();
