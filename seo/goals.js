/* ── Goal evaluation ──────────────────────────────────────────────────────── */
'use strict';

const google = require('./google');

// ── Goal type definitions ──────────────────────────────────────────────────

const GOAL_TYPES = {
  keyword_position: {
    label: 'Pozycja konkretnej frazy',
    hint: 'Np. „botoks warszawa" ma być na pozycji ≤ 5',
    fields: [
      { key: 'keyword',     label: 'Fraza kluczowa', type: 'keyword-select' },
      { key: 'maxPosition', label: 'Maksymalna pozycja (≤)', type: 'number', min: 1, max: 100, placeholder: '10' }
    ],
    suggestions: [
      { values: { maxPosition: 10 }, label: 'Pierwsza strona', desc: 'Pozycje 1–10 to wyniki na pierwszej stronie Google. Minimum, żeby klient Cię znalazł.' },
      { values: { maxPosition: 5  }, label: 'Top 5',           desc: 'Zbiera ~65% kliknięć dla danej frazy. Solidny cel dla ważnych zabiegów.' },
      { values: { maxPosition: 3  }, label: 'Złota trójka',    desc: 'Pozycje 1–3 zgarniają ~60% wszystkich kliknięć. Warto dla głównych fraz.' }
    ],
    desc: (p) => `Fraza „${p.keyword}" na pozycji ≤ ${p.maxPosition}`,
    unit: '',
    lowerIsBetter: true,
    evaluate(p, kwData) {
      const kw = (kwData?.keywords || []).find(k => k.keyword.toLowerCase() === (p.keyword || '').toLowerCase());
      const current = kw?.position ?? null;
      const target  = Number(p.maxPosition) || null;
      if (current === null || !target) return { current, target, status: 'unknown', progress: 0 };
      const status = current <= target ? 'ok' : current <= target * 1.3 ? 'warn' : 'fail';
      const progress = Math.round(Math.min(1, target / current) * 100);
      return { current, target, status, progress };
    }
  },

  keywords_in_top_n: {
    label: 'Liczba fraz w Top N',
    hint: 'Np. co najmniej 5 fraz w Top 10',
    fields: [
      { key: 'topN',     label: 'Top N', type: 'select', options: [3, 5, 10, 20, 30] },
      { key: 'minCount', label: 'Minimalna liczba fraz', type: 'number', min: 1, max: 50, placeholder: '5' }
    ],
    suggestions: [
      { values: { topN: '10', minCount: 3 }, label: '3 frazy w Top 10',  desc: 'Dobry punkt startowy jeśli teraz jesteś poza pierwszą stroną.' },
      { values: { topN: '10', minCount: 5 }, label: '5 fraz w Top 10',   desc: 'Realistyczny cel po 3–6 miesiącach współpracy z agencją.' },
      { values: { topN: '10', minCount: 8 }, label: '8 fraz w Top 10',   desc: 'Zdominuj pierwszą stronę Google dla kliniki estetycznej.' },
      { values: { topN: '5',  minCount: 3 }, label: '3 frazy w Top 5',   desc: 'Top 5 zgarnia prawie 2/3 kliknięć. Mocny wyróżnik na tle konkurencji.' }
    ],
    desc: (p) => `Min. ${p.minCount} fraz w Top ${p.topN}`,
    unit: 'fraz',
    lowerIsBetter: false,
    evaluate(p, kwData) {
      const topN    = Number(p.topN) || 10;
      const current = (kwData?.keywords || []).filter(k => k.position !== null && k.position <= topN).length;
      const target  = Number(p.minCount) || null;
      if (!target) return { current, target, status: 'unknown', progress: 0 };
      const status = current >= target ? 'ok' : current >= target * 0.8 ? 'warn' : 'fail';
      const progress = Math.round(Math.min(1, current / target) * 100);
      return { current, target, status, progress };
    }
  },

  traffic_growth: {
    label: 'Wzrost ruchu organicznego (%)',
    hint: 'Np. ruch wzrośnie o co najmniej +15% vs poprzedni okres',
    fields: [
      { key: 'minGrowthPct', label: 'Minimalny wzrost (%)', type: 'number', min: -100, max: 500, placeholder: '15' }
    ],
    suggestions: [
      { values: { minGrowthPct: 10 }, label: '+10% — stabilny',   desc: 'Minimum dla zdrowej kampanii SEO. Poniżej tego wynik może być efektem sezonowości.' },
      { values: { minGrowthPct: 20 }, label: '+20% — solidny',    desc: 'Realny cel dla agencji aktywnie tworzącej treści i budującej linki.' },
      { values: { minGrowthPct: 30 }, label: '+30% — ambitny',    desc: 'Wymaga dużego nakładu pracy. Odpowiedni jeśli zaczynasz od niskiej bazy.' },
      { values: { minGrowthPct: 50 }, label: '+50% — agresywny',  desc: 'Dla nowych stron lub po rebrandingu. Warto wpisać do umowy z agencją.' }
    ],
    desc: (p) => `Wzrost ruchu o min. +${p.minGrowthPct}% vs poprzedni okres`,
    unit: '%',
    lowerIsBetter: false,
    evaluate(p, _kwData, trafficData) {
      const current = trafficData?.sessionsDelta ?? null;
      const target  = Number(p.minGrowthPct);
      if (current === null) return { current, target, status: 'unknown', progress: 0 };
      const status = current >= target ? 'ok' : current >= target - 5 ? 'warn' : 'fail';
      const progress = target > 0
        ? Math.round(Math.min(1, Math.max(0, current / target)) * 100)
        : current >= 0 ? 100 : 0;
      return { current, target, status, progress };
    }
  },

  min_sessions: {
    label: 'Minimalna liczba sesji organicznych',
    hint: 'Np. co najmniej 500 sesji z Google w danym okresie',
    fields: [
      { key: 'minSessions', label: 'Minimalna liczba sesji', type: 'number', min: 1, placeholder: '500' }
    ],
    suggestions: [
      { values: { minSessions: 100  }, label: '100 sesji — start',        desc: 'Minimum dla nowej strony. Potwierdza, że SEO w ogóle zaczyna działać.' },
      { values: { minSessions: 300  }, label: '300 sesji — widoczność',   desc: 'Klienci zaczynają Cię znajdować. Dobry cel po pierwszych 6 miesiącach.' },
      { values: { minSessions: 500  }, label: '500 sesji — solidna baza', desc: 'Przy średnim CTR ~3% to ok. 15 000 wyświetleń — solidna widoczność lokalna.' },
      { values: { minSessions: 1000 }, label: '1000 sesji — lider',       desc: 'W branży gabinetów estetycznych w Warszawie to poziom lidera rynku.' }
    ],
    desc: (p) => `Min. ${Number(p.minSessions).toLocaleString('pl')} sesji organicznych`,
    unit: 'sesji',
    lowerIsBetter: false,
    evaluate(p, _kwData, trafficData) {
      const current = trafficData?.current?.sessions ?? null;
      const target  = Number(p.minSessions) || null;
      if (current === null || !target) return { current, target, status: 'unknown', progress: 0 };
      const status = current >= target ? 'ok' : current >= target * 0.8 ? 'warn' : 'fail';
      const progress = Math.round(Math.min(1, current / target) * 100);
      return { current, target, status, progress };
    }
  },

  keyword_ctr: {
    label: 'CTR konkretnej frazy',
    hint: 'Np. CTR frazy „botoks warszawa" ≥ 5%',
    fields: [
      { key: 'keyword', label: 'Fraza kluczowa', type: 'keyword-select' },
      { key: 'minCtr',  label: 'Minimalny CTR (%)', type: 'number', min: 0.1, max: 100, step: 0.1, placeholder: '5' }
    ],
    suggestions: [
      { values: { minCtr: 2 }, label: '2% — minimum',        desc: 'Dla ogólnych fraz to norma. Poniżej warto poprawić meta title i description.' },
      { values: { minCtr: 5 }, label: '5% — dobry wynik',    desc: 'Atrakcyjny tytuł i opis przekonują do kliknięcia. Powyżej średniej branżowej.' },
      { values: { minCtr: 8 }, label: '8% — bardzo dobry',   desc: 'Osiągalny dla fraz z nazwą marki lub bardzo precyzyjnych zapytań lokalnych.' }
    ],
    desc: (p) => `CTR frazy „${p.keyword}" ≥ ${p.minCtr}%`,
    unit: '%',
    lowerIsBetter: false,
    evaluate(p, kwData) {
      const kw      = (kwData?.keywords || []).find(k => k.keyword.toLowerCase() === (p.keyword || '').toLowerCase());
      const current = kw?.ctr ?? null;
      const target  = Number(p.minCtr) || null;
      if (current === null || !target) return { current, target, status: 'unknown', progress: 0 };
      const status = current >= target ? 'ok' : current >= target * 0.8 ? 'warn' : 'fail';
      const progress = Math.round(Math.min(1, current / target) * 100);
      return { current, target, status, progress };
    }
  },

  min_impressions: {
    label: 'Minimalna liczba wyświetleń (łącznie)',
    hint: 'Np. co najmniej 10 000 wyświetleń w wynikach Google',
    fields: [
      { key: 'minImpressions', label: 'Minimalna liczba wyświetleń', type: 'number', min: 1, placeholder: '10000' }
    ],
    suggestions: [
      { values: { minImpressions: 1000  }, label: '1 000 — start',         desc: 'Potwierdza indeksowanie i widoczność. Punkt wyjścia dla nowych stron.' },
      { values: { minImpressions: 5000  }, label: '5 000 — widoczność',    desc: 'Strona pojawia się regularnie w wynikach, nawet na słabszych pozycjach.' },
      { values: { minImpressions: 10000 }, label: '10 000 — solidna baza', desc: 'Typowy wynik po 6–12 miesiącach SEO dla gabinetu w dużym mieście.' },
      { values: { minImpressions: 20000 }, label: '20 000 — lider',        desc: 'Bardzo duża widoczność — domena jest rozpoznawalna przez algorytm Google.' }
    ],
    desc: (p) => `Min. ${Number(p.minImpressions).toLocaleString('pl')} wyświetleń`,
    unit: 'wyśw.',
    lowerIsBetter: false,
    evaluate(p, kwData) {
      const current = (kwData?.keywords || []).reduce((s, k) => s + (k.impressions || 0), 0);
      const target  = Number(p.minImpressions) || null;
      if (!target) return { current, target, status: 'unknown', progress: 0 };
      const status = current >= target ? 'ok' : current >= target * 0.8 ? 'warn' : 'fail';
      const progress = Math.round(Math.min(1, current / target) * 100);
      return { current, target, status, progress };
    }
  }
};

// ── Evaluation ─────────────────────────────────────────────────────────────

async function evaluateGoals(goals, opts = {}) {
  if (!goals || !goals.length) return [];

  const [kwData, trafficData] = await Promise.all([
    google.fetchKeywords(opts).catch(() => null),
    google.fetchTraffic(opts).catch(() => null)
  ]);

  return goals.map(goal => {
    const typeInfo = GOAL_TYPES[goal.type];
    if (!typeInfo) return { ...goal, status: 'unknown', progress: 0, desc: goal.type };

    let evaluated = { current: null, target: null, status: 'unknown', progress: 0 };
    try { evaluated = typeInfo.evaluate(goal.params || {}, kwData, trafficData); } catch {}

    return {
      ...goal,
      desc:          typeInfo.desc(goal.params || {}),
      unit:          typeInfo.unit,
      lowerIsBetter: typeInfo.lowerIsBetter || false,
      ...evaluated
    };
  });
}

module.exports = { evaluateGoals, GOAL_TYPES };
