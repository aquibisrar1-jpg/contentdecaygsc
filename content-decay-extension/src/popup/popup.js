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
  exportBtn: document.getElementById('export-btn'),
  userAvatar: document.getElementById('user-avatar'),
  userName: document.getElementById('user-name'),
  sitesList: document.getElementById('sites-list'),
  currentSite: document.getElementById('current-site'),
  decayingPages: document.getElementById('decaying-pages'),
  pagesCount: document.getElementById('pages-count'),
  criticalCount: document.getElementById('critical-count'),
  warningCount: document.getElementById('warning-count'),
  monitoringCount: document.getElementById('monitoring-count'),
  healthyCount: document.getElementById('healthy-count'),
  healthScore: document.getElementById('health-score'),
  healthCircle: document.getElementById('health-circle'),
  cacheInfo: document.getElementById('cache-info'),
  modal: document.getElementById('page-detail-modal'),
  errorToast: document.getElementById('error-toast'),
  errorMessage: document.getElementById('error-message')
};

// State
let currentSiteUrl = null;
let currentAnalysis = null;

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  showScreen('loading');

  try {
    // Check authentication status
    const token = await getAccessToken();

    if (token) {
      const userInfo = await getUserInfo(token);
      await chrome.storage.local.set({ userInfo });
      showUserInfo(userInfo);
      await loadSites();
      showScreen('siteSelection');
    } else {
      showScreen('login');
    }
  } catch (error) {
    console.error('Init error:', error);
    showScreen('login');
  }

  setupEventListeners();
}

function setupEventListeners() {
  elements.signInBtn.addEventListener('click', handleSignIn);
  elements.signOutBtn.addEventListener('click', handleSignOut);
  elements.backBtn.addEventListener('click', () => showScreen('siteSelection'));
  elements.refreshBtn.addEventListener('click', () => analyzeSite(currentSiteUrl, true));
  elements.exportBtn.addEventListener('click', handleExport);

  // Date Range Change
  const dateSelect = document.getElementById('date-range-select');
  if (dateSelect) {
    dateSelect.addEventListener('change', (e) => {
      const newDays = parseInt(e.target.value, 10);
      if (currentSiteUrl) {
        analyzeSite(currentSiteUrl, true); // Re-analyze with new date range
      }
    });
  }

  // Modal close handlers
  document.querySelector('.close-modal').addEventListener('click', closeModal);
  document.querySelector('.modal-backdrop').addEventListener('click', closeModal);
}

function showScreen(screenName) {
  Object.values(screens).forEach(screen => screen.classList.add('hidden'));
  screens[screenName].classList.remove('hidden');
}

function showToast(message, duration = 3000) {
  elements.errorMessage.textContent = message;
  elements.errorToast.classList.remove('hidden');

  setTimeout(() => {
    elements.errorToast.classList.add('hidden');
  }, duration);
}

// Authentication
async function handleSignIn() {
  elements.signInBtn.disabled = true;
  elements.signInBtn.innerHTML = `
    <div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
    Signing in...
  `;

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
    showToast('Sign in failed: ' + error.message);
  } finally {
    elements.signInBtn.disabled = false;
    elements.signInBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Sign in with Google
    `;
  }
}

async function handleSignOut() {
  await signOut();
  currentSiteUrl = null;
  currentAnalysis = null;
  showScreen('login');
}

function showUserInfo(userInfo) {
  elements.userAvatar.src = userInfo.picture || '';
  elements.userName.textContent = userInfo.name || userInfo.email;
}

// Sites
async function loadSites() {
  elements.sitesList.innerHTML = '<div class="loading-text">Loading your sites...</div>';

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
    <div class="site-item" data-url="${encodeURIComponent(site.siteUrl)}">
      <span class="url">${formatSiteUrl(site.siteUrl)}</span>
      <span class="arrow">→</span>
    </div>
  `).join('');

  elements.sitesList.querySelectorAll('.site-item').forEach(item => {
    item.addEventListener('click', () => {
      const siteUrl = decodeURIComponent(item.dataset.url);
      analyzeSite(siteUrl);
    });
  });
}

function formatSiteUrl(url) {
  return url.replace(/^(sc-domain:|https?:\/\/)/, '').replace(/\/$/, '');
}

// Analysis
async function analyzeSite(siteUrl, forceRefresh = false) {
  currentSiteUrl = siteUrl;
  elements.currentSite.textContent = formatSiteUrl(siteUrl);
  showScreen('analysis');

  // Reset UI
  elements.decayingPages.innerHTML = '<div class="loading-text">Analyzing your content...</div>';
  elements.healthScore.textContent = '--';
  elements.healthCircle.style.strokeDasharray = '0, 100';
  elements.cacheInfo.textContent = '';
  elements.pagesCount.textContent = '0';

  try {
    let response;

    // Check cache first
    if (!forceRefresh) {
      const cached = await chrome.runtime.sendMessage({
        action: 'GET_CACHED_ANALYSIS',
        siteUrl
      });

      if (cached.success && cached.cached) {
        response = cached;
        elements.cacheInfo.textContent = `Cached ${cached.cacheAge} minutes ago`;
      }
    }

    // Run fresh analysis if needed
    if (!response) {
      elements.cacheInfo.textContent = 'Running fresh analysis...';
      response = await chrome.runtime.sendMessage({
        action: 'ANALYZE_SITE',
        siteUrl,
        options: { forceRefresh }
      });
    }

    if (!response.success) {
      throw new Error(response.error);
    }

    currentAnalysis = { summary: response.summary, pages: response.pages };
    renderAnalysis(response.summary, response.pages);

    if (!response.cached) {
      elements.cacheInfo.textContent = 'Analysis complete';
    }

  } catch (error) {
    elements.decayingPages.innerHTML = `
      <div class="error">Analysis failed: ${error.message}</div>
    `;
    elements.cacheInfo.textContent = '';
  }
}

function renderAnalysis(summary, pages) {
  // Update summary cards
  elements.criticalCount.textContent = summary.criticalCount;
  elements.warningCount.textContent = summary.warningCount;
  elements.monitoringCount.textContent = summary.monitoringCount;
  elements.healthyCount.textContent = summary.healthyCount;

  // Update health score with animation
  const score = summary.healthScore;
  elements.healthScore.textContent = score + '%';

  // Animate the circle
  setTimeout(() => {
    elements.healthCircle.style.strokeDasharray = `${score}, 100`;

    // Change color based on score
    if (score >= 70) {
      elements.healthCircle.style.stroke = '#43a047';
    } else if (score >= 40) {
      elements.healthCircle.style.stroke = '#fb8c00';
    } else {
      elements.healthCircle.style.stroke = '#e53935';
    }
  }, 100);

  // Render decaying pages
  const decayingPages = pages.filter(p =>
    p.decay.severity === 'critical' || p.decay.severity === 'warning'
  );

  elements.pagesCount.textContent = decayingPages.length;

  if (decayingPages.length === 0) {
    elements.decayingPages.innerHTML = `
      <div class="empty-state">
        <p>🎉 No significant content decay detected!</p>
        <p>Your content is performing well.</p>
      </div>
    `;
    return;
  }

  renderPageList(decayingPages);
}

// State for page list sorting
let currentPageMetric = 'clicks';
let currentPageSort = { col: 'diff', dir: 'desc' };

function renderPageList(pages) {
  const metric = currentPageMetric;
  const sorted = [...pages].sort((a, b) => {
    let valA, valB;
    const metricKey = metric === 'rank' ? 'position' : metric;

    if (currentPageSort.col === 'current') {
      valA = a.current[metricKey] || 0;
      valB = b.current[metricKey] || 0;
    } else if (currentPageSort.col === 'previous') {
      valA = a.previous[metricKey] || 0;
      valB = b.previous[metricKey] || 0;
    } else { // diff
      valA = a.decay.changes[metricKey] || 0;
      valB = b.decay.changes[metricKey] || 0;
    }

    return currentPageSort.dir === 'asc' ? valA - valB : valB - valA;
  });

  const getArrow = (col) => {
    if (currentPageSort.col !== col) return '';
    return currentPageSort.dir === 'asc' ? ' ↑' : ' ↓';
  };

  const metricLabel = metric === 'rank' ? 'Position' : metric.charAt(0).toUpperCase() + metric.slice(1);

  elements.decayingPages.innerHTML = `
    <div class="section-header">
      <div class="header-title">
        <h3>Decaying Pages</h3>
        <span class="count-badge">${pages.length}</span>
      </div>
      <select id="page-metric-select" class="sort-select">
        <option value="clicks" ${metric === 'clicks' ? 'selected' : ''}>Clicks</option>
        <option value="impressions" ${metric === 'impressions' ? 'selected' : ''}>Impressions</option>
        <option value="rank" ${metric === 'rank' ? 'selected' : ''}>Position</option>
      </select>
    </div>
    <div class="pages-list" style="max-height: 300px; overflow-y: auto;">
      <table class="queries-table comparison-table" style="width: 100%;">
        <thead>
          <tr>
            <th style="text-align: left;">Page</th>
            <th class="sortable" data-sort="current" style="text-align: right; cursor: pointer;">
              Current${getArrow('current')}
            </th>
            <th class="sortable" data-sort="previous" style="text-align: right; cursor: pointer;">
              Previous${getArrow('previous')}
            </th>
            <th class="sortable" data-sort="diff" style="text-align: right; cursor: pointer;">
              Change${getArrow('diff')}
            </th>
          </tr>
        </thead>
        <tbody>
          ${sorted.slice(0, 30).map(page => {
    const metricKey = metric === 'rank' ? 'position' : metric;
    const curr = page.current[metricKey] || 0;
    const prev = page.previous[metricKey] || 0;
    const diff = page.decay.changes[metricKey] || 0;

    let diffClass = 'neutral';
    if (diff !== 0) {
      if (metric === 'rank') {
        diffClass = diff < 0 ? 'pos' : 'neg'; // Lower position = better
      } else {
        diffClass = diff > 0 ? 'pos' : 'neg';
      }
    }

    return `
              <tr class="page-row" data-page="${encodeURIComponent(page.page)}" style="cursor: pointer;">
                <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${page.page}">
                  ${formatPagePath(page.page)}
                </td>
                <td style="text-align: right;">${metric === 'rank' ? curr.toFixed(1) : fNum(curr)}</td>
                <td style="text-align: right;">${metric === 'rank' ? prev.toFixed(1) : fNum(prev)}</td>
                <td style="text-align: right;">
                  <span class="diff ${diffClass}">${diff > 0 ? '+' : ''}${Math.round(diff)}%</span>
                </td>
              </tr>
            `;
  }).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Metric dropdown handler
  document.getElementById('page-metric-select').addEventListener('change', (e) => {
    currentPageMetric = e.target.value;
    renderPageList(pages);
  });

  // Sort header handlers
  elements.decayingPages.querySelectorAll('.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (currentPageSort.col === col) {
        currentPageSort.dir = currentPageSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        currentPageSort.col = col;
        currentPageSort.dir = 'desc';
      }
      renderPageList(pages);
    });
  });

  // Row click handlers
  elements.decayingPages.querySelectorAll('.page-row').forEach(row => {
    row.addEventListener('click', () => {
      const pageUrl = decodeURIComponent(row.dataset.page);
      showPageDetail(pageUrl);
    });
  });
}

function fNum(num) {
  return num >= 1000 ? (num / 1000).toFixed(1) + 'k' : num;
}

function formatPagePath(url) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    return path.length > 40 ? '...' + path.slice(-37) : path;
  } catch {
    return url.slice(-40);
  }
}

// Page Detail Modal
function showPageDetail(pageUrl) {
  const page = currentAnalysis.pages.find(p => p.page === pageUrl);
  if (!page) return;

  const modal = elements.modal;

  // Set page URL
  modal.querySelector('#modal-page-url').textContent = pageUrl;

  // Set severity badge
  const severityBadge = modal.querySelector('#modal-severity');
  severityBadge.textContent = page.decay.severity;
  severityBadge.className = `severity-badge ${page.decay.severity}`;

  // Render metrics
  const metricsHtml = `
    <div class="metric-card">
      <div class="label">Clicks Change</div>
      <div class="value ${page.decay.changes.clicks < 0 ? 'negative' : 'positive'}">
        ${page.decay.changes.clicks > 0 ? '+' : ''}${Math.round(page.decay.changes.clicks)}%
      </div>
    </div>
    <div class="metric-card">
      <div class="label">Impressions Change</div>
      <div class="value ${page.decay.changes.impressions < 0 ? 'negative' : 'positive'}">
        ${page.decay.changes.impressions > 0 ? '+' : ''}${Math.round(page.decay.changes.impressions)}%
      </div>
    </div>
    <div class="metric-card">
      <div class="label">CTR Change</div>
      <div class="value ${page.decay.changes.ctr < 0 ? 'negative' : 'positive'}">
        ${page.decay.changes.ctr > 0 ? '+' : ''}${Math.round(page.decay.changes.ctr)}%
      </div>
    </div>
    <div class="metric-card">
      <div class="label">Position Change</div>
      <div class="value ${page.decay.changes.position < 0 ? 'negative' : 'positive'}">
        ${page.decay.changes.position > 0 ? '+' : ''}${page.decay.changes.position.toFixed(1)}
      </div>
    </div>
    <div class="metric-card">
      <div class="label">Decay Score</div>
      <div class="value neutral">${page.decay.score}</div>
    </div>
    <div class="metric-card">
      <div class="label">Current Clicks</div>
      <div class="value neutral">${page.current.clicks}</div>
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

  // Set action links
  modal.querySelector('#modal-open-url').href = pageUrl;

  // Create GSC URL
  const gscUrl = `https://search.google.com/search-console/performance/search-analytics?resource_id=${encodeURIComponent(currentSiteUrl)}&page=!${encodeURIComponent(pageUrl)}`;
  modal.querySelector('#modal-open-gsc').href = gscUrl;

  // Show modal
  modal.classList.remove('hidden');
}

function closeModal() {
  elements.modal.classList.add('hidden');
}

// Export
async function handleExport() {
  if (!currentSiteUrl) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'EXPORT_CSV',
      siteUrl: currentSiteUrl
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    // Create download
    const blob = new Blob([response.csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content-decay-${formatSiteUrl(currentSiteUrl)}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('CSV exported successfully!');

  } catch (error) {
    showToast('Export failed: ' + error.message);
  }
}
