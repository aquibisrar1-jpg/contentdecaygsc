// Authentication utilities for Google OAuth2

/**
 * Initiate OAuth2 flow using getAuthToken
 * This uses the Chrome Identity API with the oauth2 config from manifest.json
 */
export async function signIn() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        console.error('Auth error:', chrome.runtime.lastError);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      if (!token) {
        reject(new Error('No token received'));
        return;
      }
      
      // Store token
      chrome.storage.local.set({ accessToken: token }, () => {
        resolve({ accessToken: token });
      });
    });
  });
}

/**
 * Get access token (refreshes automatically if needed)
 */
export async function getAccessToken() {
  return new Promise((resolve) => {
    // getAuthToken with interactive: false will return cached token or refresh if needed
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve(null);
      } else {
        // Update stored token
        chrome.storage.local.set({ accessToken: token }, () => {
          resolve(token);
        });
      }
    });
  });
}

/**
 * Sign out and revoke token
 */
export async function signOut() {
  return new Promise((resolve) => {
    // First get the current token
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        // Remove the cached token
        chrome.identity.removeCachedAuthToken({ token }, () => {
          // Clear local storage
          chrome.storage.local.remove(['accessToken', 'userInfo'], () => {
            resolve();
          });
        });
      } else {
        // Just clear storage if no token
        chrome.storage.local.remove(['accessToken', 'userInfo'], () => {
          resolve();
        });
      }
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
