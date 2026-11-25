// Small persistent key/value store for teams and settings (IndexedDB, with
// localStorage as fallback when IndexedDB is unavailable).

const DB = 'hedgewars';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await openDb();
    return await new Promise<T>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result === undefined ? fallback : (req.result as T));
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const v = localStorage.getItem(`${DB}:${key}`);
      return v === null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  }
}

export async function save<T>(key: string, value: T): Promise<void> {
  const plain = JSON.parse(JSON.stringify(value)) as T;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(plain, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try {
      localStorage.setItem(`${DB}:${key}`, JSON.stringify(plain));
    } catch {
      /* storage unavailable */
    }
  }
}
