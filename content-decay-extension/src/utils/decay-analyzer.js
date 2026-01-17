// Content Decay Analysis Engine
// Detects declining content based on Search Console metrics

/**
 * Analyze content decay for a set of pages
 * @param {Array} pageComparisons - Array of page objects with current and previous metrics
 * @returns {Array} Analyzed pages sorted by decay severity
 */
export function analyzeContentDecay(pageComparisons) {
  return pageComparisons
    .filter(page => page.previous !== null) // Only analyze pages with historical data
    .map(page => {
      const decay = calculateDecayMetrics(page.current, page.previous);
      return {
        ...page,
        decay
      };
    })
    .sort((a, b) => b.decay.score - a.decay.score); // Sort by decay score (worst first)
}

/**
 * Calculate decay metrics for a single page
 * @param {object} current - Current period metrics
 * @param {object} previous - Previous period metrics
 * @returns {object} Decay analysis with score, severity, and recommendations
 */
function calculateDecayMetrics(current, previous) {
  // Calculate percentage changes
  const changes = {
    clicks: calculatePercentChange(current.clicks, previous.clicks),
    impressions: calculatePercentChange(current.impressions, previous.impressions),
    ctr: calculatePercentChange(current.ctr, previous.ctr),
    position: previous.position - current.position // Positive = improved, Negative = declined
  };
  
  // Weighted decay score
  // Higher positive score = more decay (worse)
  // Weights reflect importance of each metric for detecting decay
  let score = 0;
  
  // Clicks are the most important - direct traffic impact
  if (changes.clicks < 0) {
    score += Math.abs(changes.clicks) * 0.4;
  }
  
  // Impressions indicate visibility loss
  if (changes.impressions < 0) {
    score += Math.abs(changes.impressions) * 0.3;
  }
  
  // CTR decline suggests relevance or competition issues
  if (changes.ctr < 0) {
    score += Math.abs(changes.ctr) * 0.2;
  }
  
  // Position change (each position drop adds to score)
  if (changes.position < 0) {
    score += Math.abs(changes.position) * 2; // Higher weight per position
  }
  
  // Determine severity
  let severity;
  if (score > 30) {
    severity = 'critical';
  } else if (score > 15) {
    severity = 'warning';
  } else if (score > 5) {
    severity = 'monitoring';
  } else {
    severity = 'healthy';
  }
  
  // Determine primary decay signals
  const signals = [];
  if (changes.impressions < -20) signals.push('visibility_drop');
  if (changes.clicks < -30) signals.push('traffic_loss');
  if (changes.ctr < -15) signals.push('ctr_decline');
  if (changes.position < -3) signals.push('ranking_drop');
  
  return {
    score: Math.round(score * 10) / 10,
    severity,
    changes: {
      clicks: Math.round(changes.clicks * 10) / 10,
      impressions: Math.round(changes.impressions * 10) / 10,
      ctr: Math.round(changes.ctr * 10) / 10,
      position: Math.round(changes.position * 10) / 10
    },
    signals,
    recommendation: getRecommendation(severity, signals)
  };
}

/**
 * Calculate percentage change between two values
 */
function calculatePercentChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Get actionable recommendations based on decay analysis
 */
function getRecommendation(severity, signals) {
  const recommendations = [];
  
  // Signal-specific recommendations
  if (signals.includes('visibility_drop')) {
    recommendations.push('Review indexation status in Search Console');
    recommendations.push('Check for technical SEO issues (robots.txt, canonical tags)');
    recommendations.push('Verify no recent site structure changes affected this URL');
  }
  
  if (signals.includes('ctr_decline')) {
    recommendations.push('Update title tag with compelling, current hooks');
    recommendations.push('Refresh meta description with clear value proposition');
    recommendations.push('Add current year to title if applicable');
    recommendations.push('Review competing SERP results for better positioning ideas');
  }
  
  if (signals.includes('ranking_drop')) {
    recommendations.push('Analyze top-ranking competitors for this topic');
    recommendations.push('Update content with fresh information and statistics');
    recommendations.push('Add comprehensive coverage of related subtopics');
    recommendations.push('Improve content structure with better headings and formatting');
  }
  
  if (signals.includes('traffic_loss')) {
    recommendations.push('Perform comprehensive content refresh');
    recommendations.push('Add internal links from high-authority pages');
    recommendations.push('Consider content consolidation if multiple similar pages exist');
    recommendations.push('Update with expert quotes or original research');
  }
  
  // Severity-specific priority messaging
  switch (severity) {
    case 'critical':
      recommendations.unshift('🚨 URGENT: High-priority content refresh needed');
      recommendations.unshift('Schedule immediate review - significant traffic loss detected');
      break;
    case 'warning':
      recommendations.unshift('⚠️ Schedule content refresh within 2-4 weeks');
      recommendations.unshift('Monitor closely - decay pattern detected');
      break;
    case 'monitoring':
      recommendations.unshift('👀 Keep watching - early signs of potential decay');
      recommendations.unshift('Consider minor updates and optimization');
      break;
    default:
      recommendations.push('✅ Content is performing well - maintain current optimization');
  }
  
  return recommendations;
}

/**
 * Group decaying content by severity
 */
export function groupByDecaySeverity(analyzedPages) {
  return {
    critical: analyzedPages.filter(p => p.decay.severity === 'critical'),
    warning: analyzedPages.filter(p => p.decay.severity === 'warning'),
    monitoring: analyzedPages.filter(p => p.decay.severity === 'monitoring'),
    healthy: analyzedPages.filter(p => p.decay.severity === 'healthy')
  };
}

/**
 * Calculate site-wide decay summary
 */
export function calculateSiteSummary(analyzedPages) {
  if (analyzedPages.length === 0) {
    return {
      totalPages: 0,
      criticalCount: 0,
      warningCount: 0,
      monitoringCount: 0,
      healthyCount: 0,
      healthScore: 100,
      avgDecayScore: 0,
      topDecayingPages: []
    };
  }
  
  const grouped = groupByDecaySeverity(analyzedPages);
  const totalPages = analyzedPages.length;
  
  // Calculate health score (percentage of non-critical/warning pages)
  const healthyAndMonitoring = grouped.healthy.length + grouped.monitoring.length;
  const healthScore = Math.round((healthyAndMonitoring / totalPages) * 100);
  
  // Calculate average decay score
  const totalDecayScore = analyzedPages.reduce((sum, p) => sum + p.decay.score, 0);
  const avgDecayScore = Math.round((totalDecayScore / totalPages) * 10) / 10;
  
  // Get top decaying pages for quick action
  const topDecayingPages = [
    ...grouped.critical.slice(0, 10),
    ...grouped.warning.slice(0, 10)
  ].slice(0, 15);
  
  return {
    totalPages,
    criticalCount: grouped.critical.length,
    warningCount: grouped.warning.length,
    monitoringCount: grouped.monitoring.length,
    healthyCount: grouped.healthy.length,
    healthScore,
    avgDecayScore,
    topDecayingPages
  };
}

/**
 * Detect decay trend over time using historical data
 * @param {Array} historicalData - Array of { date, clicks, impressions } objects
 * @returns {string} Trend classification: 'declining', 'stable', 'growing', or 'insufficient_data'
 */
export function detectDecayTrend(historicalData) {
  if (historicalData.length < 14) return 'insufficient_data';
  
  // Sort by date
  const sorted = [...historicalData].sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  );
  
  // Calculate 7-day moving averages
  const movingAverages = [];
  for (let i = 6; i < sorted.length; i++) {
    const window = sorted.slice(i - 6, i + 1);
    const avgClicks = window.reduce((sum, d) => sum + d.clicks, 0) / 7;
    movingAverages.push(avgClicks);
  }
  
  if (movingAverages.length < 4) return 'insufficient_data';
  
  // Compare first half vs second half
  const midpoint = Math.floor(movingAverages.length / 2);
  const firstHalf = movingAverages.slice(0, midpoint);
  const secondHalf = movingAverages.slice(midpoint);
  
  const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  if (firstHalfAvg === 0) return 'insufficient_data';
  
  const changePercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
  
  if (changePercent < -15) return 'declining';
  if (changePercent > 15) return 'growing';
  return 'stable';
}

/**
 * Calculate decay velocity (rate of decline)
 */
export function calculateDecayVelocity(historicalData) {
  if (historicalData.length < 7) return null;
  
  const sorted = [...historicalData].sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  );
  
  // Get clicks for first week and last week
  const firstWeek = sorted.slice(0, 7).reduce((sum, d) => sum + d.clicks, 0);
  const lastWeek = sorted.slice(-7).reduce((sum, d) => sum + d.clicks, 0);
  
  // Calculate weekly decay rate
  const totalWeeks = Math.floor(sorted.length / 7);
  const weeklyDecayRate = totalWeeks > 1 
    ? ((lastWeek - firstWeek) / firstWeek) / totalWeeks * 100
    : 0;
  
  return {
    firstWeekClicks: firstWeek,
    lastWeekClicks: lastWeek,
    weeklyDecayRate: Math.round(weeklyDecayRate * 10) / 10,
    totalWeeksAnalyzed: totalWeeks
  };
}

/**
 * Identify patterns in decay (e.g., seasonal, algorithm update related)
 */
export function identifyDecayPattern(historicalData, knownAlgorithmDates = []) {
  const patterns = [];
  
  // Check for sudden drops (potential algorithm impact)
  const dailyChanges = [];
  for (let i = 1; i < historicalData.length; i++) {
    const prevClicks = historicalData[i - 1].clicks;
    const currClicks = historicalData[i].clicks;
    if (prevClicks > 0) {
      const change = ((currClicks - prevClicks) / prevClicks) * 100;
      dailyChanges.push({
        date: historicalData[i].date,
        change
      });
    }
  }
  
  // Find significant single-day drops (>30%)
  const significantDrops = dailyChanges.filter(d => d.change < -30);
  if (significantDrops.length > 0) {
    patterns.push({
      type: 'sudden_drop',
      dates: significantDrops.map(d => d.date),
      severity: 'high'
    });
  }
  
  return patterns;
}

/**
 * Export analysis results to CSV format
 */
export function exportToCSV(analyzedPages) {
  const headers = [
    'URL',
    'Severity',
    'Decay Score',
    'Clicks Change %',
    'Impressions Change %',
    'CTR Change %',
    'Position Change',
    'Current Clicks',
    'Previous Clicks',
    'Signals'
  ];
  
  const rows = analyzedPages.map(p => [
    p.page,
    p.decay.severity,
    p.decay.score,
    p.decay.changes.clicks,
    p.decay.changes.impressions,
    p.decay.changes.ctr,
    p.decay.changes.position,
    p.current.clicks,
    p.previous?.clicks || 0,
    p.decay.signals.join('; ')
  ]);
  
  return [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');
}
