/**
 * IndexedDB Caching Utility for DuroAcademy Admin Panel
 * 
 * Provides a simple key-value cache with TTL (time-to-live) support
 * using IndexedDB for persistent, large-capacity local storage.
 * 
 * Stores:
 *   - appCache: General data cache (API responses, lookup tables)
 *   - appMeta: Small metadata (admin email, preferences)
 */

const DB_NAME = 'DuroAcademyCache'
const DB_VERSION = 1
const CACHE_STORE = 'appCache'
const META_STORE = 'appMeta'

// Default TTL values (in milliseconds)
export const TTL = {
  SHORT: 2 * 60 * 1000,        // 2 minutes  — fast-changing data (stats, counts)
  MEDIUM: 10 * 60 * 1000,      // 10 minutes — moderately changing (users, feedbacks)
  LONG: 30 * 60 * 1000,        // 30 minutes — slow-changing (modules, categories, departments)
  VERY_LONG: 2 * 60 * 60 * 1000, // 2 hours  — rarely changing (org structure, lookup tables)
  SESSION: null,                // No expiry — cleared on logout
}

let dbPromise = null

/**
 * Open (or create) the IndexedDB database
 */
function openDB() {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result

      // Main cache store: { key, data, timestamp, ttl }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        const store = db.createObjectStore(CACHE_STORE, { keyPath: 'key' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }

      // Meta store: { key, value }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      console.error('[CacheDB] Failed to open IndexedDB:', request.error)
      reject(request.error)
    }
  })

  return dbPromise
}

/**
 * Get a cached value by key
 * Returns null if not found or expired
 */
export async function cacheGet(key) {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(CACHE_STORE, 'readonly')
      const store = tx.objectStore(CACHE_STORE)
      const request = store.get(key)

      request.onsuccess = () => {
        const record = request.result
        if (!record) {
          resolve(null)
          return
        }

        // Check TTL expiry
        if (record.ttl !== null && record.ttl !== undefined) {
          const age = Date.now() - record.timestamp
          if (age > record.ttl) {
            // Expired — delete and return null
            try {
              const deleteTx = db.transaction(CACHE_STORE, 'readwrite')
              deleteTx.objectStore(CACHE_STORE).delete(key)
            } catch (e) { /* ignore cleanup errors */ }
            resolve(null)
            return
          }
        }

        resolve(record.data)
      }

      request.onerror = () => {
        console.warn('[CacheDB] Read error for key:', key)
        resolve(null)
      }
    })
  } catch (error) {
    console.warn('[CacheDB] cacheGet failed:', error)
    return null
  }
}

/**
 * Store a value in cache with optional TTL
 * @param {string} key - Cache key
 * @param {*} data - Data to cache (must be serializable)
 * @param {number|null} ttl - Time-to-live in ms, null = no expiry
 */
export async function cacheSet(key, data, ttl = TTL.MEDIUM) {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite')
      const store = tx.objectStore(CACHE_STORE)
      store.put({
        key,
        data,
        timestamp: Date.now(),
        ttl,
      })
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => {
        console.warn('[CacheDB] Write error for key:', key)
        resolve(false)
      }
    })
  } catch (error) {
    console.warn('[CacheDB] cacheSet failed:', error)
    return false
  }
}

/**
 * Delete a specific cache key
 */
export async function cacheDelete(key) {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite')
      tx.objectStore(CACHE_STORE).delete(key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    })
  } catch (error) {
    return false
  }
}

/**
 * Clear all cached data (e.g., on logout)
 */
export async function cacheClearAll() {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction([CACHE_STORE, META_STORE], 'readwrite')
      tx.objectStore(CACHE_STORE).clear()
      tx.objectStore(META_STORE).clear()
      tx.oncomplete = () => {
        console.log('[CacheDB] All caches cleared')
        resolve(true)
      }
      tx.onerror = () => resolve(false)
    })
  } catch (error) {
    return false
  }
}

/**
 * Store small metadata (admin email, preferences)
 */
export async function metaSet(key, value) {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(META_STORE, 'readwrite')
      tx.objectStore(META_STORE).put({ key, value })
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    })
  } catch (error) {
    return false
  }
}

/**
 * Read small metadata
 */
export async function metaGet(key) {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(META_STORE, 'readonly')
      const request = tx.objectStore(META_STORE).get(key)
      request.onsuccess = () => resolve(request.result?.value ?? null)
      request.onerror = () => resolve(null)
    })
  } catch (error) {
    return null
  }
}

/**
 * Delete a metadata key
 */
export async function metaDelete(key) {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(META_STORE, 'readwrite')
      tx.objectStore(META_STORE).delete(key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    })
  } catch (error) {
    return false
  }
}

/**
 * Clean up expired entries (call periodically or on app start)
 */
export async function cacheCleanup() {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite')
      const store = tx.objectStore(CACHE_STORE)
      const request = store.openCursor()
      let cleaned = 0

      request.onsuccess = (event) => {
        const cursor = event.target.result
        if (cursor) {
          const record = cursor.value
          if (record.ttl !== null && record.ttl !== undefined) {
            const age = Date.now() - record.timestamp
            if (age > record.ttl) {
              cursor.delete()
              cleaned++
            }
          }
          cursor.continue()
        }
      }

      tx.oncomplete = () => {
        if (cleaned > 0) {
          console.log(`[CacheDB] Cleaned ${cleaned} expired entries`)
        }
        resolve(cleaned)
      }
      tx.onerror = () => resolve(0)
    })
  } catch (error) {
    return 0
  }
}

/**
 * Helper: Fetch with cache
 * Tries cache first, falls back to fetcher function, then caches the result
 * 
 * @param {string} key - Cache key
 * @param {Function} fetcher - Async function that returns data
 * @param {number|null} ttl - TTL in ms
 * @param {boolean} forceRefresh - Skip cache and force fresh fetch
 * @returns {Object} { data, fromCache }
 */
export async function cachedFetch(key, fetcher, ttl = TTL.MEDIUM, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = await cacheGet(key)
    if (cached !== null) {
      console.log(`[CacheDB] Cache HIT: ${key}`)
      return { data: cached, fromCache: true }
    }
  }

  console.log(`[CacheDB] Cache MISS: ${key} — fetching...`)
  const data = await fetcher()

  // Cache the result in background (don't block)
  if (data !== null && data !== undefined) {
    cacheSet(key, data, ttl).catch(() => {})
  }

  return { data, fromCache: false }
}

// Run cleanup on import (once per page load)
cacheCleanup().catch(() => {})
