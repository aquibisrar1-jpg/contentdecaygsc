// Service Worker - Handles background tasks and message passing

import { getAccessToken, isAuthenticated } from '../utils/auth.js';
import { getSites, getPagePerformanceComparison } from '../utils/api.js';
import { analyzeContentDecay, calculateSiteSummary, exportToCSV } from '../utils/decay-analyzer.js';

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Content Decay Analyzer installed', details.reason);
  
  // Set up periodic analysis alarm (every 24 hours)
  chrome.alarms.create('dailyAnalysis', {
    periodInMinutes: 24 * 60 // 24 hours
  });
  
  // Clear any old cache on update
  if (details.reason === 'update') {
    clearOldCache();
  }
});

// Handle alarms for scheduled tasks
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log('Alarm triggered:', alarm.name);
  
  if (alarm.name === 'dailyAnalysis') {
    await runBackgroundAnalysis();
  }
});

// Handle messages from popup and other extension components
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle async responses properly
  handleMessage(message)
    .then(sendResponse)
    .catch(error => sendResponse({ success: false, error: error.message }));
  
  return true; // Keep message channel open for async response
});

/**
 * Route messages to appropriate handlers
 */
async function handleMessage(message) {
  console.log('Received message:', message.action);
  
  switch (message.action) {
    case 'GET_SITES':
      return await handleGetSites();
    
    case 'ANALYZE_SITE':
      return await handleAnalyzeSite(message.siteUrl, message.options);
    
    case 'GET_CACHED_ANALYSIS':
      return await getCachedAnalysis(message.siteUrl);
    
    case 'CHECK_AUTH':
      return { 
        success: true, 
        authenticated: await isAuthenticated() 
      };
    
    case 'EXPORT_CSV':
      return await handleExportCSV(message.siteUrl);
    
    case 'CLEAR_CACHE':
      return await handleClearCache(message.siteUrl);
    
    default:
      return { success: false, error: 'Unknown action: ' + message.action };
  }
}

/**
 * Get list of Search Console sites
 */
async function handleGetSites() {
  try {
    const sites = await getSites();
    return { 
      success: true, 
      sites: sites.map(site => ({
        siteUrl: site.siteUrl,
        permissionLevel: site.permissionLevel
      }))
    };
  } catch (error) {
    console.error('Failed to get sites:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Analyze a specific site for content decay
 */
async function handleAnalyzeSite(siteUrl, options = {}) {
  try {
    const {
      currentDays = 30,
      previousDays = 30,
      minImpressions = 50,
      forceRefresh = false
    } = options;
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await getCachedAnalysis(siteUrl);
      if (cached.success && cached.cached) {
        console.log('Returning cached analysis for', siteUrl);
        return cached;
      }
    }
    
    console.log('Running fresh analysis for', siteUrl);
    
    // Get performance comparison data
    const comparison = await getPagePerformanceComparison(siteUrl, {
      currentDays,
      previousDays,
      minImpressions
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
    
    return { 
      success: true, 
      cached: false,
      summary, 
      pages: analyzed 
    };
    
  } catch (error) {
    console.error('Analysis failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get cached analysis results
 */
async function getCachedAnalysis(siteUrl) {
  const cacheKey = `analysis_${btoa(siteUrl)}`;
  const result = await chrome.storage.local.get(cacheKey);
  
  if (result[cacheKey]) {
    const age = Date.now() - result[cacheKey].timestamp;
    const maxAge = 12 * 60 * 60 * 1000; // 12 hours
    
    if (age < maxAge) {
      return { 
        success: true, 
        cached: true,
        cacheAge: Math.round(age / 1000 / 60), // minutes
        ...result[cacheKey] 
      };
    }
  }
  
  return { success: false, cached: false };
}

/**
 * Export analysis as CSV
 */
async function handleExportCSV(siteUrl) {
  try {
    const cached = await getCachedAnalysis(siteUrl);
    
    if (!cached.success || !cached.pages) {
      return { success: false, error: 'No analysis data available. Run analysis first.' };
    }
    
    const csv = exportToCSV(cached.pages);
    return { success: true, csv };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Clear cache for a specific site or all sites
 */
async function handleClearCache(siteUrl = null) {
  try {
    if (siteUrl) {
      const cacheKey = `analysis_${btoa(siteUrl)}`;
      await chrome.storage.local.remove(cacheKey);
    } else {
      // Clear all analysis caches
      const storage = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(storage).filter(k => k.startsWith('analysis_'));
      await chrome.storage.local.remove(cacheKeys);
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Clear old cache entries (older than 7 days)
 */
async function clearOldCache() {
  const storage = await chrome.storage.local.get(null);
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  const now = Date.now();
  
  const keysToRemove = [];
  
  for (const [key, value] of Object.entries(storage)) {
    if (key.startsWith('analysis_') && value.timestamp) {
      if (now - value.timestamp > maxAge) {
        keysToRemove.push(key);
      }
    }
  }
  
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
    console.log(`Cleared ${keysToRemove.length} old cache entries`);
  }
}

/**
 * Run background analysis for all sites
 */
async function runBackgroundAnalysis() {
  console.log('Starting background analysis...');
  
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    console.log('Not authenticated, skipping background analysis');
    return;
  }
  
  try {
    const sites = await getSites();
    
    // Analyze up to 5 sites to avoid rate limits
    for (const site of sites.slice(0, 5)) {
      console.log('Analyzing site:', site.siteUrl);
      
      await handleAnalyzeSite(site.siteUrl, { forceRefresh: true });
      
      // Small delay between sites to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Check for critical decay and notify
    await checkAndNotify(sites);
    
    console.log('Background analysis complete');
    
  } catch (error) {
    console.error('Background analysis failed:', error);
  }
}

/**
 * Check for critical decay and send notification
 */
async function checkAndNotify(sites) {
  let totalCritical = 0;
  
  for (const site of sites) {
    const cached = await getCachedAnalysis(site.siteUrl);
    if (cached.success && cached.summary) {
      totalCritical += cached.summary.criticalCount;
    }
  }
  
  if (totalCritical > 0) {
    // Update badge to show critical count
    chrome.action.setBadgeText({ text: totalCritical.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#e53935' });
    
    // Optional: Show notification (requires 'notifications' permission)
    // Uncomment and add "notifications" to manifest permissions to enable
    /*
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'assets/icons/icon128.png',
      title: 'Content Decay Alert',
      message: `${totalCritical} page(s) need immediate attention!`,
      priority: 2
    });
    */
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Log service worker startup
console.log('Content Decay Analyzer service worker started');
