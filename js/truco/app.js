(function () {
  const {
    getEnvidoScore,
    getEnvidoCallLabel,
    getEnvidoChainInfo,
    getAvailableEnvidoRaises,
    getTrucoCallLabel,
    formatBuenasMalas
  } = window.TrucoRules;
  const {
    createTrucoCardElement,
    createCardBackElement,
    renderMatchsticksHTML
  } = window.TrucoCardsUI;
  const Notify = window.GeneralaNotify;
  const Net = window.TrucoNet;

  const screenAuth = document.getElementById('screen-auth');
  const screenLobby = document.getElementById('screen-lobby');
  const screenGame = document.getElementById('screen-game');

  const formJoin = document.getElementById('form-join');
  const inputName = document.getElementById('input-name');
  const inputKey = document.getElementById('input-key');

  const lobbyKeyDisplay = document.getElementById('lobby-key-display');
  const lobbyPlayerCount = document.getElementById('lobby-player-count');
  const lobbyPlayersContainer = document.getElementById('lobby-players-container');
  const hostControls = document.getElementById('host-controls');
  const hostStatusNote = document.getElementById('host-status-note');
  const guestControls = document.getElementById('guest-controls');
  const btnStartGame = document.getElementById('btn-start-game');
  const btnCopyKey = document.getElementById('btn-copy-key');
  const btnLeaveLobby = document.getElementById('btn-leave-lobby');

  const gameConnDot = document.getElementById('game-conn-dot');
  const gameRoomPill = document.getElementById('game-room-pill');
  const turnIndicator = document.getElementById('turn-indicator');
  const btnExitGame = document.getElementById('btn-exit-game');

  const hudHandNum = document.getElementById('hud-hand-num');
  const hudStakePts = document.getElementById('hud-stake-pts');
  const hudMyEnvido = document.getElementById('hud-my-envido');

  const oppNameEl = document.getElementById('opp-name');
  const oppMazoDeck = document.getElementById('opp-mazo-deck');
  const oppSpeechEl = document.getElementById('opp-speech');
  const oppSpeechTextEl = document.getElementById('opp-speech-text');
  const oppCardsRow = document.getElementById('opp-cards-row');

  const myNameEl = document.getElementById('my-name');
  const myMazoDeck = document.getElementById('my-mazo-deck');
  const mySpeechEl = document.getElementById('my-speech');
  const mySpeechTextEl = document.getElementById('my-speech-text');
  const myCardsRow = document.getElementById('my-cards-row');

  const envidoResolutionBox = document.getElementById('envido-resolution-box');
  const handOutcomeBox = document.getElementById('hand-outcome-box');
  const actionBanner = document.getElementById('action-banner');
  const envidoBanner = document.getElementById('envido-banner');
  const trucoButtonsWrap = document.getElementById('truco-buttons-wrap');

  const modalRules = document.getElementById('modal-rules');
  const modalWinner = document.getElementById('modal-winner');
  const winnerTitle = document.getElementById('winner-title');
  const winnerSubtitle = document.getElementById('winner-subtitle');
  const winnerStandings = document.getElementById('winner-standings');
  const btnPlayAgain = document.getElementById('btn-play-again');

  const chatWrapper = document.getElementById('chat-wrapper');
  const chatMessagesEl = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const btnNotifyLobby = document.getElementById('btn-notify-lobby');
  const btnNotifyGame = document.getElementById('btn-notify-game');

  let lastRenderedChatCount = -1;
  let chatHistorySeeded = false;
  const notifiedChatIds = new Set();
  let lastNotifiedTurnKey = '';
  let lastNotifiedCallId = '';

  function updateNotifyButtons() {
    if (!Notify) return;
    const label = Notify.getStatusLabel ? Notify.getStatusLabel() : (Notify.isActive() ? 'Alerts: On' : 'Alerts: Off');
    const needsPrompt = Notify.needsPermissionPrompt && Notify.needsPermissionPrompt();
    [btnNotifyLobby, btnNotifyGame].forEach((btn) => {
      if (!btn) return;
      btn.textContent = label;
      btn.classList.toggle('needs-permission', Boolean(needsPrompt));
    });
  }
  updateNotifyButtons();

  inputName.value = Net.myName;
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('room')) {
    inputKey.value = urlParams.get('room').toUpperCase();
  }

  function showScreen(target) {
    [screenAuth, screenLobby, screenGame].forEach((s) => {
      s.classList.toggle('active', s === target);
    });
    const inRoom = target === screenLobby || target === screenGame;
    chatWrapper.classList.toggle('active', inRoom);
    chatWrapper.classList.toggle('lobby-mode', target === screenLobby);
  }

  function renderAll() {
    const state = Net.roomState;
    if (!state) return;

    if (state.status === 'lobby') {
      showScreen(screenLobby);
      renderLobby(state);
    } else {
      showScreen(screenGame);
      renderGame(state);
    }
    renderChat();
  }

  function renderChat() {
    const msgs = Net.roomState?.messages || [];
    if (!chatHistorySeeded) {
      msgs.forEach((m) => notifiedChatIds.add(m.id));
      chatHistorySeeded = true;
    } else {
      msgs.forEach((m) => {
        if (!notifiedChatIds.has(m.id)) {
          notifiedChatIds.add(m.id);
          if (m.senderId !== Net.clientId && Notify) {
            Notify.notify(m.senderName, m.text, 'truco-chat-' + m.id);
          }
        }
      });
    }

    if (msgs.length === lastRenderedChatCount) return;
    lastRenderedChatCount = msgs.length;

    chatMessagesEl.innerHTML = '';
    if (msgs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'chat-empty';
      empty.textContent = 'No messages yet — say hi!';
      chatMessagesEl.appendChild(empty);
      return;
    }

    msgs.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'chat-msg';

      const author = document.createElement('span');
      author.className = 'chat-author' + (m.senderId === Net.clientId ? ' me' : '');
      author.textContent = `${m.senderName}:`;

      const text = document.createElement('span');
      text.textContent = m.text;

      row.appendChild(author);
      row.appendChild(text);
      chatMessagesEl.appendChild(row);
    });

    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  function renderLobby(state) {
    lobbyKeyDisplay.textContent = state.roomKey;
    lobbyPlayerCount.textContent = state.players.length;
    lobbyPlayersContainer.innerHTML = '';

    state.players.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'player-item';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = p.name + (p.id === Net.clientId ? ' (You)' : '');
      row.appendChild(nameSpan);

      const badge = document.createElement('span');
      if (p.id === state.hostId) {
        badge.className = 'badge badge-red';
        badge.textContent = 'Host';
      } else {
        badge.className = 'badge';
        badge.textContent = 'Ready';
      }
      row.appendChild(badge);
      lobbyPlayersContainer.appendChild(row);
    });

    const readyToStart = state.players.length === 2;
    hostControls.style.display = Net.isHost ? 'flex' : 'none';
    guestControls.style.display = Net.isHost ? 'none' : 'block';
    btnStartGame.disabled = !readyToStart;
    hostStatusNote.textContent = readyToStart
      ? 'Both players are here! Click Start 1v1 Match to deal.'
      : 'Share the room key with your rival to start the 1v1 match.';
  }

  function checkAndTriggerGameNotifications(state, myIdx) {
    if (myIdx === -1 || !Notify) return;

    // 1. Check if rival made a call (Envido / Real Envido / Falta Envido / Truco / Retruco / Vale Cuatro)
    if (state.status === 'playing' && state.pendingCall) {
      const call = state.pendingCall;
      if (call.responderIdx === myIdx && call.id !== lastNotifiedCallId) {
        lastNotifiedCallId = call.id;
        const callerName = state.players[call.callerIdx]?.name || 'Rival';
        let callTitle = '';
        if (call.category === 'envido') {
          const lastType = call.chain[call.chain.length - 1];
          callTitle = getEnvidoCallLabel(lastType);
        } else {
          callTitle = getTrucoCallLabel(call.targetLevel);
        }
        Notify.notify(
          `¡${callerName} cantó ${callTitle}!`,
          'Es tu turno de responder ¡Quiero! o No Quiero.',
          'truco-call-' + call.id
        );
      }
      return;
    }

    // 2. Check if it became our turn to play a card
    if (state.status === 'playing' && !state.pendingCall) {
      const cardsPlayed = 6 - ((state.remainingCards[0]?.length || 0) + (state.remainingCards[1]?.length || 0));
      const turnKey = `${state.handNumber}:${cardsPlayed}:${state.turnIndex}:${state.trucoLevel}:${state.envidoUsed}`;
      if (turnKey !== lastNotifiedTurnKey) {
        lastNotifiedTurnKey = turnKey;
        if (state.turnIndex === myIdx) {
          Notify.notify(
            'Tu Turno — Truco',
            'Te toca jugar una carta o cantar.',
            'truco-turn-' + state.roomKey
          );
        }
      }
    }
  }

  function renderGame(state) {
    gameRoomPill.textContent = `KEY: ${state.roomKey}`;

    const myIdx = Net.getMyPlayerIndex() !== -1 ? Net.getMyPlayerIndex() : 0;
    const oppIdx = 1 - myIdx;
    const me = state.players[myIdx] || { name: 'You', score: 0 };
    const opp = state.players[oppIdx] || { name: 'Rival', score: 0 };

    checkAndTriggerGameNotifications(state, Net.getMyPlayerIndex());

    // Topbar Turn / Call Indicator
    const isMyAction =
      state.status === 'playing' &&
      ((state.pendingCall && state.pendingCall.responderIdx === myIdx) ||
        (!state.pendingCall && state.turnIndex === myIdx));

    if (state.status === 'finished') {
      turnIndicator.textContent = 'Match Finished';
      turnIndicator.classList.remove('my-turn');
    } else if (state.status === 'hand_end') {
      turnIndicator.textContent = 'Fin de Mano';
      turnIndicator.classList.toggle('my-turn', true);
    } else if (state.pendingCall) {
      const responderName = state.players[state.pendingCall.responderIdx]?.name || 'Jugador';
      turnIndicator.textContent = state.pendingCall.responderIdx === myIdx
        ? '¡Respondé el Canto!'
        : `Esperando a ${responderName}…`;
      turnIndicator.classList.toggle('my-turn', state.pendingCall.responderIdx === myIdx);
    } else if (state.turnIndex === myIdx) {
      turnIndicator.textContent = 'Tu Turno';
      turnIndicator.classList.add('my-turn');
    } else {
      turnIndicator.textContent = `Turno de ${opp.name}`;
      turnIndicator.classList.remove('my-turn');
    }

    // HUD Strip
    hudHandNum.textContent = `MANO #${state.handNumber || 1}`;
    const stakeLabel = state.trucoLevel > 0
      ? `${getTrucoCallLabel(state.trucoLevel).toUpperCase()} (${state.trucoPoints} PTS)`
      : `1 PT`;
    hudStakePts.textContent = stakeLabel;

    const myInitialHand = state.hands?.[myIdx] || [];
    const myEnvidoVal = getEnvidoScore(myInitialHand);
    hudMyEnvido.textContent = `MI TANTO: ${myEnvidoVal}`;

    // Player & Opponent Names + Mazo Deck on the Mano Player's Side + Pixel Chat Blobs
    oppNameEl.textContent = opp.name;
    myNameEl.textContent = `${me.name} (Vos)`;
    const oppIsMano = state.manoIndex === oppIdx;
    const myIsMano = state.manoIndex === myIdx;
    if (oppMazoDeck) oppMazoDeck.style.display = oppIsMano ? 'flex' : 'none';
    if (myMazoDeck) myMazoDeck.style.display = myIsMano ? 'flex' : 'none';

    const oppSpeechObj =
      (Array.isArray(state.playerSpeeches) && state.playerSpeeches[oppIdx]) ||
      (state.lastSpeech && state.lastSpeech.playerIdx === oppIdx ? state.lastSpeech : null);
    const mySpeechObj =
      (Array.isArray(state.playerSpeeches) && state.playerSpeeches[myIdx]) ||
      (state.lastSpeech && state.lastSpeech.playerIdx === myIdx ? state.lastSpeech : null);

    renderPixelBlob(oppSpeechEl, oppSpeechTextEl, oppSpeechObj, 'opp-blob');
    renderPixelBlob(mySpeechEl, mySpeechTextEl, mySpeechObj, 'my-blob');

    // Opponent Remaining Cards (Card Backs fanned across the table)
    oppCardsRow.innerHTML = '';
    const oppRemaining = state.remainingCards?.[oppIdx]?.length || 0;
    for (let i = 0; i < oppRemaining; i++) {
      oppCardsRow.appendChild(createCardBackElement(false));
    }

    // Envido Resolution Showcase Box on the Table
    renderEnvidoResolutionBox(state, myIdx, oppIdx);

    // 3 Tricks / Bazas Slots (POV Table Layout)
    for (let t = 0; t < 3; t++) {
      const colEl = document.querySelector(`.trick-col[data-trick="${t}"]`);
      const slotEl = document.getElementById(`trick-slot-${t}`);
      const badgeEl = document.getElementById(`trick-badge-${t}`);
      if (!slotEl || !badgeEl) continue;

      colEl?.classList.toggle('active-trick', state.status === 'playing' && state.trickIndex === t);
      slotEl.innerHTML = '';

      const trick = state.tricks?.[t];
      const oppCard = trick ? (oppIdx === 0 ? trick.c0 : trick.c1) : null;
      const myCard = trick ? (myIdx === 0 ? trick.c0 : trick.c1) : null;

      if (oppCard) {
        const wrap = document.createElement('div');
        const oppWonTrick = trick.winner === oppIdx;
        const myWonTrick = trick.winner === myIdx;
        wrap.className = [
          'trick-card-wrap',
          'opp-played-card',
          oppWonTrick ? 'winning-trick-card' : '',
          myWonTrick ? 'losing-trick-card' : ''
        ].filter(Boolean).join(' ');
        const owner = document.createElement('span');
        owner.className = 'trick-card-owner';
        owner.textContent = opp.name;
        wrap.appendChild(owner);
        wrap.appendChild(createTrucoCardElement(oppCard, { tableCard: true }));
        slotEl.appendChild(wrap);
      }
      if (myCard) {
        const wrap = document.createElement('div');
        const myWonTrick = trick.winner === myIdx;
        const oppWonTrick = trick.winner === oppIdx;
        wrap.className = [
          'trick-card-wrap',
          'my-played-card',
          myWonTrick ? 'winning-trick-card' : '',
          oppWonTrick ? 'losing-trick-card' : ''
        ].filter(Boolean).join(' ');
        const owner = document.createElement('span');
        owner.className = 'trick-card-owner';
        owner.textContent = 'Vos';
        wrap.appendChild(owner);
        wrap.appendChild(createTrucoCardElement(myCard, { tableCard: true }));
        slotEl.appendChild(wrap);
      }

      badgeEl.className = 'trick-badge';
      if (trick && trick.winner !== null) {
        if (trick.winner === 'tie') {
          badgeEl.textContent = 'Parda';
          badgeEl.classList.add('win-tie');
        } else if (trick.winner === myIdx) {
          badgeEl.textContent = '¡Ganada!';
          badgeEl.classList.add('win-me');
        } else {
          badgeEl.textContent = `Ganó ${opp.name}`;
          badgeEl.classList.add('win-opp');
        }
      } else {
        badgeEl.textContent = '';
      }
    }

    // Hand / Truco Outcome Showcase Box (Shown when hand ends)
    renderHandOutcomeBox(state, myIdx);

    // My Hand Cards (Large First-Person POV Fan)
    myCardsRow.innerHTML = '';
    const myRemaining = state.remainingCards?.[myIdx] || [];
    const canPlayCardNow =
      state.status === 'playing' &&
      !state.pendingCall &&
      state.turnIndex === myIdx;

    myRemaining.forEach((card) => {
      const cardEl = createTrucoCardElement(card, { interactive: canPlayCardNow });
      if (canPlayCardNow) {
        cardEl.addEventListener('click', () => Net.playCard(card.id));
      }
      myCardsRow.appendChild(cardEl);
    });

    // Banners & Action Buttons
    actionBanner.textContent = state.lastActionBanner || 'Partida en curso';
    actionBanner.classList.toggle('urgent-call', Boolean(state.pendingCall && state.pendingCall.responderIdx === myIdx));

    if (state.envidoResultBanner && !state.envidoResolution) {
      envidoBanner.textContent = state.envidoResultBanner;
      envidoBanner.style.display = 'block';
    } else {
      envidoBanner.style.display = 'none';
    }

    renderActionButtons(state, myIdx);
    renderScoreboard(state, isMyAction ? myIdx : state.turnIndex);

    if (state.status === 'finished') {
      showWinnerModal(state);
    } else {
      modalWinner.classList.add('hidden');
    }
  }

  function renderPixelBlob(blobEl, textEl, speechObj, sideClass) {
    if (!blobEl) return;
    if (!speechObj || !speechObj.text) {
      blobEl.style.display = 'none';
      blobEl.dataset.speechId = '';
      return;
    }
    const toneClass = speechObj.tone ? `tone-${speechObj.tone}` : '';
    blobEl.className = ['pixel-chat-blob', sideClass, toneClass].filter(Boolean).join(' ');
    if (textEl) {
      textEl.textContent = speechObj.text;
    } else {
      blobEl.textContent = speechObj.text;
    }
    blobEl.style.display = 'inline-flex';
    if (blobEl.dataset.speechId !== speechObj.id) {
      blobEl.dataset.speechId = speechObj.id || '';
      blobEl.style.animation = 'none';
      void blobEl.offsetWidth;
      blobEl.style.animation = '';
    }
  }

  function renderEnvidoResolutionBox(state, myIdx, oppIdx) {
    if (!envidoResolutionBox) return;
    const res = state.envidoResolution;
    if (!res) {
      envidoResolutionBox.style.display = 'none';
      envidoResolutionBox.innerHTML = '';
      return;
    }

    const iWon = res.winnerIdx === myIdx;
    envidoResolutionBox.className = `envido-resolution-box ${iWon ? 'won-by-me' : 'won-by-opp'}`;
    envidoResolutionBox.style.display = 'flex';

    const winnerLabel = iWon ? '¡GANASTE EL ENVIDO!' : `¡${res.winnerName} GANÓ EL ENVIDO!`;
    let tantosHTML = '';

    if (res.accepted && Array.isArray(res.scores)) {
      const myTanto = res.scores[myIdx];
      const oppTanto = res.scores[oppIdx];
      const oppName = state.players[oppIdx]?.name || 'Rival';
      tantosHTML = `
        <div class="env-res-tantos">
          <span class="tanto-chip ${iWon ? 'winner-tanto' : ''}">Vos: ${myTanto}${iWon ? ' ★' : ''}</span>
          <span>vs</span>
          <span class="tanto-chip ${!iWon ? 'winner-tanto' : ''}">${oppName}: ${oppTanto}${!iWon ? ' ★' : ''}</span>
          ${res.tieBreakMano ? '<span class="tanto-chip winner-tanto">Por ser Mano</span>' : ''}
        </div>
      `;
    } else {
      tantosHTML = `<span class="tanto-chip">No Querido (dijo "No quiero")</span>`;
    }

    envidoResolutionBox.innerHTML = `
      <div class="env-res-left">
        <span class="env-res-tag">${res.callLabel || 'Envido'}</span>
        <span class="env-res-title">${winnerLabel}</span>
        ${tantosHTML}
      </div>
      <span class="env-res-pts-badge ${iWon ? 'pts-me' : 'pts-opp'}">
        +${res.pts} PUNTO${res.pts === 1 ? '' : 'S'} PARA ${res.winnerName}
      </span>
    `;
  }

  function renderHandOutcomeBox(state, myIdx) {
    if (!handOutcomeBox) return;
    const sum = state.handSummary;
    if (!sum || (state.status !== 'hand_end' && state.status !== 'finished')) {
      handOutcomeBox.style.display = 'none';
      handOutcomeBox.innerHTML = '';
      return;
    }

    const iWon = sum.winnerIdx === myIdx;
    handOutcomeBox.className = `hand-outcome-box ${iWon ? 'won-by-me' : 'won-by-opp'}`;
    handOutcomeBox.style.display = 'flex';

    const headline = iWon
      ? `🏆 ¡GANASTE LA MANO!`
      : `¡${sum.winnerName} GANÓ LA MANO!`;

    const envRes = sum.envidoResolution || state.envidoResolution;
    const envRecapHTML = envRes
      ? `<div class="ho-envido-recap">Envido en esta mano: <strong>Ganó ${envRes.winnerName} (+${envRes.pts} pt${envRes.pts === 1 ? '' : 's'})</strong></div>`
      : '';

    handOutcomeBox.innerHTML = `
      <div class="ho-header">
        <span class="ho-winner-title">${headline}</span>
        <span class="ho-pts-pill">+${sum.pts} PUNTO${sum.pts === 1 ? '' : 'S'} PARA ${sum.winnerName.toUpperCase()}</span>
      </div>
      <div class="ho-reason">${sum.reasonText || ''}</div>
      ${envRecapHTML}
    `;

    if (state.status === 'hand_end') {
      const btnNext = document.createElement('button');
      btnNext.type = 'button';
      btnNext.className = 'btn-primary btn-green';
      btnNext.style.maxWidth = '320px';
      btnNext.style.marginTop = '4px';
      btnNext.textContent = 'Siguiente Mano (Repartir) →';
      btnNext.addEventListener('click', () => Net.nextHand());
      handOutcomeBox.appendChild(btnNext);
    }
  }

  function makeCallBtn(label, extraClass, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn-call ${extraClass}`;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function renderActionButtons(state, myIdx) {
    trucoButtonsWrap.innerHTML = '';

    if (state.status === 'hand_end') {
      const btnNext = document.createElement('button');
      btnNext.type = 'button';
      btnNext.className = 'btn-primary btn-green';
      btnNext.textContent = 'Siguiente Mano (Repartir)';
      btnNext.addEventListener('click', () => Net.nextHand());
      trucoButtonsWrap.appendChild(btnNext);
      return;
    }

    if (state.status !== 'playing') return;

    // 1. Responding to a Pending Call
    if (state.pendingCall) {
      const call = state.pendingCall;
      if (call.responderIdx !== myIdx) {
        return;
      }

      if (call.category === 'envido') {
        const s0 = state.players[0]?.score || 0;
        const s1 = state.players[1]?.score || 0;
        const info = getEnvidoChainInfo(call.chain, s0, s1);
        actionBanner.textContent = `¡Te cantaron ${info.label}! (Quiero: ${info.acceptedBasePoints} pts / No Quiero: ${info.declinedPoints} pt${info.declinedPoints === 1 ? '' : 's'})`;

        trucoButtonsWrap.appendChild(
          makeCallBtn('¡Quiero!', 'call-quiero', () => Net.respondEnvido(true))
        );
        trucoButtonsWrap.appendChild(
          makeCallBtn('No Quiero', 'call-noquiero', () => Net.respondEnvido(false))
        );

        const raises = getAvailableEnvidoRaises(call.chain);
        raises.forEach((rType) => {
          const rLabel = getEnvidoCallLabel(rType);
          const cls = rType === 'FALTA_ENVIDO' ? 'call-falta' : 'call-envido';
          trucoButtonsWrap.appendChild(
            makeCallBtn(rLabel, cls, () => Net.callEnvido(rType))
          );
        });
        return;
      }

      if (call.category === 'truco') {
        const tLabel = getTrucoCallLabel(call.targetLevel);
        actionBanner.textContent = `¡Te cantaron ${tLabel.toUpperCase()}!`;

        trucoButtonsWrap.appendChild(
          makeCallBtn('¡Quiero!', 'call-quiero', () => Net.respondTruco(true))
        );
        trucoButtonsWrap.appendChild(
          makeCallBtn('No Quiero', 'call-noquiero', () => Net.respondTruco(false))
        );

        if (call.targetLevel < 3) {
          const nextTrucoLabel = getTrucoCallLabel(call.targetLevel + 1);
          trucoButtonsWrap.appendChild(
            makeCallBtn(`¡Quiero ${nextTrucoLabel}!`, 'call-truco', () => Net.callTruco())
          );
        }

        // "El envido está primero" if in Primera and envido wasn't used yet
        if (Net.canPlayerCallEnvidoNow(myIdx)) {
          ['ENVIDO', 'REAL_ENVIDO', 'FALTA_ENVIDO'].forEach((rType) => {
            const rLabel = getEnvidoCallLabel(rType);
            const cls = rType === 'FALTA_ENVIDO' ? 'call-falta' : 'call-envido';
            trucoButtonsWrap.appendChild(
              makeCallBtn(rLabel, cls, () => Net.callEnvido(rType))
            );
          });
        }
        return;
      }
    }

    // 2. Normal Turn Controls (when no call is pending and it's my turn)
    if (state.turnIndex !== myIdx) return;

    if (Net.canPlayerCallEnvidoNow(myIdx)) {
      trucoButtonsWrap.appendChild(
        makeCallBtn('Envido', 'call-envido', () => Net.callEnvido('ENVIDO'))
      );
      trucoButtonsWrap.appendChild(
        makeCallBtn('Real Envido', 'call-envido', () => Net.callEnvido('REAL_ENVIDO'))
      );
      trucoButtonsWrap.appendChild(
        makeCallBtn('Falta Envido', 'call-falta', () => Net.callEnvido('FALTA_ENVIDO'))
      );
    }

    const canRaiseTruco =
      state.trucoLevel < 3 &&
      (state.trucoOwnerIdx === null || state.trucoOwnerIdx === myIdx);
    if (canRaiseTruco) {
      const nextTLabel = getTrucoCallLabel(state.trucoLevel + 1);
      trucoButtonsWrap.appendChild(
        makeCallBtn(nextTLabel, 'call-truco', () => Net.callTruco())
      );
    }

    trucoButtonsWrap.appendChild(
      makeCallBtn('Irse al Mazo', 'call-mazo', () => Net.foldToMazo())
    );
  }

  function renderScoreboard(state, activeIdx) {
    [0, 1].forEach((idx) => {
      const p = state.players[idx] || { name: `Player ${idx + 1}`, score: 0 };
      const total = Math.min(30, Math.max(0, p.score || 0));
      const malasPts = Math.min(15, total);
      const buenasPts = Math.max(0, total - 15);
      const bm = formatBuenasMalas(total);

      const colEl = document.getElementById(`tscore-col-${idx}`);
      const nameEl = document.getElementById(`tscore-name-${idx}`);
      const stageEl = document.getElementById(`tscore-stage-${idx}`);
      const deltaEl = document.getElementById(`tscore-delta-${idx}`);
      const malasNumEl = document.getElementById(`tscore-malas-num-${idx}`);
      const malasFosfEl = document.getElementById(`tscore-malas-fosf-${idx}`);
      const buenasNumEl = document.getElementById(`tscore-buenas-num-${idx}`);
      const buenasFosfEl = document.getElementById(`tscore-buenas-fosf-${idx}`);
      const totalEl = document.getElementById(`tscore-total-${idx}`);

      if (colEl) colEl.classList.toggle('active-player', state.status === 'playing' && idx === activeIdx);
      if (nameEl) nameEl.textContent = p.name;
      if (stageEl) {
        stageEl.textContent = `${bm.count} ${bm.stage}`;
        stageEl.classList.toggle('buenas', total >= 15);
      }
      if (deltaEl) {
        const ptEv = state.lastPointEvent;
        if (ptEv && ptEv.playerIdx === idx) {
          deltaEl.textContent = `+${ptEv.pts} PT${ptEv.pts === 1 ? '' : 'S'}${ptEv.sourceLabel ? ` (${ptEv.sourceLabel})` : ''}`;
          deltaEl.style.display = 'block';
        } else {
          deltaEl.style.display = 'none';
          deltaEl.textContent = '';
        }
      }
      if (malasNumEl) malasNumEl.textContent = `${malasPts} / 15`;
      if (malasFosfEl) malasFosfEl.innerHTML = renderMatchsticksHTML(malasPts);
      if (buenasNumEl) buenasNumEl.textContent = `${buenasPts} / 15`;
      if (buenasFosfEl) buenasFosfEl.innerHTML = renderMatchsticksHTML(buenasPts);
      if (totalEl) totalEl.textContent = `${total}`;
    });
  }

  function showWinnerModal(state) {
    const sorted = [...state.players].sort((a, b) => (b.score || 0) - (a.score || 0));
    const top = sorted[0];
    winnerTitle.textContent = `${top.name} Gana el Partido!`;
    winnerSubtitle.textContent = `Resultado final: ${top.score} puntos (Buenas)`;

    winnerStandings.innerHTML = '';
    sorted.forEach((p, i) => {
      const bm = formatBuenasMalas(p.score || 0);
      const row = document.createElement('div');
      row.className = 'player-item';
      row.innerHTML = `
        <span>#${i + 1} ${p.name}</span>
        <span class="badge ${i === 0 ? 'badge-red' : ''}">${p.score} pts (${bm.count} ${bm.stage})</span>
      `;
      winnerStandings.appendChild(row);
    });

    modalWinner.classList.remove('hidden');
  }

  function leaveToAuthScreen() {
    Net.leaveRoom();
    lastRenderedChatCount = -1;
    chatHistorySeeded = false;
    notifiedChatIds.clear();
    lastNotifiedTurnKey = '';
    lastNotifiedCallId = '';
    chatMessagesEl.innerHTML = '<div class="chat-empty">No messages yet — say hi!</div>';
    window.history.replaceState({}, '', window.location.pathname);
    showScreen(screenAuth);
  }

  Net.on('onStateChange', renderAll);
  Net.on('onConnectionChange', (connected) => {
    gameConnDot.classList.toggle('connecting', !connected);
  });
  Net.on('onChatUpdate', renderChat);

  formJoin.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = inputName.value.trim() || 'Jugador';
    const key = inputKey.value.trim().toUpperCase();
    if (!key) return;

    const nextUrl = `${window.location.pathname}?room=${encodeURIComponent(key)}`;
    window.history.replaceState({}, '', nextUrl);

    lobbyKeyDisplay.textContent = key;
    showScreen(screenLobby);
    Net.connectRoom(key, name);

    if (Notify) {
      Notify.requestPermission().then(updateNotifyButtons);
    }
  });

  if (btnNotifyLobby) {
    btnNotifyLobby.addEventListener('click', () => {
      if (Notify) Notify.toggleEnabled().then(updateNotifyButtons);
    });
  }
  if (btnNotifyGame) {
    btnNotifyGame.addEventListener('click', () => {
      if (Notify) Notify.toggleEnabled().then(updateNotifyButtons);
    });
  }

  btnStartGame.addEventListener('click', () => {
    if (Notify && Notify.getPermission() === 'default') {
      Notify.requestPermission().then(updateNotifyButtons);
    }
    Net.startOrResetMatch();
  });

  btnPlayAgain.addEventListener('click', () => {
    modalWinner.classList.add('hidden');
    Net.startOrResetMatch();
  });

  btnCopyKey.addEventListener('click', () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(Net.currentRoomKey)}`;
    navigator.clipboard?.writeText(shareUrl).then(() => {
      btnCopyKey.textContent = 'Copied!';
      setTimeout(() => { btnCopyKey.textContent = 'Copy Link'; }, 1600);
    }).catch(() => {
      btnCopyKey.textContent = Net.currentRoomKey;
    });
  });

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    if (Notify && Notify.getPermission() === 'default') {
      Notify.requestPermission().then(updateNotifyButtons);
    }
    Net.sendChat(text);
  });

  btnLeaveLobby.addEventListener('click', leaveToAuthScreen);
  btnExitGame.addEventListener('click', leaveToAuthScreen);

  document.getElementById('btn-open-rules-auth').addEventListener('click', () => modalRules.classList.remove('hidden'));
  document.getElementById('btn-open-rules-game').addEventListener('click', () => modalRules.classList.remove('hidden'));
  document.getElementById('btn-close-rules').addEventListener('click', () => modalRules.classList.add('hidden'));
  document.getElementById('btn-close-winner').addEventListener('click', () => modalWinner.classList.add('hidden'));
})();
