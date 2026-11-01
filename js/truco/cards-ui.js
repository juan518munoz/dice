(function () {
  const { getCardPower, SUIT_SHORT } = window.TrucoRules;

  function getSuitSvg(suit, isMini = false) {
    const size = isMini ? 14 : 46;
    if (suit === 'espada') {
      return `<svg class="suit-svg suit-espada" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 2 L20 7 L19 20 L13 20 L12 7 Z" fill="#009dff" stroke="#0b0f11" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M16 4 L16 19" stroke="#fffdf5" stroke-width="1.6" stroke-linecap="round"/>
        <rect x="8" y="20" width="16" height="4" rx="2" fill="#f5b841" stroke="#0b0f11" stroke-width="2"/>
        <rect x="14" y="24" width="4" height="5" rx="1" fill="#c98219" stroke="#0b0f11" stroke-width="2"/>
        <circle cx="16" cy="29.5" r="2" fill="#fe5f55" stroke="#0b0f11" stroke-width="1.6"/>
      </svg>`;
    }
    if (suit === 'basto') {
      return `<svg class="suit-svg suit-basto" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M11 5 C11 2, 21 2, 21 5 L19 27 C19 29, 13 29, 13 27 Z" fill="#c98219" stroke="#0b0f11" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M10 11 C5 9, 5 15, 11 14 Z" fill="#38b87c" stroke="#0b0f11" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M22 14 C27 12, 27 18, 21 17 Z" fill="#38b87c" stroke="#0b0f11" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M11 19 C6 18, 6 23, 12 22 Z" fill="#38b87c" stroke="#0b0f11" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="16" cy="8" r="2.2" fill="#f5b841"/>
      </svg>`;
    }
    if (suit === 'oro') {
      return `<svg class="suit-svg suit-oro" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="12" fill="#f5b841" stroke="#0b0f11" stroke-width="2.2"/>
        <circle cx="16" cy="16" r="8.2" fill="#ff981f" stroke="#0b0f11" stroke-width="1.6"/>
        <path d="M16 9 L18 14 L23 16 L18 18 L16 23 L14 18 L9 16 L14 14 Z" fill="#fffdf5" stroke="#0b0f11" stroke-width="1.4" stroke-linejoin="round"/>
      </svg>`;
    }
    // copa
    return `<svg class="suit-svg suit-copa" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M8 6 H24 L22 16 C21 20, 11 20, 10 16 Z" fill="#fe5f55" stroke="#0b0f11" stroke-width="2.2" stroke-linejoin="round"/>
      <rect x="14" y="19" width="4" height="6" fill="#f5b841" stroke="#0b0f11" stroke-width="2"/>
      <rect x="9" y="25" width="14" height="4" rx="2" fill="#f5b841" stroke="#0b0f11" stroke-width="2"/>
      <path d="M11 9 H21" stroke="#fffdf5" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`;
  }

  function getFigureBadge(rank) {
    if (rank === 10) return 'SOTA';
    if (rank === 11) return 'CAB';
    if (rank === 12) return 'REY';
    return '';
  }

  function createTrucoCardElement(card, options = {}) {
    const el = document.createElement('div');
    const power = getCardPower(card);
    const isBravo = power >= 11; // 1 espada, 1 basto, 7 espada, 7 oro
    const figLabel = getFigureBadge(card.rank);

    el.className = [
      'truco-card',
      `suit-${card.suit}`,
      isBravo ? 'bravo-card' : '',
      options.interactive ? 'interactive' : '',
      options.small ? 'card-small' : ''
    ].filter(Boolean).join(' ');

    el.dataset.cardId = card.id;

    el.innerHTML = `
      <div class="tcard-corner tcard-top">
        <span class="tcard-rank">${card.rank}</span>
        ${getSuitSvg(card.suit, true)}
      </div>
      <div class="tcard-center">
        ${getSuitSvg(card.suit, false)}
        ${figLabel ? `<span class="tcard-fig-tag">${figLabel}</span>` : `<span class="tcard-suit-tag">${SUIT_SHORT[card.suit] || ''}</span>`}
      </div>
      <div class="tcard-corner tcard-bottom">
        <span class="tcard-rank">${card.rank}</span>
        ${getSuitSvg(card.suit, true)}
      </div>
    `;

    return el;
  }

  function createCardBackElement(small = false) {
    const el = document.createElement('div');
    el.className = 'truco-card card-back' + (small ? ' card-small' : '');
    el.innerHTML = `
      <div class="card-back-pattern">
        <span class="card-back-emblem">★</span>
      </div>
    `;
    return el;
  }

  function renderMatchsticksHTML(halfPoints) {
    const pts = Math.min(15, Math.max(0, halfPoints || 0));
    let html = '<div class="fosforos-group">';
    for (let box = 0; box < 3; box++) {
      const boxPts = Math.min(5, Math.max(0, pts - box * 5));
      html += `<div class="fosforo-box" data-count="${boxPts}">`;
      for (let m = 1; m <= 5; m++) {
        if (m <= boxPts) {
          html += `<span class="fosforo m${m}"></span>`;
        }
      }
      html += `</div>`;
    }
    html += '</div>';
    return html;
  }

  window.TrucoCardsUI = {
    createTrucoCardElement,
    createCardBackElement,
    renderMatchsticksHTML
  };
})();
