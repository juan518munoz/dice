(function () {
  const { CATEGORIES, scoreCategory } = window.GeneralaRules;

  const BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt'
  ];

  let clientId = (() => {
    const navEntry = performance.getEntriesByType?.('navigation')?.[0];
    const isReload = navEntry && navEntry.type === 'reload';
    let id = isReload ? sessionStorage.getItem('generala_client_id') : null;
    if (!id) {
      id = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      sessionStorage.setItem('generala_client_id', id);
    }
    return id;
  })();

  if ('BroadcastChannel' in window) {
    try {
      const idGuard = new BroadcastChannel('jm_dice_id_guard');
      const instanceToken = Math.random().toString(36).slice(2);
      idGuard.onmessage = (ev) => {
        const data = ev.data;
        if (!data || data.token === instanceToken) return;
        if (data.type === 'CLAIM' && data.clientId === clientId) {
          clientId = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
          sessionStorage.setItem('generala_client_id', clientId);
        }
      };
      idGuard.postMessage({ type: 'CLAIM', clientId, token: instanceToken });
    } catch (_) {}
  }

  let myName = localStorage.getItem('generala_name') || '';
  let currentRoomKey = '';
  let isHost = false;
  let joinedAt = 0;
  let mqttClients = [];
  let bcChannel = null;
  let hostDiscoveryTimer = null;
  let heartbeatTimer = null;
  let workerTicker = null;
  let lockAbortController = null;
  let isRollingAnim = false;
  const seenMsgIds = new Set();

  let roomState = null;

  const callbacks = {
    onStateChange: () => {},
    onConnectionChange: () => {},
    onRollAnim: () => {},
    onChatUpdate: () => {}
  };

  function createInitialRoomState(key, hostId, hostName) {
    return {
      roomKey: key,
      hostId: hostId,
      version: 1,
      status: 'lobby', // 'lobby' | 'playing' | 'finished'
      turnIndex: 0,
      rollsUsed: 0,
      isServidaThrow: false,
      dice: [1, 2, 3, 4, 5],
      held: [false, false, false, false, false],
      players: [
        { id: hostId, name: hostName, scores: {} }
      ],
      messages: [],
      updatedAt: Date.now()
    };
  }

  function getTopic(key) {
    return `jm-dice-generala-v1/room/${encodeURIComponent(key)}`;
  }

  function acquireWakeLock() {
    releaseWakeLock();
    if (navigator.locks && typeof navigator.locks.request === 'function') {
      try {
        lockAbortController = new AbortController();
        navigator.locks.request(
          'generala_room_' + clientId,
          { signal: lockAbortController.signal },
          () => new Promise(() => {})
        ).catch(() => {});
      } catch (_) {}
    }
  }

  function releaseWakeLock() {
    if (lockAbortController) {
      try { lockAbortController.abort(); } catch (_) {}
      lockAbortController = null;
    }
  }

  function startBackgroundTicker(fn, intervalMs) {
    stopBackgroundTicker();
    try {
      const blob = new Blob(
        [`setInterval(() => postMessage('tick'), ${intervalMs});`],
        { type: 'application/javascript' }
      );
      const url = URL.createObjectURL(blob);
      workerTicker = new Worker(url);
      workerTicker.onmessage = () => fn();
      URL.revokeObjectURL(url);
    } catch (_) {
      heartbeatTimer = setInterval(fn, intervalMs);
    }
  }

  function stopBackgroundTicker() {
    if (workerTicker) {
      try { workerTicker.terminate(); } catch (_) {}
      workerTicker = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function sendPacket(payload) {
    if (!currentRoomKey) return;
    const packet = {
      ...payload,
      msgId: Math.random().toString(36).slice(2) + Date.now().toString(36),
      senderId: clientId,
      roomKey: currentRoomKey
    };
    seenMsgIds.add(packet.msgId);
    const raw = JSON.stringify(packet);
    const topic = getTopic(currentRoomKey);

    if (bcChannel) {
      try { bcChannel.postMessage(raw); } catch (_) {}
    }
    mqttClients.forEach(c => {
      if (c && c.connected) {
        try { c.publish(topic, raw, { qos: 0 }); } catch (_) {}
      }
    });
  }

  function connectRoom(key, playerName) {
    disconnectRoom();
    myName = playerName;
    localStorage.setItem('generala_name', myName);
    currentRoomKey = key;
    joinedAt = Date.now();
    isHost = false;
    roomState = null;

    acquireWakeLock();

    const topic = getTopic(key);

    if ('BroadcastChannel' in window) {
      bcChannel = new BroadcastChannel(topic);
      bcChannel.onmessage = (ev) => handleRawMessage(ev.data);
    }

    if (window.mqtt) {
      BROKERS.forEach((url) => {
        try {
          const client = window.mqtt.connect(url, {
            keepalive: 120,
            connectTimeout: 6000,
            reconnectPeriod: 1500
          });
          client.on('connect', () => {
            callbacks.onConnectionChange(true);
            client.subscribe(topic, { qos: 0 }, () => {
              sendPacket({ type: 'HELLO', name: playerName, joinedAt });
              sendPacket({ type: 'SYNC_REQ' });
            });
          });
          client.on('message', (t, msg) => {
            if (t === topic) handleRawMessage(msg.toString());
          });
          mqttClients.push(client);
        } catch (_) {}
      });
    }

    sendPacket({ type: 'HELLO', name: playerName, joinedAt });
    sendPacket({ type: 'SYNC_REQ' });

    hostDiscoveryTimer = setTimeout(() => {
      if (!roomState) {
        becomeHost(key, playerName);
      }
    }, 950);

    startBackgroundTicker(() => {
      if (!currentRoomKey) return;
      if (roomState && isHost) {
        sendPacket({ type: 'ROOM_STATE', state: roomState });
      } else if (!roomState) {
        sendPacket({ type: 'HELLO', name: myName, joinedAt });
      }
    }, 3000);
  }

  function becomeHost(key, playerName) {
    isHost = true;
    roomState = createInitialRoomState(key, clientId, playerName);
    callbacks.onStateChange();
    sendPacket({ type: 'ROOM_STATE', state: roomState });
  }

  function disconnectRoom() {
    if (hostDiscoveryTimer) clearTimeout(hostDiscoveryTimer);
    hostDiscoveryTimer = null;
    stopBackgroundTicker();
    releaseWakeLock();

    if (bcChannel) {
      try { bcChannel.close(); } catch (_) {}
      bcChannel = null;
    }
    mqttClients.forEach(c => {
      try { c.end(true); } catch (_) {}
    });
    mqttClients = [];
    currentRoomKey = '';
    roomState = null;
    isHost = false;
  }

  function mergeMessages(existingMsgs, incomingMsgs) {
    const map = new Map();
    (existingMsgs || []).forEach(m => { if (m && m.id) map.set(m.id, m); });
    (incomingMsgs || []).forEach(m => { if (m && m.id) map.set(m.id, m); });
    return Array.from(map.values()).slice(-60);
  }

  function handleRawMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (_) {
      return;
    }
    if (!msg || !msg.msgId || seenMsgIds.has(msg.msgId)) return;
    if (msg.roomKey !== currentRoomKey) return;
    seenMsgIds.add(msg.msgId);

    if (msg.type === 'SYNC_REQ') {
      if (roomState) {
        sendPacket({ type: 'ROOM_STATE', state: roomState });
      }
      return;
    }

    if (msg.type === 'ROOM_STATE' && msg.state) {
      if (hostDiscoveryTimer) {
        clearTimeout(hostDiscoveryTimer);
        hostDiscoveryTimer = null;
      }

      const incoming = msg.state;
      const incVer = incoming.version || 1;
      const curVer = roomState?.version || 0;

      if (!roomState) {
        roomState = incoming;
        isHost = roomState.hostId === clientId;
        const inList = roomState.players.some(p => p.id === clientId);
        if (!inList && roomState.status === 'lobby') {
          sendPacket({ type: 'HELLO', name: myName, joinedAt });
        }
        callbacks.onStateChange();
        return;
      }

      // Resolve initial host tie-break if two clients created a room simultaneously
      if (isHost && incoming.hostId !== clientId && incVer <= 2 && curVer <= 2 && roomState.status === 'lobby') {
        const theirPlayers = incoming.players?.length || 0;
        const ourPlayers = roomState.players?.length || 0;
        if (theirPlayers > ourPlayers || (theirPlayers === ourPlayers && incoming.hostId < clientId)) {
          isHost = false;
          roomState = incoming;
          sendPacket({ type: 'HELLO', name: myName, joinedAt });
          callbacks.onStateChange();
          return;
        } else {
          mergePlayerIntoRoom(incoming.hostId, incoming.players?.[0]?.name || 'Player');
          return;
        }
      }

      // Accept any newer state version (or same version with newer messages/players)
      const mergedMessages = mergeMessages(roomState.messages, incoming.messages);
      const hasNewMessages = mergedMessages.length > (roomState.messages?.length || 0);

      if (incVer > curVer || (incVer === curVer && (incoming.updatedAt || 0) > (roomState.updatedAt || 0))) {
        roomState = {
          ...incoming,
          messages: mergedMessages
        };
        isHost = roomState.hostId === clientId;
        const inList = roomState.players.some(p => p.id === clientId);
        if (!inList && roomState.status === 'lobby') {
          sendPacket({ type: 'HELLO', name: myName, joinedAt });
        }
        callbacks.onStateChange();
      } else if (hasNewMessages) {
        roomState.messages = mergedMessages;
        callbacks.onChatUpdate();
      }
      return;
    }

    if (msg.type === 'ROLL_ANIM') {
      callbacks.onRollAnim(msg.held);
      return;
    }

    if (msg.type === 'ACTION_CHAT') {
      appendChatMessage(msg.chatMsg);
      return;
    }

    if (!roomState) return;

    if (msg.type === 'HELLO') {
      mergePlayerIntoRoom(msg.senderId, msg.name || 'Player');
    } else if (msg.type === 'ACTION_TOGGLE_HOLD') {
      if (isHost) executeToggleHold(msg.senderId, msg.dieIndex);
    } else if (msg.type === 'ACTION_ROLL') {
      if (isHost) executeRoll(msg.senderId);
    } else if (msg.type === 'ACTION_SCORE') {
      if (isHost) executeScore(msg.senderId, msg.catId);
    } else if (msg.type === 'ACTION_LEAVE') {
      handlePlayerLeave(msg.senderId);
    }
  }

  function appendChatMessage(chatMsg) {
    if (!roomState || !chatMsg || !chatMsg.id) return;
    if (!Array.isArray(roomState.messages)) roomState.messages = [];
    if (roomState.messages.some(m => m.id === chatMsg.id)) return;
    roomState.messages.push(chatMsg);
    if (roomState.messages.length > 60) {
      roomState.messages = roomState.messages.slice(-60);
    }
    callbacks.onChatUpdate();
  }

  function mergePlayerIntoRoom(playerId, playerName) {
    if (!roomState) return;
    const existing = roomState.players.find(p => p.id === playerId);
    let changed = false;
    if (existing) {
      if (playerName && existing.name !== playerName) {
        existing.name = playerName;
        changed = true;
      }
    } else if (roomState.status === 'lobby') {
      roomState.players.push({
        id: playerId,
        name: playerName || `Player ${roomState.players.length + 1}`,
        scores: {}
      });
      changed = true;
    }
    if (changed || isHost) {
      broadcastRoomState(changed);
    }
  }

  function handlePlayerLeave(playerId) {
    if (!roomState) return;
    if (roomState.status === 'lobby') {
      const before = roomState.players.length;
      roomState.players = roomState.players.filter(p => p.id !== playerId);
      if (roomState.players.length !== before) {
        if (roomState.hostId === playerId && roomState.players[0]) {
          roomState.hostId = roomState.players[0].id;
          isHost = roomState.hostId === clientId;
        }
        broadcastRoomState(true);
      }
    }
  }

  function executeToggleHold(playerId, dieIndex) {
    if (!roomState) return;
    const activePlayer = roomState.players[roomState.turnIndex];
    if (!activePlayer || activePlayer.id !== playerId) return;
    if (roomState.rollsUsed === 0 || roomState.rollsUsed >= 3) return;
    if (dieIndex < 0 || dieIndex > 4) return;
    roomState.held[dieIndex] = !roomState.held[dieIndex];
    broadcastRoomState(true);
  }

  function executeRoll(playerId) {
    if (!roomState) return;
    const activePlayer = roomState.players[roomState.turnIndex];
    if (!activePlayer || activePlayer.id !== playerId) return;
    if (roomState.rollsUsed >= 3 || isRollingAnim) return;

    if (roomState.held.every(Boolean)) {
      roomState.held = [false, false, false, false, false];
    }

    const wasFirstThrow = roomState.rollsUsed === 0;
    const allFiveRolled = roomState.held.every(h => !h);

    sendPacket({ type: 'ROLL_ANIM', held: roomState.held });
    callbacks.onRollAnim(roomState.held);

    setTimeout(() => {
      if (!roomState) return;
      roomState.rollsUsed += 1;
      roomState.isServidaThrow = wasFirstThrow && allFiveRolled;
      roomState.dice = roomState.dice.map((val, idx) =>
        roomState.held[idx] ? val : Math.floor(Math.random() * 6) + 1
      );
      broadcastRoomState(true);
    }, 320);
  }

  function executeScore(playerId, catId) {
    if (!roomState) return;
    const activePlayer = roomState.players[roomState.turnIndex];
    if (!activePlayer || activePlayer.id !== playerId) return;
    if (roomState.rollsUsed === 0) return;
    if (activePlayer.scores[catId] !== undefined) return;

    const pts = scoreCategory(catId, roomState.dice, roomState.rollsUsed, roomState.isServidaThrow);
    activePlayer.scores[catId] = pts;

    const allDone = roomState.players.every(p =>
      CATEGORIES.every(c => p.scores[c.id] !== undefined)
    );

    if (allDone) {
      roomState.status = 'finished';
    } else {
      roomState.turnIndex = (roomState.turnIndex + 1) % roomState.players.length;
      roomState.rollsUsed = 0;
      roomState.isServidaThrow = false;
      roomState.held = [false, false, false, false, false];
    }

    broadcastRoomState(true);
  }

  function broadcastRoomState(incrementVersion) {
    if (!roomState) return;
    if (incrementVersion) {
      roomState.version = (roomState.version || 1) + 1;
    }
    roomState.updatedAt = Date.now();
    callbacks.onStateChange();
    sendPacket({ type: 'ROOM_STATE', state: roomState });
  }

  function startOrResetMatch() {
    if (!isHost || !roomState) return;
    roomState.status = 'playing';
    roomState.turnIndex = 0;
    roomState.rollsUsed = 0;
    roomState.isServidaThrow = false;
    roomState.held = [false, false, false, false, false];
    roomState.players.forEach(p => { p.scores = {}; });
    broadcastRoomState(true);
  }

  // Active player executes turn actions directly in their foreground tab and broadcasts ROOM_STATE
  function sendToggleHold(dieIndex) {
    executeToggleHold(clientId, dieIndex);
  }

  function sendRoll() {
    executeRoll(clientId);
  }

  function sendScore(catId) {
    executeScore(clientId, catId);
  }

  function sendChat(text) {
    if (!text || !roomState) return;
    const chatMsg = {
      id: 'm_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      senderId: clientId,
      senderName: myName || 'Player',
      text
    };
    appendChatMessage(chatMsg);
    roomState.version = (roomState.version || 1) + 1;
    roomState.updatedAt = Date.now();
    sendPacket({ type: 'ACTION_CHAT', chatMsg });
    sendPacket({ type: 'ROOM_STATE', state: roomState });
  }

  function leaveRoom() {
    sendPacket({ type: 'ACTION_LEAVE' });
    disconnectRoom();
  }

  // Re-sync immediately when tab visibility or window focus changes
  function onWakeOrFocus() {
    if (!currentRoomKey) return;
    mqttClients.forEach(c => {
      if (c && !c.connected && typeof c.reconnect === 'function') {
        try { c.reconnect(); } catch (_) {}
      }
    });
    sendPacket({ type: 'SYNC_REQ' });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) onWakeOrFocus();
  });
  window.addEventListener('focus', onWakeOrFocus);

  window.GeneralaNet = {
    get clientId() { return clientId; },
    get myName() { return myName; },
    get currentRoomKey() { return currentRoomKey; },
    get isHost() { return isHost; },
    get roomState() { return roomState; },
    get isRollingAnim() { return isRollingAnim; },
    set isRollingAnim(val) { isRollingAnim = Boolean(val); },
    on(event, fn) { callbacks[event] = fn; },
    connectRoom,
    leaveRoom,
    startOrResetMatch,
    sendToggleHold,
    sendRoll,
    sendScore,
    sendChat
  };
})();
