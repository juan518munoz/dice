(function () {
  const { createDieElement, renderDiePips } = window.DiceUI;

  const MIN_DICE = 1;
  const MAX_DICE = 12;

  let diceCount = 2;
  let isRolling = false;

  const diceGridEl = document.getElementById('roller-dice-grid');
  const totalValEl = document.getElementById('roller-total-val');
  const hudCountEl = document.getElementById('roller-hud-count');
  const btnChangeCountEl = document.getElementById('btn-roller-change-count');
  const btnRollEl = document.getElementById('btn-roller-roll');

  const modalEl = document.getElementById('modal-roller-count');
  const modalCountEl = document.getElementById('roller-modal-count');
  const btnMinusEl = document.getElementById('btn-roller-minus');
  const btnPlusEl = document.getElementById('btn-roller-plus');
  const quickPicksEl = document.getElementById('roller-quick-picks');
  const btnStartEl = document.getElementById('btn-roller-start');

  function setDiceCount(n) {
    diceCount = Math.max(MIN_DICE, Math.min(MAX_DICE, n));
    modalCountEl.textContent = diceCount;
    hudCountEl.textContent = diceCount;
    quickPicksEl.querySelectorAll('.btn-pick').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.count) === diceCount);
    });
  }

  function buildDice() {
    diceGridEl.innerHTML = '';
    for (let i = 0; i < diceCount; i++) {
      const die = createDieElement('roller-die');
      diceGridEl.appendChild(die);
      renderDiePips(die, 1);
    }
  }

  function roll() {
    if (isRolling) return;
    isRolling = true;

    const diceEls = Array.from(diceGridEl.children);
    diceEls.forEach(d => {
      d.classList.remove('pop');
      d.classList.add('rolling');
    });

    const interval = setInterval(() => {
      diceEls.forEach(die => {
        renderDiePips(die, Math.floor(Math.random() * 6) + 1);
      });
    }, 60);

    setTimeout(() => {
      clearInterval(interval);
      let sum = 0;
      diceEls.forEach(die => {
        const val = Math.floor(Math.random() * 6) + 1;
        sum += val;
        die.classList.remove('rolling');
        die.classList.add('pop');
        renderDiePips(die, val);
        setTimeout(() => die.classList.remove('pop'), 180);
      });
      totalValEl.textContent = sum;
      isRolling = false;
    }, 320);
  }

  btnMinusEl.addEventListener('click', () => setDiceCount(diceCount - 1));
  btnPlusEl.addEventListener('click', () => setDiceCount(diceCount + 1));

  quickPicksEl.querySelectorAll('.btn-pick').forEach(btn => {
    btn.addEventListener('click', () => setDiceCount(Number(btn.dataset.count)));
  });

  btnStartEl.addEventListener('click', () => {
    modalEl.classList.add('hidden');
    buildDice();
    roll();
  });

  btnChangeCountEl.addEventListener('click', () => {
    if (isRolling) return;
    modalEl.classList.remove('hidden');
  });

  btnRollEl.addEventListener('click', roll);

  window.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

    const modalOpen = !modalEl.classList.contains('hidden');
    if (modalOpen) {
      if (e.key === 'ArrowLeft' || e.key === '-') setDiceCount(diceCount - 1);
      else if (e.key === 'ArrowRight' || e.key === '+') setDiceCount(diceCount + 1);
      else if (e.key >= '1' && e.key <= '9') setDiceCount(Number(e.key));
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btnStartEl.click();
      }
      return;
    }

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      roll();
    }
  });

  buildDice();
})();
