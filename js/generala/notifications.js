(function () {
  let enabled = localStorage.getItem('generala_notifications') !== 'off';
  let soundEnabled = localStorage.getItem('generala_sound') !== 'off';
  let audioCtx = null;
  const baseTitle = document.title || 'Dice';
  let titleTimer = null;

  function unlockAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      if (!audioCtx) {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    } catch (_) {}
  }

  ['click', 'touchstart', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, unlockAudio, { passive: true, once: false });
  });

  function playAlertTone() {
    if (!soundEnabled) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      if (!audioCtx) audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      const now = audioCtx.currentTime;
      const notes = [587.33, 880]; // D5 -> A5 gentle chime
      notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.11);
        gain.gain.setValueAtTime(0.0001, now + i * 0.11);
        gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.11 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.11 + 0.24);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + i * 0.11);
        osc.stop(now + i * 0.11 + 0.25);
      });
    } catch (_) {}
  }

  function flashTitle(alertText) {
    if (document.hasFocus && document.hasFocus() && !document.hidden) return;
    if (titleTimer) clearInterval(titleTimer);
    let toggle = true;
    document.title = `🔔 ${alertText}`;
    titleTimer = setInterval(() => {
      if (document.hasFocus && document.hasFocus() && !document.hidden) {
        clearTitleFlash();
        return;
      }
      document.title = toggle ? `🔔 ${alertText}` : baseTitle;
      toggle = !toggle;
    }, 1200);
  }

  function clearTitleFlash() {
    if (titleTimer) {
      clearInterval(titleTimer);
      titleTimer = null;
    }
    document.title = baseTitle;
  }

  window.addEventListener('focus', clearTitleFlash);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) clearTitleFlash();
  });

  function isSupported() {
    return 'Notification' in window;
  }

  function getPermission() {
    if (!isSupported()) return 'unsupported';
    return Notification.permission;
  }

  function getStatusLabel() {
    return '⚙ Settings';
  }

  function needsPermissionPrompt() {
    return enabled && isSupported() && Notification.permission === 'default';
  }

  async function requestPermission() {
    unlockAudio();
    if (!isSupported()) return 'unsupported';
    if (Notification.permission === 'granted') {
      return 'granted';
    }
    if (Notification.permission === 'denied') {
      return 'denied';
    }
    try {
      const res = await Notification.requestPermission();
      if (res === 'granted') {
        enabled = true;
        localStorage.setItem('generala_notifications', 'on');
        sendSystemNotification(
          'Notifications Enabled',
          "You'll receive alerts on your turn and new chat messages.",
          'generala-enabled'
        );
      }
      syncSettingsModalUI();
      return res;
    } catch (_) {
      syncSettingsModalUI();
      return Notification.permission;
    }
  }

  async function setNotificationsEnabled(nextState) {
    unlockAudio();
    enabled = Boolean(nextState);
    localStorage.setItem('generala_notifications', enabled ? 'on' : 'off');
    if (enabled) {
      if (isSupported() && Notification.permission === 'default') {
        await requestPermission();
      } else if (isSupported() && Notification.permission === 'granted') {
        sendSystemNotification(
          'Notifications On',
          'System notifications are active.',
          'generala-toggle'
        );
      }
      showToast('Notifications On', 'Turn and chat notifications are active.');
    } else {
      clearTitleFlash();
      showToast('Notifications Off', 'All notifications are muted.');
    }
    syncSettingsModalUI();
    return enabled;
  }

  function setSoundEnabled(nextState) {
    unlockAudio();
    soundEnabled = Boolean(nextState);
    localStorage.setItem('generala_sound', soundEnabled ? 'on' : 'off');
    if (soundEnabled) {
      playAlertTone();
      showToast('Sound On', 'Notification chime enabled.');
    } else {
      showToast('Sound Off', 'Notification chime muted (banners remain active).');
    }
    syncSettingsModalUI();
    return soundEnabled;
  }

  function ensureSettingsModal() {
    let modal = document.getElementById('modal-settings');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'modal-backdrop hidden';
    modal.id = 'modal-settings';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="modal-card settings-modal-card">
        <h2 class="modal-title">Settings</h2>

        <div class="settings-list">
          <div class="settings-item">
            <div class="settings-info">
              <span class="settings-label">Notifications</span>
              <span class="settings-desc" id="settings-notify-sub">Turn &amp; chat banners</span>
            </div>
            <button type="button" class="btn-setting-toggle" id="btn-toggle-notifications">ON</button>
          </div>

          <div class="settings-item">
            <div class="settings-info">
              <span class="settings-label">Notification Sound</span>
              <span class="settings-desc" id="settings-sound-sub">Chime on alerts</span>
            </div>
            <button type="button" class="btn-setting-toggle" id="btn-toggle-sound">ON</button>
          </div>
        </div>

        <button type="button" class="btn-primary" id="btn-close-settings">Done</button>
      </div>
    `;

    document.body.appendChild(modal);

    const btnToggleNotify = modal.querySelector('#btn-toggle-notifications');
    const btnToggleSound = modal.querySelector('#btn-toggle-sound');
    const btnClose = modal.querySelector('#btn-close-settings');

    btnToggleNotify.addEventListener('click', () => {
      if (enabled && isSupported() && Notification.permission === 'default') {
        requestPermission();
      } else {
        setNotificationsEnabled(!enabled);
      }
    });

    btnToggleSound.addEventListener('click', () => {
      setSoundEnabled(!soundEnabled);
    });

    btnClose.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    return modal;
  }

  function syncSettingsModalUI() {
    const modal = document.getElementById('modal-settings');
    if (!modal) return;

    const btnToggleNotify = modal.querySelector('#btn-toggle-notifications');
    const btnToggleSound = modal.querySelector('#btn-toggle-sound');
    const notifySub = modal.querySelector('#settings-notify-sub');
    const soundSub = modal.querySelector('#settings-sound-sub');

    if (btnToggleNotify) {
      const needPerm = enabled && isSupported() && Notification.permission === 'default';
      btnToggleNotify.textContent = needPerm ? 'ALLOW OS' : (enabled ? 'ON' : 'OFF');
      btnToggleNotify.classList.toggle('is-on', enabled);
      btnToggleNotify.classList.toggle('is-off', !enabled);
    }

    if (notifySub) {
      if (!enabled) {
        notifySub.textContent = 'All alerts muted';
      } else if (!isSupported()) {
        notifySub.textContent = 'In-app toast alerts active';
      } else if (Notification.permission === 'granted') {
        notifySub.textContent = 'System & in-app banners active';
      } else if (Notification.permission === 'default') {
        notifySub.textContent = 'Tap ALLOW OS for background banners';
      } else {
        notifySub.textContent = 'In-app active (OS blocked in browser)';
      }
    }

    if (btnToggleSound) {
      btnToggleSound.textContent = soundEnabled ? 'ON' : 'OFF';
      btnToggleSound.classList.toggle('is-on', soundEnabled);
      btnToggleSound.classList.toggle('is-off', !soundEnabled);
    }

    if (soundSub) {
      soundSub.textContent = soundEnabled ? 'Audio chime enabled' : 'Silent notifications';
    }
  }

  function openSettings() {
    unlockAudio();
    const modal = ensureSettingsModal();
    syncSettingsModalUI();
    modal.classList.remove('hidden');
    return Promise.resolve(getStatusLabel());
  }

  // Keep toggleEnabled mapped to openSettings so clicking any Settings/Alerts button opens the Settings dialog
  function toggleEnabled() {
    return openSettings();
  }

  function isActive() {
    return enabled;
  }

  function isSoundActive() {
    return soundEnabled;
  }

  function sendSystemNotification(title, body, tag) {
    if (!isSupported() || Notification.permission !== 'granted') return;

    let iconUrl = 'assets/notify-icon.png';
    let badgeUrl = 'assets/notify-badge.png';
    try {
      iconUrl = new URL('assets/notify-icon.png', window.location.href).href;
      badgeUrl = new URL('assets/notify-badge.png', window.location.href).href;
    } catch (_) {}

    const uniqueTag = (tag || 'generala-alert') + '-' + Date.now();
    const options = {
      body,
      tag: uniqueTag,
      icon: iconUrl,
      badge: badgeUrl,
      silent: !soundEnabled
    };

    let shownNatively = false;
    try {
      const n = new Notification(title, options);
      n.onclick = () => {
        window.focus();
        n.close();
      };
      shownNatively = true;
    } catch (_) {
      shownNatively = false;
    }

    if (!shownNatively && 'serviceWorker' in navigator) {
      const swPromise = navigator.serviceWorker.ready || navigator.serviceWorker.getRegistration();
      Promise.resolve(swPromise).then((reg) => {
        if (reg && typeof reg.showNotification === 'function') {
          reg.showNotification(title, options).catch(() => {});
        }
      }).catch(() => {});
    }
  }

  function notify(title, body, tag) {
    if (!enabled) return;

    if (navigator.vibrate) {
      try { navigator.vibrate([100, 50, 100]); } catch (_) {}
    }

    playAlertTone();
    showToast(title, body);
    flashTitle(title);
    sendSystemNotification(title, body, tag);
  }

  let toastTimeout = null;
  function showToast(title, body) {
    const toast = document.getElementById('notify-toast');
    const toastTitle = document.getElementById('notify-toast-title');
    const toastBody = document.getElementById('notify-toast-body');
    if (!toast || !toastTitle || !toastBody) return;

    toastTitle.textContent = title;
    toastBody.textContent = body;
    toast.classList.add('visible');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
    }, 4000);
  }

  window.GeneralaNotify = {
    isSupported,
    getPermission,
    getStatusLabel,
    needsPermissionPrompt,
    isActive,
    isSoundActive,
    requestPermission,
    openSettings,
    toggleEnabled,
    setNotificationsEnabled,
    setSoundEnabled,
    notify
  };
})();
