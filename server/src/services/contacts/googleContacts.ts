import type { Database } from 'better-sqlite3';
import { HttpError } from '../../lib/validate.ts';
import { decryptSecret, encryptSecret } from '../ai/secretStore.ts';
import { driveClientOf } from '../backup/driveBackup.ts';
import { googleClientOf } from '../email/emailService.ts';
import {
  forgetGoogleAccessToken,
  googleAccessToken,
  revokeGoogleToken,
  type GoogleClient,
} from '../email/googleMail.ts';
import type { ParsedContact } from './contactFile.ts';
import {
  importGoogle,
  pruneGoogleContactsNotIn,
  removeGoogleContacts,
} from './personalContacts.ts';

/*
 * Dong bo danh ba Google -> danh ba ca nhan, MOT CHIEU, theo tung nhan vien.
 *
 * Quyen `contacts.readonly`: CRM chi DOC danh ba, khong sua, khong xoa, khong ghi
 * nguoc len Google. Refresh token luu ma hoa theo tung nguoi (bang
 * google_contact_accounts); Client ID/Secret dung chung voi muc Email (hoac Sao
 * luu Drive neu Email chua khai bao) nen khong them o cau hinh nao.
 *
 * Lan dau keo toan bo va xin `syncToken`; cac lan sau chi keo phan thay doi. Khi
 * Google bao token het han (EXPIRED_SYNC_TOKEN) thi lam lai tu dau va don nhung
 * lien he Google khong con xuat hien.
 */

export const CONTACTS_READONLY_SCOPE = 'https://www.googleapis.com/auth/contacts.readonly';
export const CONTACTS_SCOPES = ['openid', 'email', CONTACTS_READONLY_SCOPE];

const CONNECTIONS_URL = 'https://people.googleapis.com/v1/people/me/connections';
const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,biographies';
const PAGE_SIZE = 1000;
/** Chan vong lap vo han neu Google tra nextPageToken mai. 1000 x 50 = 50.000 lien he. */
const MAX_PAGES = 50;

export function contactsClientOf(db: Database): GoogleClient | null {
  return googleClientOf(db) ?? driveClientOf(db);
}

/* ---------- Tai khoan da ket noi ---------- */

interface AccountRow {
  user_id: number;
  google_account: string;
  refresh_token_ciphertext: string;
  refresh_token_iv: string;
  refresh_token_tag: string;
  sync_token: string | null;
  auto_sync: number;
  connected_at: string;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_imported: number | null;
  last_updated: number | null;
  last_removed: number | null;
}

export interface GoogleContactsStatus {
  client_configured: boolean;
  connected: boolean;
  google_account: string;
  auto_sync: boolean;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_imported: number | null;
  last_updated: number | null;
  last_removed: number | null;
  syncing: boolean;
}

function accountRow(db: Database, userId: number): AccountRow | undefined {
  return db.prepare(`SELECT * FROM google_contact_accounts WHERE user_id = ?`).get(userId) as
    AccountRow | undefined;
}

function refreshTokenOf(row: AccountRow): string {
  return decryptSecret({
    ciphertext: row.refresh_token_ciphertext,
    iv: row.refresh_token_iv,
    tag: row.refresh_token_tag,
  });
}

const running = new Set<number>();

export function googleContactsStatus(db: Database, userId: number): GoogleContactsStatus {
  const row = accountRow(db, userId);
  return {
    client_configured: contactsClientOf(db) !== null,
    connected: Boolean(row),
    google_account: row?.google_account ?? '',
    auto_sync: row ? Boolean(row.auto_sync) : true,
    last_sync_at: row?.last_sync_at ?? null,
    last_success_at: row?.last_success_at ?? null,
    last_error: row?.last_error ?? null,
    last_imported: row?.last_imported ?? null,
    last_updated: row?.last_updated ?? null,
    last_removed: row?.last_removed ?? null,
    syncing: running.has(userId),
  };
}

export function saveContactsConnection(
  db: Database,
  userId: number,
  connection: { refreshToken: string; account: string }
): void {
  const token = encryptSecret(connection.refreshToken);
  const previous = accountRow(db, userId);
  /* Ket noi lai bang TAI KHOAN KHAC: syncToken cu thuoc ve danh ba khac, va cac
     lien he Google cu khong con la cua tai khoan nay — bo ca hai. */
  const sameAccount = previous?.google_account === connection.account;
  db.prepare(
    `INSERT INTO google_contact_accounts
       (user_id, google_account, refresh_token_ciphertext, refresh_token_iv, refresh_token_tag)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       google_account = excluded.google_account,
       refresh_token_ciphertext = excluded.refresh_token_ciphertext,
       refresh_token_iv = excluded.refresh_token_iv,
       refresh_token_tag = excluded.refresh_token_tag,
       sync_token = CASE WHEN ? THEN sync_token ELSE NULL END,
       last_error = NULL`
  ).run(userId, connection.account, token.ciphertext, token.iv, token.tag, sameAccount ? 1 : 0);
  if (previous && !sameAccount) {
    db.prepare(
      `DELETE FROM personal_contacts WHERE user_id = ? AND google_resource_name IS NOT NULL`
    ).run(userId);
  }
  if (previous) forgetGoogleAccessToken(refreshTokenOf(previous));
}

export function setContactsAutoSync(db: Database, userId: number, enabled: boolean): void {
  db.prepare(`UPDATE google_contact_accounts SET auto_sync = ? WHERE user_id = ?`).run(
    enabled ? 1 : 0,
    userId
  );
}

/** Ngat ket noi: thu hoi token; `removeContacts` xoa luon cac lien he da keo ve tu Google. */
export async function disconnectGoogleContacts(
  db: Database,
  userId: number,
  removeContacts: boolean
): Promise<void> {
  const row = accountRow(db, userId);
  if (!row) return;
  const token = refreshTokenOf(row);
  db.transaction(() => {
    db.prepare(`DELETE FROM google_contact_accounts WHERE user_id = ?`).run(userId);
    if (removeContacts) {
      db.prepare(
        `DELETE FROM personal_contacts WHERE user_id = ? AND source = 'google' AND linked_contact_id IS NULL`
      ).run(userId);
    }
    /* Giu lai lien he da dua vao CRM nhung bo nhan Google de khong bi dong bo don mat. */
    db.prepare(
      `UPDATE personal_contacts SET google_resource_name = NULL, google_etag = NULL
        WHERE user_id = ? AND google_resource_name IS NOT NULL`
    ).run(userId);
  })();
  forgetGoogleAccessToken(token);
  if (token) await revokeGoogleToken(token);
}

/* ---------- People API ---------- */

interface Person {
  resourceName?: string;
  etag?: string;
  metadata?: { deleted?: boolean };
  names?: { displayName?: string; givenName?: string; familyName?: string }[];
  emailAddresses?: { value?: string }[];
  phoneNumbers?: { value?: string; canonicalForm?: string }[];
  organizations?: { name?: string; title?: string }[];
  biographies?: { value?: string }[];
}

interface ConnectionsPage {
  connections?: Person[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

class ExpiredSyncToken extends Error {}

async function fetchPage(
  accessToken: string,
  params: Record<string, string>
): Promise<ConnectionsPage> {
  let response: Response;
  try {
    response = await fetch(`${CONNECTIONS_URL}?${new URLSearchParams(params)}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    throw new HttpError(
      502,
      `Không kết nối được tới Google: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (response.ok) return (await response.json()) as ConnectionsPage;

  const data = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string; details?: { reason?: string }[] };
  };
  const detail = data.error?.message ?? `HTTP ${response.status}`;
  if (
    response.status === 400 &&
    (data.error?.details?.some((d) => d.reason === 'EXPIRED_SYNC_TOKEN') ||
      /sync token/i.test(detail))
  ) {
    throw new ExpiredSyncToken();
  }
  if (response.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(detail)) {
    throw new HttpError(
      502,
      `People API chưa được bật trong Google Cloud project — bật "People API" rồi thử lại. (${detail})`
    );
  }
  if (response.status === 403 || response.status === 401) {
    throw new HttpError(
      502,
      `Google không cho đọc danh bạ — hãy kết nối lại và giữ dấu tick quyền xem danh bạ. (${detail})`
    );
  }
  throw new HttpError(502, `Google từ chối đọc danh bạ: ${detail}`);
}

function toParsed(
  person: Person
): (ParsedContact & { resource_name: string; etag?: string }) | null {
  if (!person.resourceName) return null;
  const org = person.organizations?.[0];
  const emails = (person.emailAddresses ?? []).map((e) => e.value ?? '').filter(Boolean);
  const phones = (person.phoneNumbers ?? [])
    .map((p) => p.canonicalForm || p.value || '')
    .filter(Boolean);
  const name = person.names?.[0];
  const display =
    name?.displayName?.trim() ||
    [name?.givenName, name?.familyName].filter(Boolean).join(' ').trim() ||
    org?.name?.trim() ||
    emails[0] ||
    phones[0];
  if (!display) return null;
  return {
    resource_name: person.resourceName,
    etag: person.etag,
    full_name: display,
    org_name: org?.name?.trim() || null,
    title: org?.title?.trim() || null,
    phones,
    emails,
    notes: person.biographies?.[0]?.value?.trim() ?? '',
  };
}

export interface SyncResult {
  imported: number;
  updated: number;
  removed: number;
  full: boolean;
}

async function pullAll(
  accessToken: string,
  syncToken: string | null
): Promise<{ people: Person[]; nextSyncToken: string | null }> {
  const people: Person[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params: Record<string, string> = {
      personFields: PERSON_FIELDS,
      pageSize: String(PAGE_SIZE),
      requestSyncToken: 'true',
    };
    if (syncToken) params.syncToken = syncToken;
    if (pageToken) params.pageToken = pageToken;
    const data = await fetchPage(accessToken, params);
    people.push(...(data.connections ?? []));
    nextSyncToken = data.nextSyncToken ?? nextSyncToken;
    pageToken = data.nextPageToken;
    if (!pageToken) return { people, nextSyncToken };
  }
  throw new HttpError(502, 'Danh bạ Google quá lớn để đồng bộ một lần (trên 50.000 liên hệ).');
}

/** Ket qua cua mot lan chay, ghi vao google_contact_accounts de man hinh hien thi. */
function record(db: Database, userId: number, update: Partial<Record<string, unknown>>): void {
  const columns = Object.keys(update);
  db.prepare(
    `UPDATE google_contact_accounts SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE user_id = ?`
  ).run(...columns.map((c) => update[c]), userId);
}

function localNow(db: Database): string {
  return (db.prepare(`SELECT datetime('now','localtime') AS now`).get() as { now: string }).now;
}

export async function syncGoogleContacts(db: Database, userId: number): Promise<SyncResult> {
  const account = accountRow(db, userId);
  if (!account) throw new HttpError(400, 'Chưa kết nối Gmail để đồng bộ danh bạ');
  const client = contactsClientOf(db);
  if (!client) {
    throw new HttpError(400, 'Quản trị viên chưa khai báo Google Client ID/Secret (mục Email).');
  }
  if (running.has(userId)) throw new HttpError(409, 'Đang đồng bộ danh bạ — chờ lần này xong.');

  running.add(userId);
  db.prepare(
    `UPDATE google_contact_accounts SET last_sync_at = datetime('now','localtime') WHERE user_id = ?`
  ).run(userId);
  try {
    const accessToken = await googleAccessToken(client, refreshTokenOf(account));

    let full = account.sync_token === null;
    let pulled: Awaited<ReturnType<typeof pullAll>>;
    try {
      pulled = await pullAll(accessToken, account.sync_token);
    } catch (error) {
      if (!(error instanceof ExpiredSyncToken)) throw error;
      full = true;
      pulled = await pullAll(accessToken, null);
    }

    const deleted: string[] = [];
    const live: (ParsedContact & { resource_name: string; etag?: string })[] = [];
    for (const person of pulled.people) {
      if (person.metadata?.deleted && person.resourceName) deleted.push(person.resourceName);
      else {
        const parsed = toParsed(person);
        if (parsed) live.push(parsed);
      }
    }

    const imported = importGoogle(db, userId, live);
    let removed = removeGoogleContacts(db, userId, deleted);
    /* Lan day du la cai nhin DAY DU danh ba — dong nao khong co mat nua la da bi xoa. */
    if (full)
      removed += pruneGoogleContactsNotIn(db, userId, new Set(live.map((p) => p.resource_name)));

    record(db, userId, {
      sync_token: pulled.nextSyncToken ?? account.sync_token,
      last_success_at: localNow(db),
      last_error: null,
      last_imported: imported.created,
      last_updated: imported.updated,
      last_removed: removed,
    });
    return { imported: imported.created, updated: imported.updated, removed, full };
  } catch (error) {
    record(db, userId, {
      last_error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
    });
    throw error;
  } finally {
    running.delete(userId);
  }
}

/* ---------- Lich tu dong ---------- */

const AUTO_SYNC_AFTER_HOURS = 24;

/** Dong bo nhung tai khoan bat tu dong ma lan chay gan nhat da qua 24 gio. */
export async function runDueContactSyncs(db: Database): Promise<number> {
  const due = db
    .prepare(
      `SELECT user_id FROM google_contact_accounts
        WHERE auto_sync = 1
          AND (last_sync_at IS NULL
               OR last_sync_at <= datetime('now','localtime', ?))`
    )
    .all(`-${AUTO_SYNC_AFTER_HOURS} hours`) as { user_id: number }[];
  let done = 0;
  for (const { user_id } of due) {
    try {
      await syncGoogleContacts(db, user_id);
      done += 1;
    } catch (error) {
      console.error(`[google-contacts] Dong bo dinh ky that bai (user ${user_id}):`, error);
    }
  }
  return done;
}

let scheduler: ReturnType<typeof setInterval> | null = null;

export function startGoogleContactsScheduler(db: Database) {
  if (scheduler) return scheduler;
  const tick = () => {
    runDueContactSyncs(db).catch((error) =>
      console.error('[google-contacts] Quet lich loi:', error)
    );
  };
  scheduler = setInterval(tick, 30 * 60_000);
  scheduler.unref();
  setTimeout(tick, 60_000).unref();
  return scheduler;
}
