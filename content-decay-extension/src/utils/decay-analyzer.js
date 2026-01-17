// Content Decay Analysis Engine
// Detects declining content based on Search Console metrics using 3-level diagnosis

/**
 * Analyze content decay using advanced diagnostic patterns
 * @param {Array} pageComparisons - Array of page objects with current, previous, and recent metrics
 * @param {object} options - Analysis options including weights
 * @returns {Array} Analyzed pages sorted by decay severity
 */
export function analyzeContentDecay(comparisonResult, options = {}) {
  const weights = options.weights || {
    clicks: 0.4,
    impressions: 0.3,
    ctr: 0.2,
    position: 2.0
  };

  const pages = comparisonResult.pages || comparisonResult; // Handle both old array and new object format
  const dateRanges = comparisonResult.dateRanges || null;

  const analyzed = pages
    .filter(page => page.previous !== null)
    .map(page => {
      const diagnosis = diagnoseDecay(page, weights);
      return {
        ...page,
        decay: diagnosis
      };
    })
    .sort((a, b) => b.decay.score - a.decay.score);

  return {
    pages: analyzed,
    dateRanges
  };
}

/**
 * Advanced Diagnosis System (The Revival Engine)
 * @param {object} page - Page object with {current, previous, recent} data
 * @param {object} weights - User configured weights
 */
function diagnoseDecay(page, weights) {
  const current = page.current;
  const previous = page.previous;
  const recent = page.recent;

  // 1. Calculate Standard Deltas
  const changes = {
    clicks: calculatePercentChange(current.clicks, previous.clicks),
    impressions: calculatePercentChange(current.impressions, previous.impressions),
    ctr: calculatePercentChange(current.ctr, previous.ctr),
    position: previous.position - current.position // Positive = improved
  };

  // 2. Revival Score (Opportunity Calculation)
  // "How many clicks SHOULD this page be getting vs what it IS getting?"
  // Simplified Model: Assume top ranking achieves ~20% CTR.
  // Revival Potential = (Impressions * 0.20) - Current Clicks
  // We weight it by Position to be realistic (if you are pos 50, potential is lower unless you rank up)
  // BUT the user wants "Revival", so we assume the goal is to rank up.
  const idealCtr = 0.20;
  const potentialClicks = current.impressions * idealCtr;
  const revivalScore = Math.max(0, Math.round(potentialClicks - current.clicks));

  // 3. Velocity Checks
  let velocityScore = 0;
  let isCliff = false;

  if (recent) {
    const dailyClicksMonth = current.clicks / 30;
    const dailyClicksWeek = recent.clicks / 7;
    const velocityChange = calculatePercentChange(dailyClicksWeek, dailyClicksMonth);

    if (velocityChange < -30) {
      isCliff = true;
      velocityScore = 20;
    }
  }

  // 4. Taxonomy Classification (The Decay Types)
  // We classify the page into a specific "Character"
  let decayClass = 'healthy';
  const signals = [];
  const symptoms = [];

  // Class A: The Ghost Town (Zeroed out)
  if (current.clicks === 0 && current.impressions < 100) {
    decayClass = 'ghost_town';
    symptoms.push('👻 Ghost Town');
  }
  // Class B: The Zombie (High Impressions, Dead Clicks - HUGE Opportunity)
  else if (current.impressions > 1000 && current.ctr < 0.5) {
    decayClass = 'zombie';
    symptoms.push('🧟 Zombie Page');
    signals.push('low_ctr_high_imp');
  }
  // Class C: The Plunge (Velocity Cliff)
  else if (isCliff) {
    decayClass = 'plunge';
    symptoms.push('📉 The Plunge');
    signals.push('velocity_cliff');
  }
  // Class D: The Bleeder (Steady decline)
  else if (changes.clicks < -10 && changes.position > -2) {
    decayClass = 'bleeder';
    symptoms.push('🩸 The Bleeder');
    signals.push('slow_bleed');
  }
  // Class E: Rank Rot (Lost position)
  else if (changes.position < -3) {
    decayClass = 'rank_rot';
    symptoms.push('⚔️ Rank Rot');
  }
  // Healthy Check
  else if (changes.clicks > -5) {
    decayClass = 'healthy';
  } else {
    decayClass = 'decaying'; // Generic fallback
    symptoms.push('Decay Detected');
  }

  // Final Severity Mapping
  const severityMap = {
    'plunge': 'critical',
    'zombie': 'warning', // Zombie is actually high potential, so we warn to fix it
    'rank_rot': 'critical',
    'bleeder': 'warning',
    'ghost_town': 'monitoring',
    'decaying': 'monitoring',
    'healthy': 'healthy'
  };

  const severity = severityMap[decayClass];

  return {
    score: revivalScore, // Note: returning Revival Potential as the main score now!
    decayClass,
    severity,
    changes: {
      clicks: Math.round(changes.clicks * 10) / 10,
      impressions: Math.round(changes.impressions * 10) / 10,
      ctr: Math.round(changes.ctr * 10) / 10,
      position: Math.round(changes.position * 10) / 10
    },
    signals,
    symptoms,
    recommendation: getRevivalRecommendations(decayClass, signals, revivalScore)
  };
}

/**
 * Get Revival-Focused Recommendations
 */
function getRevivalRecommendations(decayClass, signals, revivalScore) {
  const recs = [];

  if (decayClass === 'zombie') {
    recs.push(`🧟 **Revive this Zombie**: It has visibility but no clicks. Fix the Title & Meta Description ASAP.`);
    recs.push(`💰 **Opportunity**: Optimizing this could yield ~${revivalScore} more clicks.`);
  }
  else if (decayClass === 'plunge') {
    recs.push('📉 **Stop the Plunge**: Technical audit required. Check robots.txt and recent code pushes.');
  }
  else if (decayClass === 'bleeder') {
    recs.push('🩸 **Stem the Bleed**: Your content is aging. Add a "Last Updated" section and fresh stats.');
  }
  else if (decayClass === 'rank_rot') {
    recs.push('⚔️ **Fight Back**: Competitors overtook you. Expand word count and add unique video/images.');
  }
  else if (decayClass === 'ghost_town') {
    recs.push('👻 **Exorcise**: This page is dead. Consider deleting or 301 redirecting to a healthy page.');
  }

  // Fallback
  if (recs.length === 0) recs.push('Monitor performance.');

  return recs;
}

/**
 * Calculate percentage change
 */
function calculatePercentChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

// -- Exports (kept for compatibility) --
export function calculateSiteSummary(analyzedPages) {
  if (analyzedPages.length === 0) return createEmptySummary();

  const grouped = groupByDecaySeverity(analyzedPages);
  const totalPages = analyzedPages.length;

  return {
    totalPages,
    criticalCount: grouped.critical.length,
    warningCount: grouped.warning.length,
    monitoringCount: grouped.monitoring.length,
    healthyCount: grouped.healthy.length,
    healthScore: Math.round(((grouped.healthy.length + grouped.monitoring.length) / totalPages) * 100),
    avgDecayScore: Math.round((analyzedPages.reduce((sum, p) => sum + p.decay.score, 0) / totalPages) * 10) / 10
  };
}

function groupByDecaySeverity(analyzedPages) {
  return {
    critical: analyzedPages.filter(p => p.decay.severity === 'critical'),
    warning: analyzedPages.filter(p => p.decay.severity === 'warning'),
    monitoring: analyzedPages.filter(p => p.decay.severity === 'monitoring'),
    healthy: analyzedPages.filter(p => p.decay.severity === 'healthy')
  };
}

function createEmptySummary() {
  return {
    totalPages: 0, criticalCount: 0, warningCount: 0, monitoringCount: 0, healthyCount: 0, healthScore: 100, avgDecayScore: 0
  };
}

export function exportToCSV(analyzedPages) {
  const headers = [
    'URL', 'Diagnosis', 'Severity', 'Score',
    'Clicks Change %', 'Impression Change %', 'CTR Change %', 'Pos Change',
    'Current Clicks', 'Previous Clicks', 'Recs'
  ];

  const rows = analyzedPages.map(p => [
    p.page,
    p.decay.symptoms.join(' + ') || 'General Decay',
    p.decay.severity,
    p.decay.score,
    p.decay.changes.clicks,
    p.decay.changes.impressions,
    p.decay.changes.ctr,
    p.decay.changes.position,
    p.current.clicks,
    p.previous?.clicks || 0,
    p.decay.recommendation[0] || ''
  ]);

  return [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
}
