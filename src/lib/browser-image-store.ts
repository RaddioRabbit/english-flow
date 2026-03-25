const DB_NAME = "english-flow-assets";
const DB_VERSION = 2;

export type AssetStoreName =
  | "reference-assets"
  | "generated-images"
  | "sentence-explanation-audio"
  | "sentence-explanation-videos";

interface AssetRecord {
  key: string;
  dataUrl: string;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function hasWindow() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDatabase() {
  if (!hasWindow()) {
    return Promise.resolve<IDBDatabase | null>(null);
  }

  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        for (const storeName of [
          "reference-assets",
          "generated-images",
          "sentence-explanation-audio",
          "sentence-explanation-videos",
        ] as const) {
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName, { keyPath: "key" });
          }
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
    });
  }

  return databasePromise.catch((error) => {
    console.error("Failed to initialize image asset store.", error);
    databasePromise = null;
    return null;
  });
}

function runReadonlyTransaction<T>(
  database: IDBDatabase,
  storeName: AssetStoreName,
  executor: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
) {
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    executor(store, resolve, reject);
    transaction.onerror = () => reject(transaction.error ?? new Error(`IndexedDB read failed for ${storeName}.`));
  });
}

function runReadwriteTransaction(
  database: IDBDatabase,
  storeName: AssetStoreName,
  executor: (store: IDBObjectStore) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    executor(store);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error(`IndexedDB write failed for ${storeName}.`));
  });
}

export async function saveAssetData(storeName: AssetStoreName, entries: AssetRecord[]) {
  if (!entries.length) return;
  const database = await openDatabase();
  if (!database) return;

  await runReadwriteTransaction(database, storeName, (store) => {
    entries.forEach((entry) => {
      if (!entry.key || !entry.dataUrl) return;
      store.put(entry);
    });
  });
}

export async function loadAssetData(storeName: AssetStoreName, keys: string[]) {
  if (!keys.length) return {} as Record<string, string>;
  const database = await openDatabase();
  if (!database) return {} as Record<string, string>;

  return runReadonlyTransaction<Record<string, string>>(database, storeName, (store, resolve, reject) => {
    const records: Record<string, string> = {};
    const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));

    if (!uniqueKeys.length) {
      resolve(records);
      return;
    }

    let remaining = uniqueKeys.length;
    uniqueKeys.forEach((key) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const result = request.result as AssetRecord | undefined;
        if (result?.dataUrl) {
          records[key] = result.dataUrl;
        }
        remaining -= 1;
        if (remaining === 0) {
          resolve(records);
        }
      };
      request.onerror = () => reject(request.error ?? new Error(`Failed to read asset ${key}.`));
    });
  });
}

export async function deleteAssetData(storeName: AssetStoreName, keys: string[]) {
  if (!keys.length) return;
  const database = await openDatabase();
  if (!database) return;

  await runReadwriteTransaction(database, storeName, (store) => {
    Array.from(new Set(keys.filter(Boolean))).forEach((key) => {
      store.delete(key);
    });
  });
}
