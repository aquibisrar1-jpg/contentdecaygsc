# Content Decay Analyzer Chrome Extension

A Chrome extension that identifies declining content using Google Search Console data. Detect pages experiencing traffic decay and get actionable recommendations.

## Features

- 🔐 **Google OAuth Integration** - Sign in with your Google account to access Search Console data
- 📊 **Decay Detection Algorithm** - Identifies pages with declining traffic, impressions, CTR, and rankings
- 📈 **Health Score Dashboard** - Quick overview of your site's content health
- 🚨 **Severity Classification** - Categorizes issues as Critical, Warning, Monitoring, or Healthy
- 💡 **Actionable Recommendations** - Get specific suggestions for each decaying page
- 📥 **CSV Export** - Download analysis results for further processing
- 🔄 **Automatic Caching** - Reduces API calls with smart caching

## Quick Start

### 1. Set Up Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Search Console API**:
   - Navigate to APIs & Services → Library
   - Search for "Google Search Console API"
   - Click Enable

### 2. Configure OAuth Consent Screen

1. Go to APIs & Services → OAuth consent screen
2. Choose **External** user type
3. Fill in the required fields
4. Add these scopes:
   - `https://www.googleapis.com/auth/webmasters.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
5. Add your email as a test user

### 3. Create OAuth Credentials

1. Go to APIs & Services → Credentials
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Chrome Extension** as the application type
4. Enter a name (e.g., "Content Decay Analyzer")
5. **Leave the Item ID field empty for now** (you'll add it after getting your Extension ID)
6. Click Create and copy the **Client ID** (looks like `123456789-abc123.apps.googleusercontent.com`)

### 4. Load the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select this project folder
5. **Copy your Extension ID** from the extension card (32-character string like `abcdefghijklmnopqrstuvwxyz123456`)

### 5. Complete Configuration

**In Google Cloud Console:**
1. Go back to APIs & Services → Credentials
2. Click on your OAuth client ID to edit it
3. In the **Item ID** field, paste your Extension ID
4. Click Save

**In the extension files:**
1. Open `manifest.json`
2. Replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with your actual Client ID
3. Go to `chrome://extensions/` and click the refresh icon on your extension

## Project Structure

```
content-decay-extension/
├── manifest.json              # Extension manifest (Manifest V3)
├── src/
│   ├── popup/
│   │   ├── popup.html        # Main popup UI
│   │   ├── popup.css         # Styles
│   │   └── popup.js          # UI logic
│   ├── background/
│   │   └── service-worker.js # Background tasks & API calls
│   └── utils/
│       ├── auth.js           # OAuth2 authentication
│       ├── api.js            # Search Console API
│       └── decay-analyzer.js # Decay detection algorithm
└── assets/
    └── icons/                # Extension icons (add your own)
```

## How It Works

### Content Decay Detection

The extension compares two 30-day periods:
- **Current Period**: Last 30 days (with 3-day delay for data availability)
- **Previous Period**: 30-60 days ago

### Decay Score Calculation

Each page receives a weighted decay score based on:
- **Clicks Change** (40% weight) - Direct traffic impact
- **Impressions Change** (30% weight) - Visibility loss indicator
- **CTR Change** (20% weight) - Relevance/competition signal
- **Position Change** (10% weight) - Ranking drift

### Severity Levels

| Severity | Score | Action |
|----------|-------|--------|
| Critical | > 30 | Immediate attention required |
| Warning | 15-30 | Schedule refresh within 2-4 weeks |
| Monitoring | 5-15 | Keep watching, consider minor updates |
| Healthy | < 5 | No action needed |

## API Rate Limits

The extension respects Google Search Console API limits:
- 20 queries per second per user
- 200 queries per minute per user
- Results cached for 12 hours to minimize API calls

## Adding Icons

Create PNG icons at these sizes and place them in `assets/icons/`:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

## Publishing to Chrome Web Store

1. Create a ZIP of all project files
2. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/developer/dashboard)
3. Pay the $5 one-time developer fee
4. Upload your ZIP and fill in the listing details
5. Submit for review

### Before Publishing

- Add a privacy policy URL
- Complete OAuth verification with Google
- Test thoroughly with multiple accounts
- Create compelling screenshots and descriptions

## Development

### Testing
- Use `chrome://extensions/` to reload after changes
- Click "Service Worker" to view background script logs
- Right-click extension icon → "Inspect popup" for popup debugging

### Common Issues

| Issue | Solution |
|-------|----------|
| `invalid_client` error | 1. Verify OAuth client type is "Chrome Extension" (not Web Application)<br>2. Make sure Extension ID is added to the OAuth client in Google Cloud<br>3. Confirm Client ID in manifest.json matches Google Cloud exactly |
| `OAuth2 not granted or revoked` | Add yourself as a test user in OAuth consent screen |
| No sites found | Check Search Console has verified properties for your Google account |
| Data returns empty | Data has 2-3 day delay; check date range |
| Rate limit errors | Wait and retry; check caching is working |

## License

MIT License - feel free to modify and use as needed.

## Contributing

Contributions welcome! Please open an issue or submit a pull request.
