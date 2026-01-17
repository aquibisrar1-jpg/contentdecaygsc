// Google Search Console API utilities

const BASE_URL = 'https://www.googleapis.com/webmasters/v3';

/**
 * Make authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
  const result = await chrome.storage.local.get('accessToken');
  const accessToken = result.accessToken;

  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (response.status === 401) {
    // Token expired, trigger re-auth
    await chrome.storage.local.remove(['accessToken', 'expiresAt']);
    throw new Error('Token expired. Please sign in again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get list of verified sites from Search Console
 */
export async function getSites() {
  const data = await apiRequest('/sites');
  return data.siteEntry || [];
}

/**
 * Query search analytics data for a site
 * @param {string} siteUrl - The site URL (e.g., 'https://example.com/' or 'sc-domain:example.com')
 * @param {object} params - Query parameters
 */
export async function querySearchAnalytics(siteUrl, params) {
  // URL encode the site URL for the endpoint
  const encodedSiteUrl = encodeURIComponent(siteUrl);

  const defaultParams = {
    startDate: getDateString(-30),
    endDate: getDateString(-3), // Data has 2-3 day delay
    dimensions: ['page'],
    rowLimit: 25000,
    startRow: 0
  };

  const requestBody = { ...defaultParams, ...params };

  const data = await apiRequest(
    `/sites/${encodedSiteUrl}/searchAnalytics/query`,
    {
      method: 'POST',
      body: JSON.stringify(requestBody)
    }
  );

  return data.rows || [];
}

/**
 * Get all pages with their performance data
 * Fetches data for two periods for comparison
 */
export async function getPagePerformanceComparison(siteUrl, options = {}) {
  const {
    currentDays = 30,
    previousDays = 30,
    minImpressions = 100
  } = options;

  // Construct Filters if Brand Keywords exist
  let dimensionFilterGroups = [];
  if (options.brandKeywords) {
    const keywords = options.brandKeywords.split(',').map(k => k.trim()).filter(k => k);
    if (keywords.length > 0) {
      dimensionFilterGroups = [{
        filters: keywords.map(keyword => ({
          dimension: 'query',
          operator: 'notContains',
          expression: keyword
        }))
      }];
    }
  }

  // Calculate Dates
  const currentStart = getDateString(-(currentDays + 3));
  const currentEnd = getDateString(-3);
  const previousStart = getDateString(-(currentDays + previousDays + 3));
  const previousEnd = getDateString(-(currentDays + 3));

  // Fetch Current Period
  const currentPeriod = await queryAllSearchAnalytics(siteUrl, {
    startDate: currentStart,
    endDate: currentEnd,
    dimensions: ['page'],
    dimensionFilterGroups: dimensionFilterGroups.length ? dimensionFilterGroups : undefined
  });

  // Previous period (30-60 days ago)
  const previousPeriod = await queryAllSearchAnalytics(siteUrl, {
    startDate: previousStart,
    endDate: previousEnd,
    dimensions: ['page'],
    dimensionFilterGroups: dimensionFilterGroups.length ? dimensionFilterGroups : undefined
  });

  // Recent period (Last 7 days) for Velocity/Cliff detection
  const recentPeriod = await queryAllSearchAnalytics(siteUrl, {
    startDate: getDateString(-10), // 7 days + 3 days lag
    endDate: getDateString(-3),
    dimensions: ['page'],
    dimensionFilterGroups: dimensionFilterGroups.length ? dimensionFilterGroups : undefined
  });

  // Create lookup maps
  const previousMap = new Map(previousPeriod.map(row => [row.keys[0], row]));
  const recentMap = new Map(recentPeriod.map(row => [row.keys[0], row]));

  // Compare and analyze
  const comparison = currentPeriod
    .filter(row => row.impressions >= minImpressions && row.clicks >= (options.minClicks || 0))
    .map(current => {
      const pageUrl = current.keys[0];
      const previous = previousMap.get(pageUrl);
      const recent = recentMap.get(pageUrl);

      return {
        page: pageUrl,
        current: {
          clicks: current.clicks,
          impressions: current.impressions,
          ctr: current.ctr,
          position: current.position
        },
        previous: previous ? {
          clicks: previous.clicks,
          impressions: previous.impressions,
          ctr: previous.ctr,
          position: previous.position
        } : null,
        recent: recent ? {
          clicks: recent.clicks,
          impressions: recent.impressions,
          ctr: recent.ctr,
          position: recent.position
        } : null,
        isNew: !previous
      };
    });

  return {
    pages: comparison,
    dateRanges: {
      current: { startDate: currentStart, endDate: currentEnd },
      previous: { startDate: previousStart, endDate: previousEnd }
    }
  };
}

/**
/**
 * Get detailed query data for a specific page
 */
export async function getPageQueryData(siteUrl, pageUrl, days = 30) {
  console.log(`Fetching query comparison for: ${pageUrl}`);

  const dateRange = {
    current: {
      startDate: getDateString(-(days + 3)),
      endDate: getDateString(-3)
    },
    previous: {
      startDate: getDateString(-(days * 2 + 3)),
      endDate: getDateString(-(days + 3))
    }
  };

  const filterGroup = {
    groupType: 'and',
    filters: [{
      dimension: 'page',
      operator: 'equals',
      expression: pageUrl
    }]
  };

  // Run requests in parallel
  const [currentRows, previousRows] = await Promise.all([
    querySearchAnalytics(siteUrl, {
      startDate: dateRange.current.startDate,
      endDate: dateRange.current.endDate,
      dimensions: ['query'],
      dimensionFilterGroups: [filterGroup],
      rowLimit: 50
    }),
    querySearchAnalytics(siteUrl, {
      startDate: dateRange.previous.startDate,
      endDate: dateRange.previous.endDate,
      dimensions: ['query'],
      dimensionFilterGroups: [filterGroup],
      rowLimit: 200 // Fetch more previous rows to maximize match rate
    })
  ]);

  if (!currentRows || currentRows.length === 0) {
    console.warn('No query data returned for page:', pageUrl);
    return [];
  }

  // Create map of previous data for fast lookup
  const prevMap = new Map();
  if (previousRows) {
    previousRows.forEach(row => {
      prevMap.set(row.keys[0], row);
    });
  }

  // Merge and calculate deltas
  const comparison = currentRows.map(curr => {
    const query = curr.keys[0];
    const prev = prevMap.get(query);

    const prevClicks = prev ? prev.clicks : 0;
    const prevImpressions = prev ? prev.impressions : 0;
    const prevCtr = prev ? prev.ctr : 0;
    const prevPosition = prev ? prev.position : 0;

    return {
      query,
      current: {
        clicks: curr.clicks,
        impressions: curr.impressions,
        ctr: curr.ctr,
        position: curr.position
      },
      previous: {
        clicks: prevClicks,
        impressions: prevImpressions,
        ctr: prevCtr,
        position: prevPosition
      },
      change: {
        clicks: prev ? curr.clicks - prevClicks : curr.clicks,
        impressions: prev ? curr.impressions - prevImpressions : curr.impressions,
        ctr: prev ? curr.ctr - prevCtr : curr.ctr,
        position: prev ? curr.position - prevPosition : 0
      },
      isNew: !prev
    };
  });

  return {
    queries: comparison.sort((a, b) => b.current.clicks - a.current.clicks),
    dateRanges: dateRange
  };
}

/**
 * Get daily performance data for a page (for trend analysis)
 */
export async function getPageDailyTrend(siteUrl, pageUrl, days = 90) {
  const encodedSiteUrl = encodeURIComponent(siteUrl);

  const data = await apiRequest(
    `/sites/${encodedSiteUrl}/searchAnalytics/query`,
    {
      method: 'POST',
      body: JSON.stringify({
        startDate: getDateString(-days),
        endDate: getDateString(-3),
        dimensions: ['date'],
        dimensionFilterGroups: [{
          groupType: 'and',
          filters: [{
            dimension: 'page',
            operator: 'equals',
            expression: pageUrl
          }]
        }],
        rowLimit: 1000
      })
    }
  );

  return (data.rows || []).map(row => ({
    date: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position
  }));
}

/**
 * Helper: Get date string in YYYY-MM-DD format
 */
function getDateString(daysOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
}

/**
 * Paginate through all results (for large sites with >25k pages)
 */
export async function queryAllSearchAnalytics(siteUrl, params) {
  const allRows = [];
  let startRow = 0;
  const rowLimit = 25000;

  while (true) {
    const rows = await querySearchAnalytics(siteUrl, {
      ...params,
      rowLimit,
      startRow
    });

    allRows.push(...rows);

    if (rows.length < rowLimit) {
      break;
    }

    startRow += rowLimit;

    // Add small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return allRows;
}

/**
 * Get site-level summary statistics
 */
export async function getSiteSummary(siteUrl, days = 30) {
  const encodedSiteUrl = encodeURIComponent(siteUrl);

  const data = await apiRequest(
    `/sites/${encodedSiteUrl}/searchAnalytics/query`,
    {
      method: 'POST',
      body: JSON.stringify({
        startDate: getDateString(-days),
        endDate: getDateString(-3),
        dimensions: [],  // No dimensions = aggregate totals
        rowLimit: 1
      })
    }
  );

  if (data.rows && data.rows.length > 0) {
    return {
      clicks: data.rows[0].clicks,
      impressions: data.rows[0].impressions,
      ctr: data.rows[0].ctr,
      position: data.rows[0].position
    };
  }

  return null;
}
