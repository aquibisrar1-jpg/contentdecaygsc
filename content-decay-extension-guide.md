# Content Decay Identification Chrome Extension - Complete Development Guide

## Overview

This guide covers building a robust Chrome extension that identifies content decay using Google Search Console data. Users can sign in with their Google account, connect their Search Console properties, and automatically detect pages experiencing traffic decline.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites & Setup](#prerequisites--setup)
3. [Google Cloud Console Configuration](#google-cloud-console-configuration)
4. [Extension Structure](#extension-structure)
5. [OAuth2 Authentication Flow](#oauth2-authentication-flow)
6. [Search Console API Integration](#search-console-api-integration)
7. [Content Decay Detection Algorithm](#content-decay-detection-algorithm)
8. [Complete Code Implementation](#complete-code-implementation)
9. [Publishing to Chrome Web Store](#publishing-to-chrome-web-store)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Chrome Extension                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Popup UI  │  │  Service    │  │   Content Scripts       │ │
│  │  (React/    │  │  Worker     │  │   (Optional for         │ │
│  │   Vanilla)  │  │  (OAuth +   │  │    page analysis)       │ │
│  │             │  │   API calls)│  │                         │ │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────────┘ │
│         │                │                                       │
│         └────────────────┼───────────────────────────────────── │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │     Google APIs                       │
        │  ┌────────────────────────────────┐  │
        │  │ OAuth 2.0 Authentication       │  │
        │  │ accounts.google.com            │  │
        │  └────────────────────────────────┘  │
        │  ┌────────────────────────────────┐  │
        │  │ Search Console API             │  │
        │  │ googleapis.com/webmasters/v3   │  │
        │  └────────────────────────────────┘  │
        └──────────────────────────────────────┘
```

---

## Prerequisites & Setup

### Required Tools
- Node.js 18+ (for build tools if using React/bundler)
- Chrome Browser (latest version)
- Google Cloud Console account
- Code editor (VS Code recommended)

### Project Initialization

```bash
mkdir content-decay-extension
cd content-decay-extension

# Create folder structure
mkdir -p src/{popup,background,utils,components}
mkdir -p assets/icons
mkdir -p dist
```

---

## Google Cloud Console Configuration

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project: "Content Decay Analyzer"
3. Note your Project ID

### Step 2: Enable Search Console API

1. Navigate to **APIs & Services** → **Library**
2. Search for "Google Search Console API"
3. Click **Enable**

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** user type
3. Fill in required fields:
   - App name: "Content Decay Analyzer"
   - User support email: your email
   - Developer contact: your email
4. Add scopes:
   - `https://www.googleapis.com/auth/webmasters.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
5. Add test users (your email) during development

### Step 4: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Chrome Extension** as application type
4. Enter your Extension ID (you'll get this after first load)
5. Save the **Client ID**

> **Important**: The redirect URI will be automatically set to:
> `https://<extension-id>.chromiumapp.org/`

---

## Extension Structure

```
content-decay-extension/
├── manifest.json
├── src/
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── background/
│   │   └── service-worker.js
│   ├── utils/
│   │   ├── auth.js
│   │   ├── api.js
│   │   └── decay-analyzer.js
│   └── components/
│       └── charts.js
├── assets/
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
└── dist/
```

---

## OAuth2 Authentication Flow

### Authentication Strategy

For maximum browser compatibility, we'll use `chrome.identity.launchWebAuthFlow()` which works across all Chromium-based browsers.

### Flow Diagram

```
1. User clicks "Sign In"
           │
           ▼
2. Extension calls launchWebAuthFlow()
           │
           ▼
3. Google OAuth consent screen opens
           │
           ▼
4. User grants permission
           │
           ▼
5. Redirect to https://<ext-id>.chromiumapp.org/?code=XXX
           │
           ▼
6. Extension extracts authorization code
           │
           ▼
7. Exchange code for access_token + refresh_token
           │
           ▼
8. Store tokens in chrome.storage.local
           │
           ▼
9. Use access_token for API calls
```

---

## Search Console API Integration

### Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/webmasters/v3/sites` | GET | List all verified sites |
| `/webmasters/v3/sites/{siteUrl}/searchAnalytics/query` | POST | Query performance data |

### Search Analytics Query Parameters

```javascript
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "dimensions": ["page", "query", "date"],
  "rowLimit": 25000,
  "startRow": 0,
  "dimensionFilterGroups": [{
    "groupType": "and",
    "filters": [{
      "dimension": "page",
      "operator": "contains",
      "expression": "/blog/"
    }]
  }]
}
```

### Response Metrics

- **clicks**: Total clicks from search results
- **impressions**: Times page appeared in search
- **ctr**: Click-through rate (clicks/impressions)
- **position**: Average ranking position

---

## Content Decay Detection Algorithm

### What is Content Decay?

Content decay is the gradual decline in organic traffic, rankings, and visibility when content becomes outdated or less relevant over time. It's characterized by:

- Slow, gradual decline (not sudden drops)
- Declining impressions before clicks drop
- Falling CTR as titles become outdated
- Position drift (moving from page 1 to page 2+)

### Detection Methodology

```javascript
// Content Decay Score Calculation
function calculateDecayScore(currentPeriod, previousPeriod) {
  const metrics = {
    clicksChange: ((currentPeriod.clicks - previousPeriod.clicks) / previousPeriod.clicks) * 100,
    impressionsChange: ((currentPeriod.impressions - previousPeriod.impressions) / previousPeriod.impressions) * 100,
    ctrChange: ((currentPeriod.ctr - previousPeriod.ctr) / previousPeriod.ctr) * 100,
    positionChange: previousPeriod.position - currentPeriod.position // Negative = worse
  };
  
  // Weighted decay score (higher = more decay)
  const decayScore = (
    (metrics.clicksChange * -0.4) +      // 40% weight
    (metrics.impressionsChange * -0.3) +  // 30% weight
    (metrics.ctrChange * -0.2) +          // 20% weight
    (metrics.positionChange * -0.1)       // 10% weight
  );
  
  return {
    score: decayScore,
    metrics,
    severity: decayScore > 30 ? 'critical' : decayScore > 15 ? 'warning' : 'healthy'
  };
}
```

### Decay Detection Thresholds

| Severity | Score Range | Indicators |
|----------|-------------|------------|
| **Critical** | > 30 | Significant traffic loss, needs immediate attention |
| **Warning** | 15-30 | Declining trend, schedule for refresh |
| **Monitoring** | 5-15 | Minor decline, keep watching |
| **Healthy** | < 5 | Stable or growing |

### Time Period Comparison Strategy

```javascript
// Compare rolling periods for trend analysis
const periods = {
  current: { start: '30 days ago', end: 'today' },
  previous: { start: '60 days ago', end: '30 days ago' },
  baseline: { start: '90 days ago', end: '60 days ago' }
};

// Also useful: Year-over-Year comparison for seasonal content
const yoyPeriods = {
  current: { start: '2025-01-01', end: '2025-01-31' },
  lastYear: { start: '2024-01-01', end: '2024-01-31' }
};
```

---

## Complete Code Implementation

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "Content Decay Analyzer",
  "version": "1.0.0",
  "description": "Identify declining content using Google Search Console data",
  
  "permissions": [
    "identity",
    "storage",
    "alarms"
  ],
  
  "host_permissions": [
    "https://www.googleapis.com/*",
    "https://oauth2.googleapis.com/*",
    "https://accounts.google.com/*"
  ],
  
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/webmasters.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ]
  },
  
  "background": {
    "service_worker": "src/background/service-worker.js",
    "type": "module"
  },
  
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_icon": {
      "16": "assets/icons/icon16.png",
      "48": "assets/icons/icon48.png",
      "128": "assets/icons/icon128.png"
    }
  },
  
  "icons": {
    "16": "assets/icons/icon16.png",
    "48": "assets/icons/icon48.png",
    "128": "assets/icons/icon128.png"
  }
}
```

### src/utils/auth.js

```javascript
// Authentication utilities for Google OAuth2

const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
].join(' ');

/**
 * Initiate OAuth2 flow using launchWebAuthFlow
 * This method works across all Chromium browsers
 */
export async function signIn() {
  return new Promise((resolve, reject) => {
    const redirectUri = chrome.identity.getRedirectURL('oauth2');
    
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('prompt', 'consent');
    
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl.toString(),
        interactive: true
      },
      (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (!responseUrl) {
          reject(new Error('No response URL received'));
          return;
        }
        
        // Extract access token from URL fragment
        const url = new URL(responseUrl);
        const params = new URLSearchParams(url.hash.substring(1));
        const accessToken = params.get('access_token');
        const expiresIn = params.get('expires_in');
        
        if (!accessToken) {
          reject(new Error('No access token in response'));
          return;
        }
        
        // Calculate expiration time
        const expiresAt = Date.now() + (parseInt(expiresIn) * 1000);
        
        // Store token
        chrome.storage.local.set({
          accessToken,
          expiresAt
        }, () => {
          resolve({ accessToken, expiresAt });
        });
      }
    );
  });
}

/**
 * Alternative: Use getAuthToken for simpler flow (Chrome only)
 */
export async function signInSimple() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      chrome.storage.local.set({ accessToken: token }, () => {
        resolve({ accessToken: token });
      });
    });
  });
}

/**
 * Get stored access token
 */
export async function getAccessToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['accessToken', 'expiresAt'], (result) => {
      if (result.accessToken && result.expiresAt > Date.now()) {
        resolve(result.accessToken);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Sign out and clear stored tokens
 */
export async function signOut() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['accessToken', 'expiresAt', 'userInfo'], () => {
      // Also revoke the token
      chrome.identity.clearAllCachedAuthTokens(() => {
        resolve();
      });
    });
  });
}

/**
 * Get user profile information
 */
export async function getUserInfo(accessToken) {
  const response = await fetch(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }
  
  return response.json();
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
  const token = await getAccessToken();
  return token !== null;
}
```

### src/utils/api.js

```javascript
// Google Search Console API utilities

const BASE_URL = 'https://www.googleapis.com/webmasters/v3';

/**
 * Make authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
  const { accessToken } = await chrome.storage.local.get('accessToken');
  
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
    const error = await response.json();
    throw new Error(error.error?.message || 'API request failed');
  }
  
  return response.json();
}

/**
 * Get list of verified sites
 */
export async function getSites() {
  const data = await apiRequest('/sites');
  return data.siteEntry || [];
}

/**
 * Query search analytics data
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
  
  // Current period (last 30 days, with 3-day delay)
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
 * Helper: Get date string in YYYY-MM-DD format
 */
function getDateString(daysOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
}

/**
 * Paginate through all results (for large sites)
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
  }
  
  return allRows;
}
```

### src/utils/decay-analyzer.js

```javascript
// Content Decay Analysis Engine

/**
 * Analyze content decay for a set of pages
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
  // Higher positive score = more decay
  const score = (
    (changes.clicks < 0 ? Math.abs(changes.clicks) * 0.4 : 0) +
    (changes.impressions < 0 ? Math.abs(changes.impressions) * 0.3 : 0) +
    (changes.ctr < 0 ? Math.abs(changes.ctr) * 0.2 : 0) +
    (changes.position < 0 ? Math.abs(changes.position) * 2 : 0) // Position weighted differently
  );
  
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
  
  // Determine primary decay signal
  const signals = [];
  if (changes.impressions < -20) signals.push('visibility_drop');
  if (changes.clicks < -30) signals.push('traffic_loss');
  if (changes.ctr < -15) signals.push('ctr_decline');
  if (changes.position < -3) signals.push('ranking_drop');
  
  return {
    score: Math.round(score * 10) / 10,
    severity,
    changes,
    signals,
    recommendation: getRecommendation(severity, signals)
  };
}

/**
 * Calculate percentage change
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
  
  if (signals.includes('visibility_drop')) {
    recommendations.push('Review indexation status in Search Console');
    recommendations.push('Check for technical SEO issues');
  }
  
  if (signals.includes('ctr_decline')) {
    recommendations.push('Update title tag and meta description');
    recommendations.push('Add current year to title if applicable');
  }
  
  if (signals.includes('ranking_drop')) {
    recommendations.push('Analyze competitor content for this topic');
    recommendations.push('Update with fresh information and statistics');
  }
  
  if (signals.includes('traffic_loss')) {
    recommendations.push('Consider comprehensive content refresh');
    recommendations.push('Add internal links from high-authority pages');
  }
  
  switch (severity) {
    case 'critical':
      recommendations.unshift('🚨 Immediate action required - high-priority content refresh');
      break;
    case 'warning':
      recommendations.unshift('⚠️ Schedule for content refresh within 2-4 weeks');
      break;
    case 'monitoring':
      recommendations.unshift('👀 Monitor closely - consider minor updates');
      break;
    default:
      recommendations.push('✅ Content is performing well');
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
  const grouped = groupByDecaySeverity(analyzedPages);
  const totalPages = analyzedPages.length;
  
  return {
    totalPages,
    criticalCount: grouped.critical.length,
    warningCount: grouped.warning.length,
    monitoringCount: grouped.monitoring.length,
    healthyCount: grouped.healthy.length,
    healthScore: Math.round((grouped.healthy.length / totalPages) * 100),
    avgDecayScore: analyzedPages.reduce((sum, p) => sum + p.decay.score, 0) / totalPages,
    topDecayingPages: grouped.critical.slice(0, 10).concat(grouped.warning.slice(0, 10))
  };
}

/**
 * Detect decay patterns over time
 */
export function detectDecayTrend(historicalData) {
  // historicalData = array of { date, clicks, impressions } objects
  if (historicalData.length < 7) return 'insufficient_data';
  
  // Calculate 7-day moving averages
  const movingAverages = [];
  for (let i = 6; i < historicalData.length; i++) {
    const window = historicalData.slice(i - 6, i + 1);
    const avgClicks = window.reduce((sum, d) => sum + d.clicks, 0) / 7;
    movingAverages.push(avgClicks);
  }
  
  // Check trend direction
  const firstHalf = movingAverages.slice(0, Math.floor(movingAverages.length / 2));
  const secondHalf = movingAverages.slice(Math.floor(movingAverages.length / 2));
  
  const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  const changePercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
  
  if (changePercent < -15) return 'declining';
  if (changePercent > 15) return 'growing';
  return 'stable';
}
```

### src/background/service-worker.js

```javascript
// Service Worker - Handles background tasks

import { getAccessToken, isAuthenticated } from '../utils/auth.js';
import { getSites, getPagePerformanceComparison } from '../utils/api.js';
import { analyzeContentDecay, calculateSiteSummary } from '../utils/decay-analyzer.js';

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Content Decay Analyzer installed');
  
  // Set up periodic analysis alarm (every 24 hours)
  chrome.alarms.create('dailyAnalysis', {
    periodInMinutes: 24 * 60
  });
});

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dailyAnalysis') {
    await runBackgroundAnalysis();
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message) {
  switch (message.action) {
    case 'GET_SITES':
      return await handleGetSites();
    
    case 'ANALYZE_SITE':
      return await handleAnalyzeSite(message.siteUrl);
    
    case 'GET_CACHED_ANALYSIS':
      return await getCachedAnalysis(message.siteUrl);
    
    case 'CHECK_AUTH':
      return { authenticated: await isAuthenticated() };
    
    default:
      return { error: 'Unknown action' };
  }
}

async function handleGetSites() {
  try {
    const sites = await getSites();
    return { success: true, sites };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleAnalyzeSite(siteUrl) {
  try {
    // Get performance comparison data
    const comparison = await getPagePerformanceComparison(siteUrl, {
      currentDays: 30,
      previousDays: 30,
      minImpressions: 50
    });
    
    // Analyze for decay
    const analyzed = analyzeContentDecay(comparison);
    const summary = calculateSiteSummary(analyzed);
    
    // Cache results
    const cacheKey = `analysis_${btoa(siteUrl)}`;
    await chrome.storage.local.set({
      [cacheKey]: {
        timestamp: Date.now(),
        summary,
        pages: analyzed
      }
    });
    
    return { success: true, summary, pages: analyzed };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getCachedAnalysis(siteUrl) {
  const cacheKey = `analysis_${btoa(siteUrl)}`;
  const result = await chrome.storage.local.get(cacheKey);
  
  if (result[cacheKey]) {
    const age = Date.now() - result[cacheKey].timestamp;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (age < maxAge) {
      return { success: true, cached: true, ...result[cacheKey] };
    }
  }
  
  return { success: false, cached: false };
}

async function runBackgroundAnalysis() {
  const authenticated = await isAuthenticated();
  if (!authenticated) return;
  
  try {
    const sites = await getSites();
    
    for (const site of sites.slice(0, 5)) { // Limit to first 5 sites
      await handleAnalyzeSite(site.siteUrl);
      
      // Small delay between sites to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('Background analysis complete');
  } catch (error) {
    console.error('Background analysis failed:', error);
  }
}
```

### src/popup/popup.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Content Decay Analyzer</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div id="app">
    <!-- Loading State -->
    <div id="loading" class="screen">
      <div class="spinner"></div>
      <p>Loading...</p>
    </div>
    
    <!-- Login Screen -->
    <div id="login-screen" class="screen hidden">
      <div class="header">
        <h1>📉 Content Decay Analyzer</h1>
        <p>Identify declining content using Google Search Console</p>
      </div>
      <button id="sign-in-btn" class="btn btn-primary">
        <img src="../../assets/icons/google.svg" alt="Google" width="20">
        Sign in with Google
      </button>
      <p class="disclaimer">
        Requires access to your Search Console data
      </p>
    </div>
    
    <!-- Site Selection Screen -->
    <div id="site-selection" class="screen hidden">
      <div class="header">
        <div class="user-info">
          <img id="user-avatar" src="" alt="User" width="32">
          <span id="user-name"></span>
          <button id="sign-out-btn" class="btn btn-small">Sign Out</button>
        </div>
      </div>
      <h2>Select a Property</h2>
      <div id="sites-list" class="sites-list">
        <!-- Sites will be populated here -->
      </div>
    </div>
    
    <!-- Analysis Screen -->
    <div id="analysis-screen" class="screen hidden">
      <div class="header">
        <button id="back-btn" class="btn btn-small">← Back</button>
        <span id="current-site"></span>
      </div>
      
      <!-- Summary Cards -->
      <div class="summary-cards">
        <div class="card critical">
          <span class="count" id="critical-count">0</span>
          <span class="label">Critical</span>
        </div>
        <div class="card warning">
          <span class="count" id="warning-count">0</span>
          <span class="label">Warning</span>
        </div>
        <div class="card monitoring">
          <span class="count" id="monitoring-count">0</span>
          <span class="label">Monitoring</span>
        </div>
        <div class="card healthy">
          <span class="count" id="healthy-count">0</span>
          <span class="label">Healthy</span>
        </div>
      </div>
      
      <!-- Health Score -->
      <div class="health-score">
        <div class="score-circle">
          <span id="health-score">--</span>
        </div>
        <span class="label">Site Health Score</span>
      </div>
      
      <!-- Decaying Pages List -->
      <div class="section">
        <h3>🚨 Pages Needing Attention</h3>
        <div id="decaying-pages" class="pages-list">
          <!-- Pages will be populated here -->
        </div>
      </div>
      
      <!-- Refresh Button -->
      <button id="refresh-btn" class="btn btn-secondary">
        🔄 Refresh Analysis
      </button>
    </div>
    
    <!-- Page Detail Modal -->
    <div id="page-detail-modal" class="modal hidden">
      <div class="modal-content">
        <button class="close-modal">×</button>
        <h3 id="modal-page-url"></h3>
        <div id="modal-metrics"></div>
        <div id="modal-recommendations"></div>
      </div>
    </div>
  </div>
  
  <script type="module" src="popup.js"></script>
</body>
</html>
```

### src/popup/popup.css

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 400px;
  min-height: 500px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background: #f5f7fa;
  color: #333;
}

.hidden {
  display: none !important;
}

.screen {
  padding: 20px;
}

/* Header */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.header h1 {
  font-size: 18px;
  color: #1a1a2e;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-info img {
  border-radius: 50%;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #4285f4;
  color: white;
  width: 100%;
}

.btn-primary:hover {
  background: #3367d6;
}

.btn-secondary {
  background: #e8eaed;
  color: #333;
  width: 100%;
  margin-top: 20px;
}

.btn-small {
  padding: 6px 12px;
  font-size: 12px;
}

/* Loading */
#loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e8eaed;
  border-top-color: #4285f4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Sites List */
.sites-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.site-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  cursor: pointer;
  transition: all 0.2s;
}

.site-item:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  transform: translateY(-1px);
}

.site-item .url {
  font-size: 13px;
  color: #666;
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Summary Cards */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}

.card {
  text-align: center;
  padding: 12px 8px;
  border-radius: 8px;
  color: white;
}

.card .count {
  display: block;
  font-size: 24px;
  font-weight: 700;
}

.card .label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.card.critical { background: #e53935; }
.card.warning { background: #fb8c00; }
.card.monitoring { background: #fdd835; color: #333; }
.card.healthy { background: #43a047; }

/* Health Score */
.health-score {
  text-align: center;
  margin-bottom: 20px;
}

.score-circle {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.score-circle span {
  font-size: 28px;
  font-weight: 700;
  color: white;
}

.health-score .label {
  font-size: 12px;
  color: #666;
}

/* Pages List */
.section h3 {
  font-size: 14px;
  margin-bottom: 12px;
  color: #1a1a2e;
}

.pages-list {
  max-height: 200px;
  overflow-y: auto;
}

.page-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: white;
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.page-item:hover {
  background: #f0f4ff;
}

.page-item .page-url {
  font-size: 12px;
  color: #333;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-item .decay-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.decay-badge.critical { background: #ffebee; color: #c62828; }
.decay-badge.warning { background: #fff3e0; color: #ef6c00; }

.page-item .change {
  font-size: 11px;
  color: #e53935;
}

/* Modal */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  padding: 20px;
  width: 90%;
  max-height: 80%;
  overflow-y: auto;
  position: relative;
}

.close-modal {
  position: absolute;
  top: 10px;
  right: 10px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
}

.modal-content h3 {
  font-size: 12px;
  color: #666;
  margin-bottom: 16px;
  word-break: break-all;
}

/* Metrics in modal */
.metric-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}

.metric-label {
  color: #666;
  font-size: 13px;
}

.metric-value {
  font-weight: 600;
}

.metric-value.positive { color: #43a047; }
.metric-value.negative { color: #e53935; }

/* Recommendations */
#modal-recommendations {
  margin-top: 16px;
}

#modal-recommendations h4 {
  font-size: 13px;
  margin-bottom: 8px;
}

#modal-recommendations ul {
  list-style: none;
  padding: 0;
}

#modal-recommendations li {
  padding: 8px 0;
  font-size: 12px;
  color: #333;
  border-bottom: 1px solid #f0f0f0;
}

/* Disclaimer */
.disclaimer {
  font-size: 11px;
  color: #999;
  text-align: center;
  margin-top: 16px;
}
```

### src/popup/popup.js

```javascript
// Popup UI Logic

import { signIn, signOut, getAccessToken, getUserInfo } from '../utils/auth.js';

// DOM Elements
const screens = {
  loading: document.getElementById('loading'),
  login: document.getElementById('login-screen'),
  siteSelection: document.getElementById('site-selection'),
  analysis: document.getElementById('analysis-screen')
};

const elements = {
  signInBtn: document.getElementById('sign-in-btn'),
  signOutBtn: document.getElementById('sign-out-btn'),
  backBtn: document.getElementById('back-btn'),
  refreshBtn: document.getElementById('refresh-btn'),
  userAvatar: document.getElementById('user-avatar'),
  userName: document.getElementById('user-name'),
  sitesList: document.getElementById('sites-list'),
  currentSite: document.getElementById('current-site'),
  decayingPages: document.getElementById('decaying-pages'),
  criticalCount: document.getElementById('critical-count'),
  warningCount: document.getElementById('warning-count'),
  monitoringCount: document.getElementById('monitoring-count'),
  healthyCount: document.getElementById('healthy-count'),
  healthScore: document.getElementById('health-score'),
  modal: document.getElementById('page-detail-modal')
};

let currentSiteUrl = null;
let currentAnalysis = null;

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  showScreen('loading');
  
  // Check authentication status
  const token = await getAccessToken();
  
  if (token) {
    try {
      const userInfo = await getUserInfo(token);
      await chrome.storage.local.set({ userInfo });
      showUserInfo(userInfo);
      await loadSites();
      showScreen('siteSelection');
    } catch (error) {
      console.error('Auth error:', error);
      showScreen('login');
    }
  } else {
    showScreen('login');
  }
  
  // Setup event listeners
  setupEventListeners();
}

function setupEventListeners() {
  elements.signInBtn.addEventListener('click', handleSignIn);
  elements.signOutBtn.addEventListener('click', handleSignOut);
  elements.backBtn.addEventListener('click', () => showScreen('siteSelection'));
  elements.refreshBtn.addEventListener('click', () => analyzeSite(currentSiteUrl, true));
  
  // Modal close
  document.querySelector('.close-modal').addEventListener('click', () => {
    elements.modal.classList.add('hidden');
  });
}

function showScreen(screenName) {
  Object.values(screens).forEach(screen => screen.classList.add('hidden'));
  screens[screenName].classList.remove('hidden');
}

async function handleSignIn() {
  elements.signInBtn.disabled = true;
  elements.signInBtn.textContent = 'Signing in...';
  
  try {
    await signIn();
    const token = await getAccessToken();
    const userInfo = await getUserInfo(token);
    await chrome.storage.local.set({ userInfo });
    showUserInfo(userInfo);
    await loadSites();
    showScreen('siteSelection');
  } catch (error) {
    console.error('Sign in failed:', error);
    alert('Sign in failed: ' + error.message);
  } finally {
    elements.signInBtn.disabled = false;
    elements.signInBtn.innerHTML = `
      <img src="../../assets/icons/google.svg" alt="Google" width="20">
      Sign in with Google
    `;
  }
}

async function handleSignOut() {
  await signOut();
  showScreen('login');
}

function showUserInfo(userInfo) {
  elements.userAvatar.src = userInfo.picture || '';
  elements.userName.textContent = userInfo.name || userInfo.email;
}

async function loadSites() {
  elements.sitesList.innerHTML = '<div class="loading-text">Loading sites...</div>';
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'GET_SITES' });
    
    if (!response.success) {
      throw new Error(response.error);
    }
    
    renderSites(response.sites);
  } catch (error) {
    elements.sitesList.innerHTML = `
      <div class="error">Failed to load sites: ${error.message}</div>
    `;
  }
}

function renderSites(sites) {
  if (sites.length === 0) {
    elements.sitesList.innerHTML = `
      <div class="empty-state">
        <p>No sites found in your Search Console.</p>
        <a href="https://search.google.com/search-console" target="_blank">
          Add a site in Search Console →
        </a>
      </div>
    `;
    return;
  }
  
  elements.sitesList.innerHTML = sites.map(site => `
    <div class="site-item" data-url="${site.siteUrl}">
      <span class="url">${formatSiteUrl(site.siteUrl)}</span>
      <span class="arrow">→</span>
    </div>
  `).join('');
  
  // Add click handlers
  elements.sitesList.querySelectorAll('.site-item').forEach(item => {
    item.addEventListener('click', () => {
      const siteUrl = item.dataset.url;
      analyzeSite(siteUrl);
    });
  });
}

function formatSiteUrl(url) {
  return url.replace(/^(sc-domain:|https?:\/\/)/, '').replace(/\/$/, '');
}

async function analyzeSite(siteUrl, forceRefresh = false) {
  currentSiteUrl = siteUrl;
  elements.currentSite.textContent = formatSiteUrl(siteUrl);
  showScreen('analysis');
  
  // Show loading state
  elements.decayingPages.innerHTML = '<div class="loading-text">Analyzing...</div>';
  elements.healthScore.textContent = '--';
  
  try {
    // Check for cached analysis first
    if (!forceRefresh) {
      const cached = await chrome.runtime.sendMessage({
        action: 'GET_CACHED_ANALYSIS',
        siteUrl
      });
      
      if (cached.success && cached.cached) {
        currentAnalysis = { summary: cached.summary, pages: cached.pages };
        renderAnalysis(cached.summary, cached.pages);
        return;
      }
    }
    
    // Run fresh analysis
    const response = await chrome.runtime.sendMessage({
      action: 'ANALYZE_SITE',
      siteUrl
    });
    
    if (!response.success) {
      throw new Error(response.error);
    }
    
    currentAnalysis = { summary: response.summary, pages: response.pages };
    renderAnalysis(response.summary, response.pages);
  } catch (error) {
    elements.decayingPages.innerHTML = `
      <div class="error">Analysis failed: ${error.message}</div>
    `;
  }
}

function renderAnalysis(summary, pages) {
  // Update summary cards
  elements.criticalCount.textContent = summary.criticalCount;
  elements.warningCount.textContent = summary.warningCount;
  elements.monitoringCount.textContent = summary.monitoringCount;
  elements.healthyCount.textContent = summary.healthyCount;
  elements.healthScore.textContent = summary.healthScore + '%';
  
  // Render decaying pages
  const decayingPages = pages.filter(p => 
    p.decay.severity === 'critical' || p.decay.severity === 'warning'
  ).slice(0, 20);
  
  if (decayingPages.length === 0) {
    elements.decayingPages.innerHTML = `
      <div class="empty-state">
        <p>🎉 No significant content decay detected!</p>
      </div>
    `;
    return;
  }
  
  elements.decayingPages.innerHTML = decayingPages.map(page => `
    <div class="page-item" data-page="${encodeURIComponent(page.page)}">
      <div>
        <div class="page-url">${formatPagePath(page.page)}</div>
        <div class="change">↓ ${Math.abs(Math.round(page.decay.changes.clicks))}% clicks</div>
      </div>
      <span class="decay-badge ${page.decay.severity}">${page.decay.severity}</span>
    </div>
  `).join('');
  
  // Add click handlers for page details
  elements.decayingPages.querySelectorAll('.page-item').forEach(item => {
    item.addEventListener('click', () => {
      const pageUrl = decodeURIComponent(item.dataset.page);
      showPageDetail(pageUrl);
    });
  });
}

function formatPagePath(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname || '/';
  } catch {
    return url;
  }
}

function showPageDetail(pageUrl) {
  const page = currentAnalysis.pages.find(p => p.page === pageUrl);
  if (!page) return;
  
  const modal = elements.modal;
  modal.querySelector('#modal-page-url').textContent = pageUrl;
  
  // Render metrics
  const metricsHtml = `
    <div class="metric-row">
      <span class="metric-label">Clicks Change</span>
      <span class="metric-value ${page.decay.changes.clicks < 0 ? 'negative' : 'positive'}">
        ${page.decay.changes.clicks > 0 ? '+' : ''}${Math.round(page.decay.changes.clicks)}%
      </span>
    </div>
    <div class="metric-row">
      <span class="metric-label">Impressions Change</span>
      <span class="metric-value ${page.decay.changes.impressions < 0 ? 'negative' : 'positive'}">
        ${page.decay.changes.impressions > 0 ? '+' : ''}${Math.round(page.decay.changes.impressions)}%
      </span>
    </div>
    <div class="metric-row">
      <span class="metric-label">CTR Change</span>
      <span class="metric-value ${page.decay.changes.ctr < 0 ? 'negative' : 'positive'}">
        ${page.decay.changes.ctr > 0 ? '+' : ''}${Math.round(page.decay.changes.ctr)}%
      </span>
    </div>
    <div class="metric-row">
      <span class="metric-label">Position Change</span>
      <span class="metric-value ${page.decay.changes.position < 0 ? 'negative' : 'positive'}">
        ${page.decay.changes.position > 0 ? '+' : ''}${page.decay.changes.position.toFixed(1)}
      </span>
    </div>
    <div class="metric-row">
      <span class="metric-label">Decay Score</span>
      <span class="metric-value">${page.decay.score}</span>
    </div>
  `;
  modal.querySelector('#modal-metrics').innerHTML = metricsHtml;
  
  // Render recommendations
  const recommendationsHtml = `
    <h4>📋 Recommendations</h4>
    <ul>
      ${page.decay.recommendation.map(r => `<li>${r}</li>`).join('')}
    </ul>
  `;
  modal.querySelector('#modal-recommendations').innerHTML = recommendationsHtml;
  
  modal.classList.remove('hidden');
}
```

---

## Publishing to Chrome Web Store

### Pre-Publication Checklist

1. **Create promotional images**
   - Icon: 128x128 PNG
   - Screenshots: 1280x800 or 640x400
   - Promotional tile: 440x280

2. **Write compelling description**

3. **Create privacy policy**
   - Host on your website or GitHub Pages
   - Include what data you collect (OAuth tokens, site analytics)

4. **Package extension**
   ```bash
   cd content-decay-extension
   zip -r extension.zip . -x "*.git*" "node_modules/*" ".DS_Store"
   ```

### Chrome Web Store Submission

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/developer/dashboard)
2. Pay $5 one-time developer fee
3. Click **New Item**
4. Upload your ZIP file
5. Fill in details:
   - Category: Productivity
   - Language: English
   - Visibility: Public
6. Submit for review (typically 1-3 days)

### OAuth Verification

For public release, you'll need to:
1. Verify your app with Google
2. Submit for OAuth consent screen verification
3. May require security assessment for sensitive scopes

---

## Advanced Features (Future Enhancements)

### 1. Export Functionality
```javascript
function exportToCSV(pages) {
  const headers = ['URL', 'Clicks Change', 'Impressions Change', 'Severity', 'Score'];
  const rows = pages.map(p => [
    p.page,
    p.decay.changes.clicks,
    p.decay.changes.impressions,
    p.decay.severity,
    p.decay.score
  ]);
  
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  // Download CSV...
}
```

### 2. Notification System
```javascript
// In service worker
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dailyAnalysis') {
    const results = await runBackgroundAnalysis();
    
    if (results.criticalCount > 0) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icons/icon128.png',
        title: 'Content Decay Alert',
        message: `${results.criticalCount} pages need immediate attention!`
      });
    }
  }
});
```

### 3. Historical Trend Charts
Use Chart.js or similar library to show decay trends over time.

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "Not authenticated" error | Clear extension storage, re-authenticate |
| No sites appear | Verify Search Console access, check API is enabled |
| Data shows 0 clicks | Data has 2-3 day delay, try earlier date range |
| Rate limit errors | Implement exponential backoff, reduce query frequency |
| OAuth popup blocked | Ensure `identity` permission is in manifest |

### Debug Tips

1. **View service worker logs**: chrome://extensions → "Service Worker" link
2. **Popup console**: Right-click extension icon → "Inspect popup"
3. **Test API calls**: Use [APIs Explorer](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)

---

## Resources

- [Google Search Console API Documentation](https://developers.google.com/webmaster-tools)
- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [OAuth 2.0 for Chrome Extensions](https://developer.chrome.com/docs/extensions/reference/api/identity)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/develop/migrate)

---

*Last updated: January 2026*
