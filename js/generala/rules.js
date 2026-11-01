(function () {
  const CATEGORIES = [
    { id: '1', label: '1', hint: 'Sum of 1s' },
    { id: '2', label: '2', hint: 'Sum of 2s' },
    { id: '3', label: '3', hint: 'Sum of 3s' },
    { id: '4', label: '4', hint: 'Sum of 4s' },
    { id: '5', label: '5', hint: 'Sum of 5s' },
    { id: '6', label: '6', hint: 'Sum of 6s' },
    { id: 'escalera', label: 'Escalera', hint: '20 / 25s' },
    { id: 'full',     label: 'Full',     hint: '30 / 35s' },
    { id: 'poker',    label: 'Póker',    hint: '40 / 45s' },
    { id: 'generala', label: 'Generala', hint: '50 / 100s' }
  ];

  function isEscalera(dice) {
    const s = [...new Set(dice)].sort((a, b) => a - b).join('');
    // 1-2-3-4-5, 2-3-4-5-6, or wrap-around 3-4-5-6-1 (sorted: 13456)
    return s === '12345' || s === '23456' || s === '13456';
  }

  function getCounts(dice) {
    const counts = {};
    for (const d of dice) counts[d] = (counts[d] || 0) + 1;
    return Object.values(counts).sort((a, b) => b - a);
  }

  function scoreCategory(catId, dice, rollsUsed, isServidaThrow) {
    if (!dice || dice.length !== 5 || rollsUsed === 0) return 0;
    const servida = Boolean(isServidaThrow);

    if (catId >= '1' && catId <= '6') {
      const target = Number(catId);
      return dice.filter(d => d === target).reduce((a, b) => a + b, 0);
    }

    const freq = getCounts(dice);

    if (catId === 'escalera') {
      return isEscalera(dice) ? (servida ? 25 : 20) : 0;
    }

    if (catId === 'full') {
      return ((freq[0] === 3 && freq[1] === 2) || freq[0] === 5) ? (servida ? 35 : 30) : 0;
    }

    if (catId === 'poker') {
      return freq[0] >= 4 ? (servida ? 45 : 40) : 0;
    }

    if (catId === 'generala') {
      return freq[0] === 5 ? (servida ? 100 : 50) : 0;
    }

    return 0;
  }

  function detectBestCallout(dice, rollsUsed, isServidaThrow) {
    if (rollsUsed === 0) return '';
    const freq = getCounts(dice);
    const suffix = isServidaThrow ? ' Servida!' : '!';
    if (freq[0] === 5) return 'Generala' + suffix;
    if (freq[0] >= 4) return 'Póker' + (isServidaThrow ? ' Servido!' : '!');
    if (freq[0] === 3 && freq[1] === 2) return 'Full' + (isServidaThrow ? ' Servido!' : '!');
    if (isEscalera(dice)) return 'Escalera' + suffix;
    return '';
  }

  function getPlayerTotal(scoresObj) {
    return Object.values(scoresObj || {}).reduce((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
  }

  window.GeneralaRules = {
    CATEGORIES,
    isEscalera,
    getCounts,
    scoreCategory,
    detectBestCallout,
    getPlayerTotal
  };
})();
