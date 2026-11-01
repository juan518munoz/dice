(function () {
  const PIP_PATTERNS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };

  function createDieElement(extraClass = '') {
    const die = document.createElement('div');
    die.className = ('die ' + extraClass).trim();
    for (let p = 0; p < 9; p++) {
      const pip = document.createElement('div');
      pip.className = 'pip';
      die.appendChild(pip);
    }
    return die;
  }

  function renderDiePips(dieEl, val) {
    if (!dieEl) return;
    dieEl.dataset.val = val;
    const active = PIP_PATTERNS[val] || [];
    const pips = dieEl.querySelectorAll('.pip');
    pips.forEach((pip, idx) => {
      pip.classList.toggle('active', active.includes(idx));
    });
  }

  window.DiceUI = {
    PIP_PATTERNS,
    createDieElement,
    renderDiePips
  };
})();
