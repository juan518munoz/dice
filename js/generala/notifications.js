(function () {
  let enabled = localStorage.getItem('generala_notifications') !== 'off';
  let audioCtx = null;
  const baseTitle = document.title || 'Generala — Dice';
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
    if (!enabled) return 'Alerts: Off';
    if (!isSupported()) return 'Alerts: Audio Only';
    if (Notification.permission === 'default') return 'Enable OS Alerts';
    if (Notification.permission === 'denied') return 'OS Alerts Blocked';
    return 'Alerts: On';
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
          'Generala Alerts Enabled',
          "You'll receive macOS/system banners when it's your turn or someone chats.",
          'generala-enabled'
        );
      }
      return res;
    } catch (_) {
      return Notification.permission;
    }
  }

  async function toggleEnabled() {
    unlockAudio();
    if (isSupported() && Notification.permission === 'default') {
      const res = await requestPermission();
      if (res === 'granted') {
        enabled = true;
        localStorage.setItem('generala_notifications', 'on');
      }
      return getStatusLabel();
    }
    if (isSupported() && Notification.permission === 'denied') {
      showToast(
        'Browser Notifications Blocked',
        'Allow notifications for this site in your browser address bar & macOS System Settings > Notifications.'
      );
      return getStatusLabel();
    }
    enabled = !enabled;
    localStorage.setItem('generala_notifications', enabled ? 'on' : 'off');
    if (enabled) {
      sendSystemNotification(
        'Generala Alerts On',
        "System notifications are active for this lobby.",
        'generala-toggle'
      );
    } else {
      clearTitleFlash();
    }
    return getStatusLabel();
  }

  function isActive() {
    return enabled;
  }

  function sendSystemNotification(title, body, tag) {
    if (!isSupported() || Notification.permission !== 'granted') return;

    let iconUrl = 'assets/icon-192.png';
    try {
      iconUrl = new URL('assets/icon-192.png', window.location.href).href;
    } catch (_) {}

    const uniqueTag = (tag || 'generala-alert') + '-' + Date.now();
    const options = {
      body,
      tag: uniqueTag,
      icon: iconUrl,
      badge: iconUrl
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
      navigator.serviceWorker.getRegistration().then((reg) => {
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
    requestPermission,
    toggleEnabled,
    notify
  };
})();
