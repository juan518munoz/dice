(function () {
  const { createDieElement, renderDiePips } = window.DiceUI;
  const { CATEGORIES, scoreCategory, detectBestCallout, getPlayerTotal } = window.GeneralaRules;
  const Notify = window.GeneralaNotify;
  const Net = window.GeneralaNet;

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
  const guestControls = document.getElementById('guest-controls');
  const btnStartGame = document.getElementById('btn-start-game');
  const btnCopyKey = document.getElementById('btn-copy-key');
  const btnLeaveLobby = document.getElementById('btn-leave-lobby');

  const gameConnDot = document.getElementById('game-conn-dot');
  const gameRoomPill = document.getElementById('game-room-pill');
  const turnIndicator = document.getElementById('turn-indicator');
  const rollsDots = document.getElementById('rolls-dots');
  const handCallout = document.getElementById('hand-callout');
  const diceGrid = document.getElementById('dice-grid');
  const btnRoll = document.getElementById('btn-roll');
  const diceHelper = document.getElementById('dice-helper');
  const btnExitGame = document.getElementById('btn-exit-game');

  const scoreThead = document.getElementById('score-thead');
  const scoreTbody = document.getElementById('score-tbody');
  const scoreTfoot = document.getElementById('score-tfoot');

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

  function updateNotifyButtons() {
    if (!Notify) return;
    const label = Notify.getStatusLabel ? Notify.getStatusLabel() : (Notify.isActive() ? 'Alerts: On' : 'Alerts: Off');
    const needsPrompt = Notify.needsPermissionPrompt && Notify.needsPermissionPrompt();
    [btnNotifyLobby, btnNotifyGame].forEach(btn => {
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
    [screenAuth, screenLobby, screenGame].forEach(s => {
      s.classList.toggle('active', s === target);
    });
    const inRoom = target === screenLobby || target === screenGame;
    chatWrapper.classList.toggle('active', inRoom);
    chatWrapper.classList.toggle('lobby-mode', target === screenLobby);
  }

  function initDiceDOM() {
    diceGrid.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'die-wrap';

      const die = createDieElement('generala-die unrolled');
      renderDiePips(die, i + 1);

      const label = document.createElement('span');
      label.className = 'hold-label';
      label.textContent = 'Held';

      die.addEventListener('click', () => onDieClick(i));

      wrap.appendChild(die);
      wrap.appendChild(label);
      diceGrid.appendChild(wrap);
    }
  }

  function triggerClientRollAnim(heldArr) {
    Net.isRollingAnim = true;
    const wraps = Array.from(diceGrid.children);
    wraps.forEach((wrap, idx) => {
      const die = wrap.querySelector('.die');
      if (!heldArr || !heldArr[idx]) {
        die.classList.remove('unrolled');
        die.classList.add('rolling');
      }
    });

    const scramble = setInterval(() => {
      wraps.forEach((wrap, idx) => {
        if (!heldArr || !heldArr[idx]) {
          const die = wrap.querySelector('.die');
          renderDiePips(die, Math.floor(Math.random() * 6) + 1);
        }
      });
    }, 60);

    setTimeout(() => {
      clearInterval(scramble);
      wraps.forEach(wrap => {
        wrap.querySelector('.die').classList.remove('rolling');
      });
      Net.isRollingAnim = false;
      renderAll();
    }, 310);
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
      msgs.forEach(m => notifiedChatIds.add(m.id));
      chatHistorySeeded = true;
    } else {
      msgs.forEach(m => {
        if (!notifiedChatIds.has(m.id)) {
          notifiedChatIds.add(m.id);
          if (m.senderId !== Net.clientId && Notify) {
            Notify.notify(m.senderName, m.text, 'chat-' + m.id);
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

    msgs.forEach(m => {
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

    state.players.forEach(p => {
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

    hostControls.style.display = Net.isHost ? 'flex' : 'none';
    guestControls.style.display = Net.isHost ? 'none' : 'block';
  }

  function renderGame(state) {
    gameRoomPill.textContent = `KEY: ${state.roomKey}`;

    const activePlayer = state.players[state.turnIndex] || state.players[0];
    const isMyTurn = activePlayer && activePlayer.id === Net.clientId && state.status === 'playing';

    const completedTurns = state.players.reduce(
      (sum, p) => sum + Object.keys(p.scores || {}).length,
      0
    );
    const turnKey = `${state.status}:${completedTurns}:${activePlayer?.id || ''}`;
    if (turnKey !== lastNotifiedTurnKey) {
      lastNotifiedTurnKey = turnKey;
      if (isMyTurn && state.rollsUsed === 0 && (state.players.length > 1 || document.hidden) && Notify) {
        Notify.notify('Your Turn — Generala', "It's your turn to roll the dice!", 'turn-' + state.roomKey);
      }
    }

    if (state.status === 'finished') {
      turnIndicator.textContent = 'Game Finished';
      turnIndicator.classList.remove('my-turn');
    } else if (isMyTurn) {
      turnIndicator.textContent = 'Your Turn';
      turnIndicator.classList.add('my-turn');
    } else {
      turnIndicator.textContent = `${activePlayer ? activePlayer.name : 'Player'}'s Turn`;
      turnIndicator.classList.remove('my-turn');
    }

    const dots = rollsDots.querySelectorAll('.roll-pip');
    dots.forEach((d, idx) => {
      d.classList.toggle('used', idx < state.rollsUsed);
    });

    handCallout.textContent = detectBestCallout(
      state.dice,
      state.rollsUsed,
      state.isServidaThrow
    );

    const wraps = Array.from(diceGrid.children);
    wraps.forEach((wrap, idx) => {
      const die = wrap.querySelector('.die');
      const val = state.dice[idx] || 1;
      const isHeld = Boolean(state.held[idx]);

      if (!Net.isRollingAnim) {
        renderDiePips(die, val);
      }
      wrap.classList.toggle('held', isHeld && state.rollsUsed > 0);
      die.classList.toggle('held', isHeld && state.rollsUsed > 0);
      die.classList.toggle('unrolled', state.rollsUsed === 0);
      die.classList.toggle(
        'interactive',
        isMyTurn && state.rollsUsed > 0 && state.rollsUsed < 3
      );
    });

    const rollsRemaining = 3 - state.rollsUsed;
    if (state.status === 'finished') {
      btnRoll.disabled = true;
      btnRoll.textContent = 'Game Complete';
      diceHelper.textContent = Net.isHost
        ? 'Click Play Again in the results dialog to start a new match.'
        : 'Waiting for host to start a new match.';
    } else if (!isMyTurn) {
      btnRoll.disabled = true;
      btnRoll.textContent = `Waiting for ${activePlayer?.name || 'player'}…`;
      diceHelper.textContent = `Watching ${activePlayer?.name || 'player'}'s turn live.`;
    } else if (rollsRemaining === 3) {
      btnRoll.disabled = false;
      btnRoll.textContent = 'Roll Dice (3 left)';
      diceHelper.textContent = 'Roll all 5 dice to start your turn.';
    } else if (rollsRemaining > 0) {
      btnRoll.disabled = false;
      btnRoll.textContent = `Roll Again (${rollsRemaining} left)`;
      diceHelper.textContent = 'Tap dice to Hold, roll again, or pick a score in the table.';
    } else {
      btnRoll.disabled = true;
      btnRoll.textContent = 'No Throws Left';
      diceHelper.textContent = 'Select an open row in your column to record your score.';
    }

    renderScoreTable(state, isMyTurn);

    if (state.status === 'finished') {
      showWinnerModal(state);
    } else {
      modalWinner.classList.add('hidden');
    }
  }

  function renderScoreTable(state, isMyTurn) {
    const trHead = document.createElement('tr');
    const thCat = document.createElement('th');
    thCat.textContent = 'Category';
    trHead.appendChild(thCat);

    state.players.forEach((p, idx) => {
      const th = document.createElement('th');
      th.textContent = p.name;
      if (idx === state.turnIndex && state.status === 'playing') {
        th.className = 'active-col';
      }
      trHead.appendChild(th);
    });
    scoreThead.innerHTML = '';
    scoreThead.appendChild(trHead);

    scoreTbody.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const tr = document.createElement('tr');
      const tdLabel = document.createElement('td');
      tdLabel.innerHTML = `${cat.label}<span class="cat-rule">${cat.hint}</span>`;
      tr.appendChild(tdLabel);

      state.players.forEach((p) => {
        const td = document.createElement('td');
        td.className = 'cell-score';
        const recorded = p.scores[cat.id];

        if (recorded !== undefined) {
          td.textContent = recorded;
          td.classList.add(recorded === 0 ? 'crossed' : 'filled');
        } else if (isMyTurn && p.id === Net.clientId && state.rollsUsed > 0) {
          const preview = scoreCategory(
            cat.id,
            state.dice,
            state.rollsUsed,
            state.isServidaThrow
          );
          td.textContent = preview > 0 ? `+${preview}` : '0';
          td.classList.add('selectable');
          if (preview > 0) td.classList.add('has-points');
          td.addEventListener('click', () => onSelectScore(cat.id));
        } else {
          td.textContent = '—';
          td.style.color = 'var(--border)';
        }
        tr.appendChild(td);
      });

      scoreTbody.appendChild(tr);
    });

    const trFoot = document.createElement('tr');
    trFoot.className = 'total-row';
    const tdTotalLabel = document.createElement('td');
    tdTotalLabel.textContent = 'Total';
    trFoot.appendChild(tdTotalLabel);

    state.players.forEach(p => {
      const td = document.createElement('td');
      td.textContent = getPlayerTotal(p.scores);
      trFoot.appendChild(td);
    });
    scoreTfoot.innerHTML = '';
    scoreTfoot.appendChild(trFoot);
  }

  function showWinnerModal(state) {
    const sorted = [...state.players]
      .map(p => ({ ...p, total: getPlayerTotal(p.scores) }))
      .sort((a, b) => b.total - a.total);

    const top = sorted[0];
    winnerTitle.textContent = sorted.length > 1 ? `${top.name} Wins!` : 'Game Complete!';
    winnerSubtitle.textContent = `Final score: ${top.total} points`;

    winnerStandings.innerHTML = '';
    sorted.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'player-item';
      row.innerHTML = `
        <span>#${i + 1} ${p.name}</span>
        <span class="badge ${i === 0 ? 'badge-red' : ''}">${p.total} pts</span>
      `;
      winnerStandings.appendChild(row);
    });

    btnPlayAgain.style.display = Net.isHost ? 'inline-flex' : 'none';
    modalWinner.classList.remove('hidden');
  }

  function onDieClick(dieIndex) {
    const state = Net.roomState;
    if (!state || state.status !== 'playing') return;
    const activePlayer = state.players[state.turnIndex];
    if (!activePlayer || activePlayer.id !== Net.clientId) return;
    if (state.rollsUsed === 0 || state.rollsUsed >= 3) return;
    Net.sendToggleHold(dieIndex);
  }

  function onRollClick() {
    const state = Net.roomState;
    if (!state || state.status !== 'playing' || Net.isRollingAnim) return;
    const activePlayer = state.players[state.turnIndex];
    if (!activePlayer || activePlayer.id !== Net.clientId) return;
    if (state.rollsUsed >= 3) return;
    Net.sendRoll();
  }

  function onSelectScore(catId) {
    const state = Net.roomState;
    if (!state || state.status !== 'playing' || Net.isRollingAnim) return;
    const activePlayer = state.players[state.turnIndex];
    if (!activePlayer || activePlayer.id !== Net.clientId) return;
    if (state.rollsUsed === 0) return;
    Net.sendScore(catId);
  }

  function leaveToAuthScreen() {
    Net.leaveRoom();
    lastRenderedChatCount = -1;
    chatHistorySeeded = false;
    notifiedChatIds.clear();
    lastNotifiedTurnKey = '';
    chatMessagesEl.innerHTML = '<div class="chat-empty">No messages yet — say hi!</div>';
    window.history.replaceState({}, '', window.location.pathname);
    showScreen(screenAuth);
  }

  // Register Net callbacks
  Net.on('onStateChange', renderAll);
  Net.on('onConnectionChange', (connected) => {
    gameConnDot.classList.toggle('connecting', !connected);
  });
  Net.on('onRollAnim', triggerClientRollAnim);
  Net.on('onChatUpdate', renderChat);

  // DOM Event Listeners
  formJoin.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = inputName.value.trim() || 'Player';
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
  btnRoll.addEventListener('click', onRollClick);

  document.getElementById('btn-open-rules-auth').addEventListener('click', () => modalRules.classList.remove('hidden'));
  document.getElementById('btn-open-rules-game').addEventListener('click', () => modalRules.classList.remove('hidden'));
  document.getElementById('btn-close-rules').addEventListener('click', () => modalRules.classList.add('hidden'));
  document.getElementById('btn-close-winner').addEventListener('click', () => modalWinner.classList.add('hidden'));

  window.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (e.key === ' ' && screenGame.classList.contains('active') && modalRules.classList.contains('hidden')) {
      e.preventDefault();
      onRollClick();
    }
  });

  initDiceDOM();
})();
