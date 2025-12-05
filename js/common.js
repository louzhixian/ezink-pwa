// Common JavaScript for offline status detection
// Updates the offline badge visibility based on network status

function updateOnlineStatus() {
  const badge = document.getElementById('offlineBadge');

  if (!badge) {
    return; // Badge not present on this page
  }

  if (!navigator.onLine) {
    // Device is offline
    badge.style.display = 'inline-block';
    console.log('Device is offline - showing badge');
  } else {
    // Device is online
    badge.style.display = 'none';
    console.log('Device is online - hiding badge');
  }
}

// Show offline badge programmatically (for explicit offline states)
function showOfflineBadge() {
  const badge = document.getElementById('offlineBadge');
  if (badge) {
    badge.style.display = 'inline-block';
  }
}

// Hide offline badge programmatically
function hideOfflineBadge() {
  const badge = document.getElementById('offlineBadge');
  if (badge) {
    badge.style.display = 'none';
  }
}

// Listen for online/offline events
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
window.addEventListener('load', updateOnlineStatus);

// Log initial status
console.log('Initial online status:', navigator.onLine);
