import type { Query, QueryClient, QueryKey } from '@tanstack/react-query';

/*
 * Luu dem du lieu da tai xuong IndexedDB cua trinh duyet (1.37.1).
 *
 * Mo lai ung dung (hoac F5) thi cac danh sach hay dung hien NGAY tu ban luu lan truoc,
 * roi lang le tai ban moi tu may chu thay vao. Khong thay doi gi o may chu.
 *
 * An toan — day la du lieu nghiep vu nam tren dia may nguoi dung:
 *  - Moi muc gan voi MOT tai khoan va MOT phien ban quyen (`permissions_version`).
 *    Doi tai khoan, hoac quyen vua doi (chuyen phong, doi vi tri) thi bo het ban luu —
 *    khong de nguoi dung thoang thay du lieu ho khong con duoc xem.
 *  - Dang xuat (ke ca bi dang xuat vi het phien) thi xoa sach.
 *  - Ban luu qua 24 gio thi bo.
 *  - Chi luu danh sach trong PERSISTED_KEYS — khong luu tai lieu, ghi chu, chi tiet.
 *  - Bo qua danh sach qua lon (MAX_ROWS) — chep vao IndexedDB cung ton thoi gian cua
 *    trinh duyet, va danh sach do nen tai dan thay vi luu ca khoi.
 */

const DB_NAME = 'workflow-cache';
const STORE = 'queries';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 10_000;
const SAVE_DELAY_MS = 2_000;

/** Tien to khoa duoc luu. So sanh theo tung phan tu dau cua khoa. */
const PERSISTED_KEYS: readonly QueryKey[] = [
  ['tasks', 'workspace'],
  ['deals'],
  ['customers'],
  ['boards'],
  ['projects'],
  ['revenues', 'summary'],
  ['revenues', 'years'],
  ['revenues', 'ams'],
  ['task-statuses'],
];

export interface PersistOwner {
  userId: number;
  permissionsVersion: number;
}

interface StoredEntry {
  id: string;
  owner: string;
  queryKey: QueryKey;
  data: unknown;
  savedAt: number;
}

export function ownerTag(owner: PersistOwner): string {
  return `${owner.userId}:${owner.permissionsVersion}`;
}

/** Khoa nay co nam trong danh sach duoc luu khong. */
export function isPersistedKey(key: QueryKey): boolean {
  return PERSISTED_KEYS.some(
    (prefix) =>
      prefix.length <= key.length && prefix.every((part, index) => Object.is(part, key[index]))
  );
}

/** Uoc luong so dong — du lieu qua lon thi khong luu. */
export function rowCount(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    let total = 0;
    for (const value of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(value)) total += value.length;
      else if (value && typeof value === 'object') total += rowCount(value);
    }
    return total;
  }
  return 0;
}

export function isFresh(savedAt: number, now = Date.now()): boolean {
  return now - savedAt <= MAX_AGE_MS;
}

/* ---------------- IndexedDB ---------------- */

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      /* Che do an danh, bi chan luu tru...: chay binh thuong, chi khong co dem. */
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const request = work(db.transaction(STORE, mode).objectStore(STORE));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

/** Xoa toan bo ban luu (dang xuat). */
export function clearPersistedQueries(): Promise<unknown> {
  return run('readwrite', (store) => store.clear());
}

/* ---------------- Gan vao QueryClient ---------------- */

let unsubscribe: (() => void) | null = null;

/**
 * Nap ban luu cua `owner` vao cache roi bat dau luu cac lan tai thanh cong ve sau.
 * Goi lai voi owner khac (doi tai khoan / doi quyen) thi dung lan gan truoc.
 */
export async function startQueryPersistence(client: QueryClient, owner: PersistOwner) {
  stopQueryPersistence();
  const tag = ownerTag(owner);

  const all = ((await run('readonly', (store) => store.getAll())) ?? []) as StoredEntry[];
  const stale = all.filter((entry) => entry.owner !== tag || !isFresh(entry.savedAt));
  if (stale.length > 0) {
    await Promise.all(stale.map((entry) => run('readwrite', (store) => store.delete(entry.id))));
  }
  for (const entry of all) {
    if (entry.owner !== tag || !isFresh(entry.savedAt)) continue;
    const current = client.getQueryState(entry.queryKey);
    /* Request that da ve truoc ban luu thi giu ban moi. `updatedAt` = luc luu, nen
       du lieu duoc coi la cu va trang van tai lai tu may chu ngay khi mo. */
    if (current?.dataUpdatedAt && current.dataUpdatedAt >= entry.savedAt) continue;
    client.setQueryData(entry.queryKey, entry.data, { updatedAt: entry.savedAt });
  }

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const save = (query: Query) => {
    const data = query.state.data;
    if (data === undefined || rowCount(data) > MAX_ROWS) return;
    const entry: StoredEntry = {
      id: `${tag}|${query.queryHash}`,
      owner: tag,
      queryKey: query.queryKey,
      data,
      savedAt: query.state.dataUpdatedAt || Date.now(),
    };
    void run('readwrite', (store) => store.put(entry));
  };
  unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    const query = event.query;
    if (!isPersistedKey(query.queryKey)) return;
    /* Gom cac lan cap nhat lien tiep (keo the, sua nhanh) — luu sau khi yen. */
    clearTimeout(timers.get(query.queryHash));
    timers.set(
      query.queryHash,
      setTimeout(() => {
        timers.delete(query.queryHash);
        save(query);
      }, SAVE_DELAY_MS)
    );
  });
}

export function stopQueryPersistence(): void {
  unsubscribe?.();
  unsubscribe = null;
}
