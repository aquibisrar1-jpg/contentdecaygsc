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
  
  // Current period (last 30 days, with 3-day delay for data availability)
  const currentPeriod = await querySearchAnalytics(siteUrl, {
    startDate: getDateString(-(currentDays + 3)),
    endDate: getDateString(-3),
    dimensions: ['page']
  });
  
  // Previous period (30-60 days ago)
  const previousPeriod = await querySearchAnalytics(siteUrl, {
    startDate: getDateString(-(currentDays + previousDays + 3)),
    endDate: getDateString(-(currentDays + 3)),
    dimensions: ['page']
  });
  
  // Create lookup map for previous period
  const previousMap = new Map();
  previousPeriod.forEach(row => {
    previousMap.set(row.keys[0], row);
  });
  
  // Compare and analyze
  const comparison = currentPeriod
    .filter(row => row.impressions >= minImpressions)
    .map(current => {
      const pageUrl = current.keys[0];
      const previous = previousMap.get(pageUrl);
      
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
        isNew: !previous
      };
    });
  
  return comparison;
}

/**
 * Get detailed query data for a specific page
 */
export async function getPageQueryData(siteUrl, pageUrl) {
  const encodedSiteUrl = encodeURIComponent(siteUrl);
  
  const data = await apiRequest(
    `/sites/${encodedSiteUrl}/searchAnalytics/query`,
    {
      method: 'POST',
      body: JSON.stringify({
        startDate: getDateString(-30),
        endDate: getDateString(-3),
        dimensions: ['query'],
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
  
  return data.rows || [];
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
