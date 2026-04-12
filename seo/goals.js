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
