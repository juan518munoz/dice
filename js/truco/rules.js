(function () {
  const SUITS = ['espada', 'basto', 'oro', 'copa'];
  const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

  const SUIT_LABELS = {
    espada: 'Espadas',
    basto: 'Bastos',
    oro: 'Oros',
    copa: 'Copas'
  };

  const SUIT_SHORT = {
    espada: 'ESP',
    basto: 'BAS',
    oro: 'ORO',
    copa: 'COP'
  };

  function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          id: `${rank}_${suit}`,
          rank,
          suit
        });
      }
    }
    return deck;
  }

  function shuffleDeck(deck) {
    const arr = [...deck];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function dealHands() {
    const deck = shuffleDeck(createDeck());
    return [
      [deck[0], deck[2], deck[4]],
      [deck[1], deck[3], deck[5]]
    ];
  }

  function getCardPower(card) {
    if (!card) return 0;
    const { rank, suit } = card;
    if (rank === 1 && suit === 'espada') return 14;
    if (rank === 1 && suit === 'basto') return 13;
    if (rank === 7 && suit === 'espada') return 12;
    if (rank === 7 && suit === 'oro') return 11;
    if (rank === 3) return 10;
    if (rank === 2) return 9;
    if (rank === 1 && (suit === 'oro' || suit === 'copa')) return 8;
    if (rank === 12) return 7;
    if (rank === 11) return 6;
    if (rank === 10) return 5;
    if (rank === 7 && (suit === 'basto' || suit === 'copa')) return 4;
    if (rank === 6) return 3;
    if (rank === 5) return 2;
    if (rank === 4) return 1;
    return 0;
  }

  function formatCardName(card) {
    if (!card) return '';
    return `${card.rank} de ${SUIT_LABELS[card.suit] || card.suit}`;
  }

  function compareCards(card0, card1) {
    const p0 = getCardPower(card0);
    const p1 = getCardPower(card1);
    if (p0 > p1) return 0;
    if (p1 > p0) return 1;
    return 'tie';
  }

  function getCardEnvidoVal(rank) {
    return rank >= 10 ? 0 : rank;
  }

  function getEnvidoScore(cards) {
    if (!Array.isArray(cards) || cards.length === 0) return 0;
    const bySuit = {};
    cards.forEach((c) => {
      if (!bySuit[c.suit]) bySuit[c.suit] = [];
      bySuit[c.suit].push(getCardEnvidoVal(c.rank));
    });

    let best = 0;
    for (const suit of Object.keys(bySuit)) {
      const vals = bySuit[suit].sort((a, b) => b - a);
      if (vals.length >= 2) {
        const suitScore = 20 + vals[0] + vals[1];
        if (suitScore > best) best = suitScore;
      } else if (vals[0] > best) {
        best = vals[0];
      }
    }
    return best;
  }

  function resolveEnvidoWinner(score0, score1, manoIndex) {
    if (score0 > score1) return 0;
    if (score1 > score0) return 1;
    return manoIndex;
  }

  function getFaltaEnvidoPoints(matchScore0, matchScore1, winnerIdx) {
    const s0 = matchScore0 || 0;
    const s1 = matchScore1 || 0;
    // Both in Malas (< 15): Falta Envido wins the match (reaches 30)
    if (s0 < 15 && s1 < 15) {
      const winnerCurrent = winnerIdx === 1 ? s1 : s0;
      return Math.max(1, 30 - winnerCurrent);
    }
    // At least one in Buenas (>= 15): worth what the leader needs to reach 30
    const leaderScore = Math.max(s0, s1);
    return Math.max(1, 30 - leaderScore);
  }

  function getEnvidoCallLabel(callType) {
    if (callType === 'ENVIDO') return 'Envido';
    if (callType === 'REAL_ENVIDO') return 'Real Envido';
    if (callType === 'FALTA_ENVIDO') return 'Falta Envido';
    return callType;
  }

  function getEnvidoChainInfo(chain, matchScore0, matchScore1) {
    if (!Array.isArray(chain) || chain.length === 0) {
      return { declinedPoints: 0, acceptedBasePoints: 0, isFalta: false };
    }
    const baseVal = (t) => (t === 'REAL_ENVIDO' ? 3 : t === 'ENVIDO' ? 2 : 0);
    const prevSum = chain.slice(0, -1).reduce((acc, t) => acc + baseVal(t), 0);
    const declinedPoints = chain.length === 1 ? 1 : prevSum;
    const last = chain[chain.length - 1];
    const isFalta = last === 'FALTA_ENVIDO';
    const acceptedBasePoints = isFalta
      ? getFaltaEnvidoPoints(matchScore0, matchScore1, 0)
      : chain.reduce((acc, t) => acc + baseVal(t), 0);

    return {
      declinedPoints,
      acceptedBasePoints,
      isFalta,
      lastCall: last,
      label: chain.map(getEnvidoCallLabel).join(' + ')
    };
  }

  function getAvailableEnvidoRaises(chain) {
    if (!Array.isArray(chain) || chain.length === 0) {
      return ['ENVIDO', 'REAL_ENVIDO', 'FALTA_ENVIDO'];
    }
    const last = chain[chain.length - 1];
    if (last === 'FALTA_ENVIDO') return [];
    if (last === 'REAL_ENVIDO') return ['FALTA_ENVIDO'];
    if (last === 'ENVIDO') {
      const envidoCount = chain.filter((c) => c === 'ENVIDO').length;
      if (envidoCount === 1) {
        return ['ENVIDO', 'REAL_ENVIDO', 'FALTA_ENVIDO'];
      }
      return ['REAL_ENVIDO', 'FALTA_ENVIDO'];
    }
    return [];
  }

  function getTrucoCallLabel(level) {
    if (level === 1) return 'Truco';
    if (level === 2) return 'Retruco';
    if (level === 3) return 'Vale Cuatro';
    return '';
  }

  function evaluateHandOutcome(tricks, manoIndex) {
    const completed = (tricks || []).filter((t) => t && t.c0 && t.c1);
    if (completed.length < 2) return null;

    const w0 = completed[0].winner;
    const w1 = completed[1].winner;

    if (completed.length === 2) {
      if (w0 === 0 && w1 === 0) return 0;
      if (w0 === 1 && w1 === 1) return 1;
      if (w0 === 'tie' && (w1 === 0 || w1 === 1)) return w1;
      if ((w0 === 0 || w0 === 1) && w1 === 'tie') return w0;
      return null;
    }

    const w2 = completed[2].winner;
    let wins0 = 0;
    let wins1 = 0;
    [w0, w1, w2].forEach((w) => {
      if (w === 0) wins0++;
      else if (w === 1) wins1++;
    });

    if (wins0 > wins1) return 0;
    if (wins1 > wins0) return 1;

    if (w0 !== 'tie') return w0;
    if (w1 !== 'tie') return w1;
    if (w2 !== 'tie') return w2;
    return manoIndex;
  }

  function formatBuenasMalas(points) {
    const p = Math.min(30, Math.max(0, points || 0));
    if (p < 15) {
      return { stage: 'Malas', count: p, total: p };
    }
    return { stage: 'Buenas', count: p - 15, total: p };
  }

  window.TrucoRules = {
    SUITS,
    RANKS,
    SUIT_LABELS,
    SUIT_SHORT,
    createDeck,
    shuffleDeck,
    dealHands,
    getCardPower,
    formatCardName,
    compareCards,
    getEnvidoScore,
    resolveEnvidoWinner,
    getFaltaEnvidoPoints,
    getEnvidoCallLabel,
    getEnvidoChainInfo,
    getAvailableEnvidoRaises,
    getTrucoCallLabel,
    evaluateHandOutcome,
    formatBuenasMalas
  };
})();
