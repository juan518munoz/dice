(function () {
  const { getCardPower, SUIT_SHORT } = window.TrucoRules;

  const SUIT_COLORS = {
    espada: { main: '#2c5e8a', hi: '#009dff', accent: '#fe5f55', dark: '#1b3644' },
    basto:  { main: '#2a7a4c', hi: '#38b87c', accent: '#c98219', dark: '#1a472d' },
    oro:    { main: '#d98a16', hi: '#f5b841', accent: '#fe5f55', dark: '#7a4905' },
    copa:   { main: '#d6382e', hi: '#fe5f55', accent: '#f5b841', dark: '#7a1c16' }
  };

  /**
   * Balatro-style corner pixel emblem + vertical pixel trail (inspired by Balatro's corner index)
   */
  function getCornerPixelEmblem(suit) {
    const c = SUIT_COLORS[suit] || SUIT_COLORS.espada;
    if (suit === 'espada') {
      return `<svg class="tcard-corner-svg" viewBox="0 0 10 22" shape-rendering="crispEdges" aria-hidden="true">
        <!-- Mini pixel sword + Balatro pixel drip -->
        <rect x="4" y="0" width="2" height="2" fill="${c.dark}"/>
        <rect x="3" y="2" width="4" height="4" fill="${c.main}"/>
        <rect x="4" y="2" width="1" height="4" fill="${c.hi}"/>
        <rect x="1" y="6" width="8" height="2" fill="#f5b841"/>
        <rect x="4" y="8" width="2" height="3" fill="${c.dark}"/>
        <!-- Balatro red/slate pixel Matrix trail -->
        <rect x="2" y="12" width="2" height="5" fill="${c.accent}"/>
        <rect x="4" y="11" width="2" height="8" fill="${c.dark}"/>
        <rect x="6" y="13" width="2" height="4" fill="${c.accent}"/>
        <rect x="3" y="17" width="2" height="4" fill="${c.accent}"/>
        <rect x="5" y="19" width="1" height="3" fill="${c.dark}"/>
      </svg>`;
    }
    if (suit === 'basto') {
      return `<svg class="tcard-corner-svg" viewBox="0 0 10 22" shape-rendering="crispEdges" aria-hidden="true">
        <rect x="3" y="0" width="4" height="5" fill="${c.accent}"/>
        <rect x="1" y="3" width="2" height="2" fill="${c.hi}"/>
        <rect x="7" y="4" width="2" height="2" fill="${c.hi}"/>
        <rect x="4" y="5" width="2" height="5" fill="${c.accent}"/>
        <!-- Pixel trail -->
        <rect x="2" y="11" width="2" height="6" fill="${c.hi}"/>
        <rect x="4" y="10" width="2" height="8" fill="${c.dark}"/>
        <rect x="6" y="12" width="2" height="5" fill="${c.hi}"/>
        <rect x="3" y="17" width="2" height="4" fill="${c.accent}"/>
        <rect x="5" y="18" width="1" height="4" fill="${c.dark}"/>
      </svg>`;
    }
    if (suit === 'oro') {
      return `<svg class="tcard-corner-svg" viewBox="0 0 10 22" shape-rendering="crispEdges" aria-hidden="true">
        <rect x="2" y="1" width="6" height="6" fill="${c.hi}"/>
        <rect x="3" y="0" width="4" height="8" fill="${c.hi}"/>
        <rect x="3" y="2" width="4" height="4" fill="${c.main}"/>
        <rect x="4" y="3" width="2" height="2" fill="#fffdf5"/>
        <!-- Pixel trail -->
        <rect x="2" y="10" width="2" height="6" fill="${c.accent}"/>
        <rect x="4" y="9" width="2" height="9" fill="${c.hi}"/>
        <rect x="6" y="11" width="2" height="5" fill="${c.main}"/>
        <rect x="3" y="16" width="2" height="4" fill="${c.accent}"/>
        <rect x="5" y="18" width="1" height="4" fill="${c.dark}"/>
      </svg>`;
    }
    // copa
    return `<svg class="tcard-corner-svg" viewBox="0 0 10 22" shape-rendering="crispEdges" aria-hidden="true">
      <rect x="1" y="0" width="8" height="2" fill="${c.hi}"/>
      <rect x="2" y="2" width="6" height="4" fill="${c.main}"/>
      <rect x="4" y="6" width="2" height="2" fill="#f5b841"/>
      <rect x="2" y="8" width="6" height="2" fill="#f5b841"/>
      <!-- Pixel trail -->
      <rect x="2" y="11" width="2" height="6" fill="${c.hi}"/>
      <rect x="4" y="10" width="2" height="8" fill="${c.dark}"/>
      <rect x="6" y="12" width="2" height="5" fill="#f5b841"/>
      <rect x="3" y="17" width="2" height="4" fill="${c.hi}"/>
      <rect x="5" y="18" width="1" height="4" fill="${c.dark}"/>
    </svg>`;
  }

  /**
   * Large Crisp Pixel-Art Center Artwork (Balatro style)
   */
  function getCenterPixelSvg(suit, rank, isBravo) {
    if (suit === 'espada') {
      return `<svg class="suit-svg suit-espada" viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">
        ${isBravo ? `
          <!-- Golden Bravo Aura -->
          <rect x="6" y="7" width="20" height="2" fill="#f5b841" opacity="0.45"/>
          <rect x="4" y="11" width="24" height="2" fill="#f5b841" opacity="0.35"/>
          <rect x="7" y="15" width="18" height="2" fill="#f5b841" opacity="0.45"/>
        ` : ''}
        <!-- Outline of Sword Blade -->
        <rect x="15" y="1" width="2" height="2" fill="#182024"/>
        <rect x="14" y="3" width="4" height="3" fill="#182024"/>
        <rect x="13" y="6" width="6" height="13" fill="#182024"/>
        <!-- Inner Blade Steel & Blue Shine -->
        <rect x="15" y="3" width="2" height="16" fill="#009dff"/>
        <rect x="14" y="6" width="1" height="13" fill="#bfe6ff"/>
        <rect x="17" y="6" width="1" height="13" fill="#1b5278"/>
        <rect x="15" y="5" width="1" height="12" fill="#fffdf5"/>
        <!-- Crossguard -->
        <rect x="7" y="19" width="18" height="4" fill="#182024"/>
        <rect x="8" y="20" width="16" height="2" fill="#f5b841"/>
        <rect x="9" y="20" width="14" height="1" fill="#fffdf5"/>
        <!-- Grip -->
        <rect x="13" y="23" width="6" height="4" fill="#182024"/>
        <rect x="14" y="23" width="4" height="4" fill="#c98219"/>
        <rect x="14" y="24" width="4" height="1" fill="#f5b841"/>
        <!-- Ruby Pommel -->
        <rect x="12" y="27" width="8" height="4" fill="#182024"/>
        <rect x="13" y="28" width="6" height="2" fill="#fe5f55"/>
        <rect x="14" y="28" width="2" height="1" fill="#fffdf5"/>
      </svg>`;
    }

    if (suit === 'basto') {
      return `<svg class="suit-svg suit-basto" viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">
        ${isBravo ? `
          <rect x="5" y="8" width="22" height="2" fill="#f5b841" opacity="0.45"/>
          <rect x="7" y="14" width="18" height="2" fill="#f5b841" opacity="0.35"/>
        ` : ''}
        <!-- Wooden Club Head (Top) -->
        <rect x="11" y="2" width="10" height="3" fill="#182024"/>
        <rect x="9" y="5" width="14" height="8" fill="#182024"/>
        <rect x="10" y="13" width="12" height="7" fill="#182024"/>
        <rect x="12" y="20" width="8" height="9" fill="#182024"/>
        <rect x="13" y="29" width="6" height="2" fill="#182024"/>
        <!-- Wood Fill -->
        <rect x="12" y="3" width="8" height="2" fill="#c98219"/>
        <rect x="10" y="5" width="12" height="8" fill="#c98219"/>
        <rect x="11" y="13" width="10" height="7" fill="#a86408"/>
        <rect x="13" y="20" width="6" height="9" fill="#8f5103"/>
        <!-- Wood Highlight -->
        <rect x="12" y="4" width="3" height="14" fill="#f5b841"/>
        <rect x="14" y="20" width="2" height="7" fill="#c98219"/>
        <!-- Green Sprouting Leaves -->
        <rect x="4" y="8" width="5" height="4" fill="#182024"/>
        <rect x="5" y="9" width="4" height="2" fill="#38b87c"/>
        <rect x="23" y="11" width="5" height="4" fill="#182024"/>
        <rect x="23" y="12" width="4" height="2" fill="#38b87c"/>
        <rect x="5" y="16" width="5" height="4" fill="#182024"/>
        <rect x="6" y="17" width="4" height="2" fill="#38b87c"/>
        <!-- Gold Knot -->
        <rect x="16" y="8" width="3" height="3" fill="#fffdf5"/>
      </svg>`;
    }

    if (suit === 'oro') {
      return `<svg class="suit-svg suit-oro" viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">
        <!-- Pixel Coin Outer Border -->
        <rect x="10" y="2" width="12" height="28" fill="#182024"/>
        <rect x="6" y="4" width="20" height="24" fill="#182024"/>
        <rect x="4" y="6" width="24" height="20" fill="#182024"/>
        <rect x="2" y="10" width="28" height="12" fill="#182024"/>
        <!-- Gold Rim -->
        <rect x="10" y="4" width="12" height="24" fill="#f5b841"/>
        <rect x="6" y="6" width="20" height="20" fill="#f5b841"/>
        <rect x="4" y="10" width="24" height="12" fill="#f5b841"/>
        <!-- Inner Sun Ring -->
        <rect x="10" y="7" width="12" height="18" fill="#d97b0c"/>
        <rect x="7" y="10" width="18" height="12" fill="#d97b0c"/>
        <!-- Center Star Emblem -->
        <rect x="15" y="8" width="2" height="16" fill="#fffdf5"/>
        <rect x="8" y="15" width="16" height="2" fill="#fffdf5"/>
        <rect x="12" y="12" width="8" height="8" fill="#f5b841"/>
        <rect x="14" y="14" width="4" height="4" fill="#fe5f55"/>
      </svg>`;
    }

    // copa
    return `<svg class="suit-svg suit-copa" viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">
      <!-- Goblet Rim & Bowl Outline -->
      <rect x="6" y="3" width="20" height="3" fill="#182024"/>
      <rect x="7" y="6" width="18" height="8" fill="#182024"/>
      <rect x="9" y="14" width="14" height="4" fill="#182024"/>
      <!-- Stem & Base Outline -->
      <rect x="13" y="18" width="6" height="7" fill="#182024"/>
      <rect x="8" y="25" width="16" height="5" fill="#182024"/>
      <!-- Goblet Bowl Fill -->
      <rect x="7" y="4" width="18" height="2" fill="#f5b841"/>
      <rect x="8" y="6" width="16" height="7" fill="#fe5f55"/>
      <rect x="10" y="13" width="12" height="4" fill="#c92b22"/>
      <!-- Bowl Shine -->
      <rect x="10" y="7" width="3" height="6" fill="#fffdf5"/>
      <rect x="14" y="7" width="6" height="2" fill="#ff968f"/>
      <!-- Gold Stem & Base Fill -->
      <rect x="14" y="18" width="4" height="7" fill="#f5b841"/>
      <rect x="15" y="19" width="1" height="5" fill="#fffdf5"/>
      <rect x="9" y="26" width="14" height="3" fill="#f5b841"/>
      <rect x="10" y="26" width="12" height="1" fill="#fffdf5"/>
    </svg>`;
  }

  function getFigureBadge(rank) {
    if (rank === 10) return 'SOTA';
    if (rank === 11) return 'CABALLO';
    if (rank === 12) return 'REY';
    return '';
  }

  function getBravoBadge(card) {
    if (card.rank === 1 && card.suit === 'espada') return 'ANCHO ESP';
    if (card.rank === 1 && card.suit === 'basto') return 'ANCHO BAS';
    if (card.rank === 7 && card.suit === 'espada') return 'SIETE ESP';
    if (card.rank === 7 && card.suit === 'oro') return 'SIETE ORO';
    return '';
  }

  function createTrucoCardElement(card, options = {}) {
    const el = document.createElement('div');
    const power = getCardPower(card);
    const isBravo = power >= 11; // 1 espada, 1 basto, 7 espada, 7 oro
    const figLabel = getFigureBadge(card.rank);
    const bravoLabel = getBravoBadge(card);
    const badgeText = bravoLabel || figLabel;

    el.className = [
      'truco-card',
      `suit-${card.suit}`,
      isBravo ? 'bravo-card' : '',
      options.interactive ? 'interactive' : '',
      options.small ? 'card-small' : '',
      options.tableCard ? 'card-table' : ''
    ].filter(Boolean).join(' ');

    el.dataset.cardId = card.id;

    const cornerEmblem = getCornerPixelEmblem(card.suit);

    el.innerHTML = `
      <div class="tcard-inner-frame"></div>
      <div class="tcard-corner tcard-top-left">
        <span class="tcard-rank">${card.rank}</span>
        ${cornerEmblem}
      </div>
      <div class="tcard-center">
        ${getCenterPixelSvg(card.suit, card.rank, isBravo)}
        ${badgeText ? `<span class="tcard-fig-tag ${isBravo ? 'bravo-tag' : ''}">${badgeText}</span>` : ''}
      </div>
      <div class="tcard-corner tcard-bottom-right">
        <span class="tcard-rank">${card.rank}</span>
        ${cornerEmblem}
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
