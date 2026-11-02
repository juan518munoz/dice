(function () {
  const {
    dealHands,
    compareCards,
    formatCardName,
    getEnvidoScore,
    resolveEnvidoWinner,
    getFaltaEnvidoPoints,
    getEnvidoCallLabel,
    getEnvidoChainInfo,
    getAvailableEnvidoRaises,
    getTrucoCallLabel,
    evaluateHandOutcome
  } = window.TrucoRules;

  const BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt'
  ];

  let clientId = (() => {
    const navEntry = performance.getEntriesByType?.('navigation')?.[0];
    const isReload = navEntry && navEntry.type === 'reload';
    let id = isReload ? sessionStorage.getItem('truco_client_id') : null;
    if (!id) {
      id = 't_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      sessionStorage.setItem('truco_client_id', id);
    }
    return id;
  })();

  if ('BroadcastChannel' in window) {
    try {
      const idGuard = new BroadcastChannel('jm_truco_id_guard');
      const instanceToken = Math.random().toString(36).slice(2);
      idGuard.onmessage = (ev) => {
        const data = ev.data;
        if (!data || data.token === instanceToken) return;
        if (data.type === 'CLAIM' && data.clientId === clientId) {
          clientId = 't_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
          sessionStorage.setItem('truco_client_id', clientId);
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
  const seenMsgIds = new Set();

  let roomState = null;

  const callbacks = {
    onStateChange: () => {},
    onConnectionChange: () => {},
    onChatUpdate: () => {}
  };

  function createEmptyTricks(manoIdx) {
    return [
      { c0: null, c1: null, firstIdx: manoIdx, winner: null },
      { c0: null, c1: null, firstIdx: manoIdx, winner: null },
      { c0: null, c1: null, firstIdx: manoIdx, winner: null }
    ];
  }

  function createInitialRoomState(key, hostId, hostName) {
    return {
      roomKey: key,
      hostId: hostId,
      version: 1,
      status: 'lobby', // 'lobby' | 'playing' | 'hand_end' | 'finished'
      players: [
        { id: hostId, name: hostName, score: 0 }
      ],
      handNumber: 1,
      manoIndex: 0,
      turnIndex: 0,
      trickIndex: 0,
      hands: [[], []],
      remainingCards: [[], []],
      tricks: createEmptyTricks(0),
      envidoUsed: false,
      envidoResultBanner: '',
      envidoResolution: null,
      trucoLevel: 0,
      trucoPoints: 1,
      trucoOwnerIdx: null,
      pendingCall: null,
      lastActionBanner: '',
      lastSpeech: null,
      playerSpeeches: [null, null],
      lastPointEvent: null,
      handSummary: null,
      messages: [],
      updatedAt: Date.now()
    };
  }

  function getTopic(key) {
    return `jm-dice-truco-v1/room/${encodeURIComponent(key)}`;
  }

  function acquireWakeLock() {
    releaseWakeLock();
    if (navigator.locks && typeof navigator.locks.request === 'function') {
      try {
        lockAbortController = new AbortController();
        navigator.locks.request(
          'truco_room_' + clientId,
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
    mqttClients.forEach((c) => {
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
    mqttClients.forEach((c) => {
      try { c.end(true); } catch (_) {}
    });
    mqttClients = [];
    currentRoomKey = '';
    roomState = null;
    isHost = false;
  }

  function mergeMessages(existingMsgs, incomingMsgs) {
    const map = new Map();
    (existingMsgs || []).forEach((m) => { if (m && m.id) map.set(m.id, m); });
    (incomingMsgs || []).forEach((m) => { if (m && m.id) map.set(m.id, m); });
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
        const inList = roomState.players.some((p) => p.id === clientId);
        if (!inList && roomState.status === 'lobby' && roomState.players.length < 2) {
          sendPacket({ type: 'HELLO', name: myName, joinedAt });
        }
        callbacks.onStateChange();
        return;
      }

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

      const mergedMessages = mergeMessages(roomState.messages, incoming.messages);
      const hasNewMessages = mergedMessages.length > (roomState.messages?.length || 0);

      if (incVer > curVer || (incVer === curVer && (incoming.updatedAt || 0) > (roomState.updatedAt || 0))) {
        roomState = {
          ...incoming,
          messages: mergedMessages
        };
        isHost = roomState.hostId === clientId;
        const inList = roomState.players.some((p) => p.id === clientId);
        if (!inList && roomState.status === 'lobby' && roomState.players.length < 2) {
          sendPacket({ type: 'HELLO', name: myName, joinedAt });
        }
        callbacks.onStateChange();
      } else if (hasNewMessages) {
        roomState.messages = mergedMessages;
        callbacks.onChatUpdate();
      }
      return;
    }

    if (msg.type === 'ACTION_CHAT') {
      appendChatMessage(msg.chatMsg);
      return;
    }

    if (!roomState) return;

    if (msg.type === 'HELLO') {
      mergePlayerIntoRoom(msg.senderId, msg.name || 'Player');
    } else if (msg.type === 'ACTION_LEAVE') {
      handlePlayerLeave(msg.senderId);
    }
  }

  function appendChatMessage(chatMsg) {
    if (!roomState || !chatMsg || !chatMsg.id) return;
    if (!Array.isArray(roomState.messages)) roomState.messages = [];
    if (roomState.messages.some((m) => m.id === chatMsg.id)) return;
    roomState.messages.push(chatMsg);
    if (roomState.messages.length > 60) {
      roomState.messages = roomState.messages.slice(-60);
    }
    callbacks.onChatUpdate();
  }

  function mergePlayerIntoRoom(playerId, playerName) {
    if (!roomState) return;
    const existing = roomState.players.find((p) => p.id === playerId);
    let changed = false;
    if (existing) {
      if (playerName && existing.name !== playerName) {
        existing.name = playerName;
        changed = true;
      }
    } else if (roomState.status === 'lobby' && roomState.players.length < 2) {
      roomState.players.push({
        id: playerId,
        name: playerName || 'Player 2',
        score: 0
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
      roomState.players = roomState.players.filter((p) => p.id !== playerId);
      if (roomState.players.length !== before) {
        if (roomState.hostId === playerId && roomState.players[0]) {
          roomState.hostId = roomState.players[0].id;
          isHost = roomState.hostId === clientId;
        }
        broadcastRoomState(true);
      }
    }
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

  function getMyPlayerIndex() {
    if (!roomState || !Array.isArray(roomState.players)) return -1;
    return roomState.players.findIndex((p) => p.id === clientId);
  }

  function setupNewHand(manoIdx, handNum) {
    const dealt = dealHands();
    roomState.status = 'playing';
    roomState.handNumber = handNum;
    roomState.manoIndex = manoIdx;
    roomState.turnIndex = manoIdx;
    roomState.trickIndex = 0;
    roomState.hands = [
      dealt[0].map((c) => ({ ...c })),
      dealt[1].map((c) => ({ ...c }))
    ];
    roomState.remainingCards = [
      dealt[0].map((c) => ({ ...c })),
      dealt[1].map((c) => ({ ...c }))
    ];
    roomState.tricks = createEmptyTricks(manoIdx);
    roomState.envidoUsed = false;
    roomState.envidoResultBanner = '';
    roomState.envidoResolution = null;
    roomState.trucoLevel = 0;
    roomState.trucoPoints = 1;
    roomState.trucoOwnerIdx = null;
    roomState.pendingCall = null;
    roomState.handSummary = null;
    roomState.lastPointEvent = null;
    const manoName = roomState.players[manoIdx]?.name || 'Jugador';
    roomState.lastActionBanner = `Mano #${handNum} — ${manoName} es mano.`;
    roomState.lastSpeech = null;
    roomState.playerSpeeches = [null, null];
  }

  function startOrResetMatch() {
    if (!roomState || roomState.players.length < 2) return;
    roomState.players.forEach((p) => { p.score = 0; });
    setupNewHand(0, 1);
    broadcastRoomState(true);
  }

  function nextHand() {
    if (!roomState || roomState.status !== 'hand_end') return;
    const nextMano = 1 - roomState.manoIndex;
    setupNewHand(nextMano, (roomState.handNumber || 1) + 1);
    broadcastRoomState(true);
  }

  function addPointsAndCheckWin(playerIdx, pts, sourceLabel = '') {
    const p = roomState.players[playerIdx];
    if (!p) return false;
    p.score = Math.min(30, (p.score || 0) + pts);
    roomState.lastPointEvent = {
      id: 'pt_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36),
      playerIdx,
      playerName: p.name,
      pts,
      sourceLabel
    };
    if (p.score >= 30) {
      roomState.status = 'finished';
      roomState.pendingCall = null;
      return true;
    }
    return false;
  }

  function finishHand(winnerIdx, pts, reasonText, extra = {}) {
    const winnerName = roomState.players[winnerIdx]?.name || 'Jugador';
    const loserIdx = 1 - winnerIdx;
    const loserName = roomState.players[loserIdx]?.name || 'Jugador';
    const callLabel = extra.callLabel || (roomState.trucoLevel > 0 ? getTrucoCallLabel(roomState.trucoLevel) : 'Mano Simple');
    const matchEnded = addPointsAndCheckWin(winnerIdx, pts, callLabel);
    roomState.pendingCall = null;
    roomState.handSummary = {
      winnerIdx,
      winnerName,
      loserIdx,
      loserName,
      pts,
      reasonText,
      callLabel,
      finishType: extra.finishType || 'bazas',
      envidoResolution: roomState.envidoResolution || null
    };
    roomState.lastActionBanner = `¡${winnerName} gana la mano (+${pts} pt${pts === 1 ? '' : 's'})! — ${reasonText}`;
    if (!matchEnded) {
      roomState.status = 'hand_end';
    }
  }

  function recordSpeech(playerIdx, text, tone = 'call') {
    const speechObj = {
      id: 'sp_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36),
      playerIdx,
      playerName: roomState.players[playerIdx]?.name || 'Jugador',
      text,
      tone
    };
    roomState.lastSpeech = speechObj;
    if (!Array.isArray(roomState.playerSpeeches)) {
      roomState.playerSpeeches = [null, null];
    }
    roomState.playerSpeeches[playerIdx] = speechObj;
  }

  function canPlayerCallEnvidoNow(playerIdx) {
    if (!roomState || roomState.status !== 'playing') return false;
    if (roomState.trickIndex !== 0 || roomState.envidoUsed) return false;

    // Case 1: No pending call, it's this player's turn in Primera
    if (!roomState.pendingCall) {
      return roomState.turnIndex === playerIdx;
    }

    // Case 2: "El envido está primero" — Rival just called Truco (level 1) in Primera
    // and this player is the responder and hasn't played their Primera card yet
    if (
      roomState.pendingCall.category === 'truco' &&
      roomState.pendingCall.targetLevel === 1 &&
      roomState.pendingCall.responderIdx === playerIdx
    ) {
      return true;
    }

    // Case 3: Pending Envido call where this player is the responder and can raise
    if (
      roomState.pendingCall.category === 'envido' &&
      roomState.pendingCall.responderIdx === playerIdx
    ) {
      const raises = getAvailableEnvidoRaises(roomState.pendingCall.chain);
      return raises.length > 0;
    }

    return false;
  }

  function playCard(cardId) {
    const myIdx = getMyPlayerIndex();
    if (myIdx === -1 || !roomState || roomState.status !== 'playing') return;
    if (roomState.pendingCall) return;
    if (roomState.turnIndex !== myIdx) return;

    const myCards = roomState.remainingCards[myIdx] || [];
    const cardPos = myCards.findIndex((c) => c.id === cardId);
    if (cardPos === -1) return;

    const [playedCard] = myCards.splice(cardPos, 1);
    const tIdx = roomState.trickIndex;
    const trick = roomState.tricks[tIdx];
    if (!trick) return;

    if (myIdx === 0) trick.c0 = playedCard;
    else trick.c1 = playedCard;

    const myPlayerName = roomState.players[myIdx]?.name || 'Jugador';
    roomState.lastActionBanner = `${myPlayerName} jugó ${formatCardName(playedCard)}.`;

    // Check if both players have played in this trick
    if (trick.c0 && trick.c1) {
      const w = compareCards(trick.c0, trick.c1);
      trick.winner = w;

      const handWinner = evaluateHandOutcome(roomState.tricks, roomState.manoIndex);
      if (handWinner !== null) {
        const callLbl = roomState.trucoLevel > 0 ? getTrucoCallLabel(roomState.trucoLevel) : 'Mano Simple';
        finishHand(
          handWinner,
          roomState.trucoPoints,
          `Ganó las bazas (${callLbl})`,
          { finishType: 'bazas', callLabel: callLbl }
        );
        broadcastRoomState(true);
        return;
      }

      // Advance to next trick
      const nextTrickIdx = tIdx + 1;
      roomState.trickIndex = nextTrickIdx;
      const nextStarter = w === 'tie' ? trick.firstIdx : w;
      roomState.tricks[nextTrickIdx].firstIdx = nextStarter;
      roomState.turnIndex = nextStarter;
    } else {
      // Other player's turn in the same trick
      roomState.turnIndex = 1 - myIdx;
    }

    broadcastRoomState(true);
  }

  function callEnvido(envidoType) {
    const myIdx = getMyPlayerIndex();
    if (myIdx === -1 || !canPlayerCallEnvidoNow(myIdx)) return;

    let newChain = [envidoType];
    const isRaise = Boolean(roomState.pendingCall && roomState.pendingCall.category === 'envido');
    if (isRaise) {
      const allowed = getAvailableEnvidoRaises(roomState.pendingCall.chain);
      if (!allowed.includes(envidoType)) return;
      newChain = [...roomState.pendingCall.chain, envidoType];
    } else {
      // Fresh envido call: clear old speeches so the new exchange stands out
      roomState.playerSpeeches = [null, null];
    }

    const label = getEnvidoCallLabel(envidoType);
    const myPlayerName = roomState.players[myIdx]?.name || 'Jugador';

    roomState.pendingCall = {
      id: 'call_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36),
      category: 'envido',
      callerIdx: myIdx,
      responderIdx: 1 - myIdx,
      chain: newChain
    };

    recordSpeech(myIdx, `¡${label}!`, 'envido');
    roomState.lastActionBanner = `${myPlayerName} cantó ¡${label.toUpperCase()}!`;
    broadcastRoomState(true);
  }

  function respondEnvido(accepted) {
    const myIdx = getMyPlayerIndex();
    if (myIdx === -1 || !roomState || roomState.status !== 'playing') return;
    const call = roomState.pendingCall;
    if (!call || call.category !== 'envido' || call.responderIdx !== myIdx) return;

    const s0 = roomState.players[0]?.score || 0;
    const s1 = roomState.players[1]?.score || 0;
    const chainInfo = getEnvidoChainInfo(call.chain, s0, s1);
    const myPlayerName = roomState.players[myIdx]?.name || 'Jugador';

    roomState.envidoUsed = true;
    roomState.pendingCall = null;

    if (!accepted) {
      const winnerIdx = call.callerIdx;
      const pts = chainInfo.declinedPoints;
      const winnerName = roomState.players[winnerIdx]?.name || 'Jugador';
      recordSpeech(myIdx, '¡No quiero!', 'decline');
      roomState.envidoResolution = {
        id: 'envres_' + Date.now(),
        accepted: false,
        callLabel: chainInfo.label,
        callerIdx: call.callerIdx,
        responderIdx: myIdx,
        winnerIdx,
        winnerName,
        loserIdx: myIdx,
        loserName: myPlayerName,
        pts,
        scores: null,
        tieBreakMano: false
      };
      roomState.envidoResultBanner = `${chainInfo.label} No Querido — ¡Ganó ${winnerName} (+${pts} pt${pts === 1 ? '' : 's'})!`;
      roomState.lastActionBanner = `${myPlayerName} dijo "No quiero". ¡${winnerName} gana el ${chainInfo.label} (+${pts} pt${pts === 1 ? '' : 's'})!`;
      addPointsAndCheckWin(winnerIdx, pts, chainInfo.label);
      broadcastRoomState(true);
      return;
    }

    // Accepted ("Quiero")
    const e0 = getEnvidoScore(roomState.hands[0]);
    const e1 = getEnvidoScore(roomState.hands[1]);
    const winnerIdx = resolveEnvidoWinner(e0, e1, roomState.manoIndex);
    const loserIdx = 1 - winnerIdx;
    const pts = chainInfo.isFalta
      ? getFaltaEnvidoPoints(s0, s1, winnerIdx)
      : chainInfo.acceptedBasePoints;

    const p0Name = roomState.players[0]?.name || 'J1';
    const p1Name = roomState.players[1]?.name || 'J2';
    const winnerName = roomState.players[winnerIdx]?.name || 'Jugador';
    const loserName = roomState.players[loserIdx]?.name || 'Jugador';
    const scores = [e0, e1];
    const tieBreakMano = e0 === e1;

    // Show clear tantear chat blobs for both players
    if (winnerIdx === myIdx) {
      recordSpeech(call.callerIdx, `Tengo ${scores[call.callerIdx]}`, 'envido');
      recordSpeech(myIdx, `¡Quiero! ¡${scores[myIdx]} son mejores!`, 'accept');
    } else {
      recordSpeech(call.callerIdx, `¡Tengo ${scores[call.callerIdx]}!`, 'accept');
      recordSpeech(myIdx, `¡Quiero! Son buenas (${scores[myIdx]})`, 'decline');
    }

    roomState.envidoResolution = {
      id: 'envres_' + Date.now(),
      accepted: true,
      callLabel: chainInfo.label,
      callerIdx: call.callerIdx,
      responderIdx: myIdx,
      winnerIdx,
      winnerName,
      loserIdx,
      loserName,
      pts,
      scores,
      tieBreakMano
    };

    roomState.envidoResultBanner = `¡${winnerName} ganó el ${chainInfo.label} (+${pts} pts)! [${p0Name}: ${e0} vs ${p1Name}: ${e1}${tieBreakMano ? ' · Mano' : ''}]`;
    roomState.lastActionBanner = roomState.envidoResultBanner;
    addPointsAndCheckWin(winnerIdx, pts, chainInfo.label);
    broadcastRoomState(true);
  }

  function callTruco() {
    const myIdx = getMyPlayerIndex();
    if (myIdx === -1 || !roomState || roomState.status !== 'playing') return;

    let nextLevel = roomState.trucoLevel + 1;
    let isRaiseOverCall = false;

    // Can either call from normal play (no pendingCall) or raise an incoming Truco call ("Quiero Retruco!" / "Quiero Vale Cuatro!")
    if (roomState.pendingCall) {
      if (
        roomState.pendingCall.category === 'truco' &&
        roomState.pendingCall.responderIdx === myIdx &&
        roomState.pendingCall.targetLevel < 3
      ) {
        // Raising directly over a pending Truco call means accepting current targetLevel and proposing targetLevel + 1
        roomState.trucoLevel = roomState.pendingCall.targetLevel;
        roomState.trucoPoints = roomState.trucoLevel + 1;
        roomState.trucoOwnerIdx = myIdx;
        nextLevel = roomState.trucoLevel + 1;
        isRaiseOverCall = true;
      } else {
        return;
      }
    } else {
      if (roomState.turnIndex !== myIdx) return;
      if (nextLevel > 3) return;
      if (roomState.trucoOwnerIdx !== null && roomState.trucoOwnerIdx !== myIdx) return;
      roomState.playerSpeeches = [null, null];
    }

    const label = getTrucoCallLabel(nextLevel);
    const myPlayerName = roomState.players[myIdx]?.name || 'Jugador';

    roomState.pendingCall = {
      id: 'call_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36),
      category: 'truco',
      callerIdx: myIdx,
      responderIdx: 1 - myIdx,
      targetLevel: nextLevel
    };

    recordSpeech(myIdx, isRaiseOverCall ? `¡Quiero ${label}!` : `¡${label}!`, 'truco');
    roomState.lastActionBanner = `${myPlayerName} cantó ¡${label.toUpperCase()}!`;
    broadcastRoomState(true);
  }

  function respondTruco(accepted) {
    const myIdx = getMyPlayerIndex();
    if (myIdx === -1 || !roomState || roomState.status !== 'playing') return;
    const call = roomState.pendingCall;
    if (!call || call.category !== 'truco' || call.responderIdx !== myIdx) return;

    const myPlayerName = roomState.players[myIdx]?.name || 'Jugador';
    const label = getTrucoCallLabel(call.targetLevel);

    if (!accepted) {
      recordSpeech(myIdx, '¡No quiero!', 'decline');
      const declinedPts = call.targetLevel; // Truco declined=1, Retruco declined=2, Vale Cuatro declined=3
      finishHand(
        call.callerIdx,
        declinedPts,
        `${label} No Querido (${myPlayerName} dijo "No quiero")`,
        { finishType: 'truco_declined', callLabel: `${label} No Querido` }
      );
      broadcastRoomState(true);
      return;
    }

    // Accepted ("Quiero")
    roomState.trucoLevel = call.targetLevel;
    roomState.trucoPoints = call.targetLevel + 1; // Truco=2, Retruco=3, Vale Cuatro=4
    roomState.trucoOwnerIdx = myIdx;
    roomState.pendingCall = null;

    recordSpeech(myIdx, '¡Quiero!', 'accept');
    roomState.lastActionBanner = `¡${label} Querido por ${myPlayerName}! Mano en juego por ${roomState.trucoPoints} puntos.`;
    broadcastRoomState(true);
  }

  function foldToMazo() {
    const myIdx = getMyPlayerIndex();
    if (myIdx === -1 || !roomState || roomState.status !== 'playing') return;
    if (roomState.pendingCall) return;
    if (roomState.turnIndex !== myIdx) return;

    const myPlayerName = roomState.players[myIdx]?.name || 'Jugador';
    const otherIdx = 1 - myIdx;
    recordSpeech(myIdx, 'Me voy al mazo', 'decline');

    // In Argentine Truco, folding in Primera before Envido was resolved and before playing any card gives 2 pts (1 for mazo + 1 for unplayed envido) if no truco was accepted
    const noCardsPlayedByAnyone =
      (roomState.remainingCards[0]?.length === 3) &&
      (roomState.remainingCards[1]?.length === 3);
    const pts = (!roomState.envidoUsed && noCardsPlayedByAnyone && roomState.trucoLevel === 0)
      ? 2
      : roomState.trucoPoints;

    finishHand(
      otherIdx,
      pts,
      `${myPlayerName} se fue al mazo`,
      { finishType: 'mazo', callLabel: 'Al Mazo' }
    );
    broadcastRoomState(true);
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

  function onWakeOrFocus() {
    if (!currentRoomKey) return;
    mqttClients.forEach((c) => {
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

  window.TrucoNet = {
    get clientId() { return clientId; },
    get myName() { return myName; },
    get currentRoomKey() { return currentRoomKey; },
    get isHost() { return isHost; },
    get roomState() { return roomState; },
    getMyPlayerIndex,
    canPlayerCallEnvidoNow,
    on(event, fn) { callbacks[event] = fn; },
    connectRoom,
    leaveRoom,
    startOrResetMatch,
    nextHand,
    playCard,
    callEnvido,
    respondEnvido,
    callTruco,
    respondTruco,
    foldToMazo,
    sendChat
  };
})();
