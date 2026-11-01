(function () {
  const { CATEGORIES, scoreCategory } = window.GeneralaRules;

  const BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt'
  ];

  const clientId = (() => {
    let id = sessionStorage.getItem('generala_client_id');
    if (!id) {
      id = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      sessionStorage.setItem('generala_client_id', id);
    }
    return id;
  })();

  let myName = localStorage.getItem('generala_name') || '';
  let currentRoomKey = '';
  let isHost = false;
  let joinedAt = 0;
  let mqttClients = [];
  let bcChannel = null;
  let hostDiscoveryTimer = null;
  let heartbeatTimer = null;
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

    const topic = getTopic(key);

    if ('BroadcastChannel' in window) {
      bcChannel = new BroadcastChannel(topic);
      bcChannel.onmessage = (ev) => handleRawMessage(ev.data);
    }

    if (window.mqtt) {
      BROKERS.forEach((url) => {
        try {
          const client = window.mqtt.connect(url, {
            keepalive: 30,
            connectTimeout: 6000,
            reconnectPeriod: 2000
          });
          client.on('connect', () => {
            callbacks.onConnectionChange(true);
            client.subscribe(topic, { qos: 0 }, () => {
              sendPacket({ type: 'HELLO', name: playerName, joinedAt });
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

    hostDiscoveryTimer = setTimeout(() => {
      if (!roomState) {
        becomeHost(key, playerName);
      }
    }, 950);

    heartbeatTimer = setInterval(() => {
      if (isHost && roomState) {
        sendPacket({ type: 'ROOM_STATE', state: roomState });
      } else if (currentRoomKey) {
        sendPacket({ type: 'HELLO', name: myName, joinedAt });
      }
    }, 3500);
  }

  function becomeHost(key, playerName) {
    isHost = true;
    roomState = createInitialRoomState(key, clientId, playerName);
    callbacks.onStateChange();
    sendPacket({ type: 'ROOM_STATE', state: roomState });
  }

  function disconnectRoom() {
    if (hostDiscoveryTimer) clearTimeout(hostDiscoveryTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    hostDiscoveryTimer = null;
    heartbeatTimer = null;

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

    if (msg.type === 'ROOM_STATE' && msg.state) {
      if (hostDiscoveryTimer) {
        clearTimeout(hostDiscoveryTimer);
        hostDiscoveryTimer = null;
      }
      if (isHost && msg.state.hostId !== clientId) {
        const theirPlayers = msg.state.players?.length || 0;
        const ourPlayers = roomState?.players?.length || 0;
        if (theirPlayers > ourPlayers || (theirPlayers === ourPlayers && msg.state.hostId < clientId)) {
          isHost = false;
        } else {
          mergePlayerIntoHost(msg.state.hostId, msg.state.players?.[0]?.name || 'Player');
          return;
        }
      }
      if (!isHost) {
        roomState = msg.state;
        const inList = roomState.players.some(p => p.id === clientId);
        if (!inList && roomState.status === 'lobby') {
          sendPacket({ type: 'HELLO', name: myName, joinedAt });
        }
        callbacks.onStateChange();
      }
      return;
    }

    if (msg.type === 'ROLL_ANIM') {
      callbacks.onRollAnim(msg.held);
      return;
    }

    if (msg.type === 'ACTION_CHAT') {
      appendChatMessage(msg.chatMsg);
      if (isHost) {
        broadcastHostState();
      }
      return;
    }

    if (!isHost || !roomState) return;

    if (msg.type === 'HELLO') {
      mergePlayerIntoHost(msg.senderId, msg.name || 'Player');
    } else if (msg.type === 'ACTION_TOGGLE_HOLD') {
      handleHostToggleHold(msg.senderId, msg.dieIndex);
    } else if (msg.type === 'ACTION_ROLL') {
      handleHostRoll(msg.senderId);
    } else if (msg.type === 'ACTION_SCORE') {
      handleHostScore(msg.senderId, msg.catId);
    } else if (msg.type === 'ACTION_LEAVE') {
      handleHostPlayerLeave(msg.senderId);
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

  function mergePlayerIntoHost(playerId, playerName) {
    if (!isHost || !roomState) return;
    const existing = roomState.players.find(p => p.id === playerId);
    if (existing) {
      existing.name = playerName || existing.name;
    } else if (roomState.status === 'lobby') {
      roomState.players.push({
        id: playerId,
        name: playerName || `Player ${roomState.players.length + 1}`,
        scores: {}
      });
    }
    broadcastHostState();
  }

  function handleHostPlayerLeave(playerId) {
    if (!isHost || !roomState) return;
    if (roomState.status === 'lobby') {
      roomState.players = roomState.players.filter(p => p.id !== playerId);
      broadcastHostState();
    }
  }

  function handleHostToggleHold(playerId, dieIndex) {
    const activePlayer = roomState.players[roomState.turnIndex];
    if (!activePlayer || activePlayer.id !== playerId) return;
    if (roomState.rollsUsed === 0 || roomState.rollsUsed >= 3) return;
    if (dieIndex < 0 || dieIndex > 4) return;
    roomState.held[dieIndex] = !roomState.held[dieIndex];
    broadcastHostState();
  }

  function handleHostRoll(playerId) {
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
      roomState.rollsUsed += 1;
      roomState.isServidaThrow = wasFirstThrow && allFiveRolled;
      roomState.dice = roomState.dice.map((val, idx) =>
        roomState.held[idx] ? val : Math.floor(Math.random() * 6) + 1
      );
      broadcastHostState();
    }, 320);
  }

  function handleHostScore(playerId, catId) {
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

    broadcastHostState();
  }

  function broadcastHostState() {
    if (!isHost || !roomState) return;
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
    broadcastHostState();
  }

  function sendToggleHold(dieIndex) {
    if (isHost) handleHostToggleHold(clientId, dieIndex);
    else sendPacket({ type: 'ACTION_TOGGLE_HOLD', dieIndex });
  }

  function sendRoll() {
    if (isHost) handleHostRoll(clientId);
    else sendPacket({ type: 'ACTION_ROLL' });
  }

  function sendScore(catId) {
    if (isHost) handleHostScore(clientId, catId);
    else sendPacket({ type: 'ACTION_SCORE', catId });
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
    sendPacket({ type: 'ACTION_CHAT', chatMsg });
    if (isHost) broadcastHostState();
  }

  function leaveRoom() {
    sendPacket({ type: 'ACTION_LEAVE' });
    disconnectRoom();
  }

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
