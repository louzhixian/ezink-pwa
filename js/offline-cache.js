// Eink-It Offline Cache using IndexedDB
// Provides client-side caching for articles

const DB_NAME = 'eink-it-offline';
const DB_VERSION = 1;
const STORE_NAME = 'articles';

// Open or create IndexedDB database
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      console.log('IndexedDB opened successfully');
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      console.log('IndexedDB upgrade needed');
      const db = event.target.result;

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // Create index for sorting by creation date
        store.createIndex('created_at', 'created_at', { unique: false });
        console.log('Created articles object store with created_at index');
      }
    };
  });
}

// Save article to offline cache
async function saveArticleOffline(article) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Add timestamp if not present
    if (!article.cached_at) {
      article.cached_at = new Date().toISOString();
    }

    store.put(article);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log('Article saved to offline cache:', article.id);
        resolve();
      };
      tx.onerror = () => {
        console.error('Failed to save article:', tx.error);
        reject(tx.error);
      };
    });
  } catch (error) {
    console.error('Error in saveArticleOffline:', error);
    throw error;
  }
}

// Get article from offline cache by ID
async function getArticleOffline(articleId) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(articleId);

      request.onsuccess = () => {
        if (request.result) {
          console.log('Article found in offline cache:', articleId);
        } else {
          console.log('Article not found in offline cache:', articleId);
        }
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('Failed to get article:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Error in getArticleOffline:', error);
    return null;
  }
}

// Get all articles from offline cache (sorted by created_at descending)
async function getAllArticlesOffline() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('created_at');

    return new Promise((resolve, reject) => {
      const request = index.getAll();

      request.onsuccess = () => {
        const articles = request.result || [];
        // Sort in descending order (newest first)
        articles.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        console.log(`Found ${articles.length} articles in offline cache`);
        resolve(articles);
      };

      request.onerror = () => {
        console.error('Failed to get all articles:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Error in getAllArticlesOffline:', error);
    return [];
  }
}

// Delete article from offline cache
async function deleteArticleOffline(articleId) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    store.delete(articleId);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log('Article deleted from offline cache:', articleId);
        resolve();
      };
      tx.onerror = () => {
        console.error('Failed to delete article:', tx.error);
        reject(tx.error);
      };
    });
  } catch (error) {
    console.error('Error in deleteArticleOffline:', error);
    throw error;
  }
}

// Check if article has full content (not just metadata)
async function checkArticleDownloaded(articleId) {
  try {
    const article = await getArticleOffline(articleId);
    // Article is considered downloaded if it has full content
    return article && article.content && article.content.length > 0;
  } catch (error) {
    console.error('Error checking article download status:', error);
    return false;
  }
}

// Get offline cache statistics
async function getCacheStats() {
  try {
    const articles = await getAllArticlesOffline();
    const totalArticles = articles.length;

    // Calculate total size (approximate)
    let totalSize = 0;
    articles.forEach(article => {
      if (article.content) {
        totalSize += article.content.length;
      }
    });

    return {
      count: totalArticles,
      size: totalSize,
      sizeFormatted: formatBytes(totalSize)
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return { count: 0, size: 0, sizeFormatted: '0 B' };
  }
}

// Format bytes to human-readable format
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Clear all offline cache (for debugging or user request)
async function clearAllOfflineCache() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    store.clear();

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log('All offline cache cleared');
        resolve();
      };
      tx.onerror = () => {
        console.error('Failed to clear cache:', tx.error);
        reject(tx.error);
      };
    });
  } catch (error) {
    console.error('Error clearing offline cache:', error);
    throw error;
  }
}
