# Managed accounts and sync on Vercel

An administrator creates usernames and passwords. Users sign in once and their favorites, watch progress, and playback/search preferences sync automatically across their devices. Different accounts cannot read each other's cloud records. No email codes, public registration, or sync keys are used.

## Fresh Supabase project from Vercel

1. Install Supabase through Vercel Marketplace, create a project, and connect it to this app. Choose a region near your users. Set **Public Environment Variables Prefix** to `XKA_`; leave **Custom Prefix** empty/default. Check the resulting variable names.
2. Open the connected Supabase dashboard → SQL Editor and run the consolidated schema file **once**:
   - [Consolidated Schema](../supabase/schema.sql) — Initializes all database tables, security policies (RLS), triggers, and stored procedures in one single run.
   After the consolidated schema, also run [202611040001_site_settings.sql](../supabase/migrations/202611040001_site_settings.sql) for the global live-stream flag; it is not yet included in `schema.sql`.
   *(Note: The individual historical migrations under `supabase/migrations/` remain available for automated tests and incremental inspection).*
3. Under Supabase Authentication, keep the email/password provider enabled but **disable Allow new users to sign up**. Keep multiple simultaneous sessions allowed. The application uses internal, automatically confirmed email-shaped identifiers for Supabase Auth; users only enter usernames, and no mailbox or SMTP is needed. The database trigger also rejects accounts not provisioned by the server admin API.
4. Configure the Vercel project variables:

   | Variable                                                      | Value                                          |
   | ------------------------------------------------------------- | ---------------------------------------------- |
   | `XKA_SUPABASE_URL`                                            | Supabase project URL                           |
   | `XKA_SUPABASE_PUBLISHABLE_KEY` **or** `XKA_SUPABASE_ANON_KEY` | Public publishable/legacy anon key             |
   | `SUPABASE_SERVICE_ROLE_KEY` **or** `SUPABASE_SECRET_KEY`      | Supabase server secret/legacy service-role key |
   | `XKA_INITIAL_VIDEO_SOURCES`                                   | Public sources available to every account      |
   | `NSFW_VIDEO_SOURCES`                                          | Private NSFW sources returned by the server    |

   The server secret and `NSFW_VIDEO_SOURCES` must **not** have an `XKA_`, `NEXT_PUBLIC_`, or other public prefix. They are only read by Vercel functions. Never paste them into the app or commit them. `NSFW_VIDEO_SOURCES` uses the same JSON array or remote-JSON URL format as `XKA_INITIAL_VIDEO_SOURCES`. Remove the obsolete `XKA_ACCESS_PASSWORD` variable; choose a new admin password, because the old shared password was part of the browser configuration.

5. Bootstrap the first admin with the script below, then redeploy Vercel.

Missing Supabase configuration shows setup guidance on the login screen; it does not open the site to anonymous users. The admin API is implemented for Vercel. Other hosts need an equivalent server route; `pnpm dev` alone does not run Vercel Functions. Use Vercel's local development environment to exercise account management locally.

## Create the first admin

After running all migrations, create a **local, private** `.env.admin` file (gitignored):

```dotenv
XKA_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_SECRET
ADMIN_USERNAME=admin
ADMIN_PASSWORD="A_NEW_UNIQUE_PASSWORD_AT_LEAST_10_CHARACTERS"
```

Run from the project directory with Node 22.12+:

```sh
node --env-file=.env.admin scripts/create-admin.mjs
```

If bootstrap fails, the script prints Supabase's safe error code/status/message. The most common causes are a wrong project URL or service key, the migrations being run in a different project, an existing admin/user with the same generated identifier, or a password rejected by the project's Auth password policy.

The script makes a one-time remote API call; it does not install a local database or server. It refuses to bootstrap if an admin already exists. Remove the private file after successful setup. Never put `ADMIN_PASSWORD` in a public environment variable. Operator-level recovery of the admin account can be done through Supabase's Admin API using the server secret; ordinary users cannot reset an admin account through the app.

## Admin and user flow

All signed-in accounts can open **My account (我的账号)** from the top-right account menu or sidebar. This page shows sync status and the last sync time, supports manual sync and importing the device's original collection, and provides logout for the current device. All accounts can also access **Playback settings (播放设置)**; ordinary users have a direct sidebar entry and see only the playback tab. Other settings pages remain administrator-only, including when accessed by URL.

The same page lets users change their own password by entering the current password and confirming a new password of 10–128 characters. The Vercel `/api/account-password` function verifies the live account and current password using a temporary Supabase session, updates only that user's password, and disposes the temporary session. No new database migration or environment variable is required for this page.

1. Sign in with the admin username and password.
2. Open **Account menu → Admin center (管理员中心)**. This independent page is available only to administrators. The account list supports username search, enabled/disabled and NSFW permission filters, and database pagination with 20 accounts per page. Open an account to load its last login, paginated device records and management actions. The list does not fetch device details or the Auth user directory. Returning from details restores the list page and filters. Audit records have their own paginated view. This UI/API update requires no additional SQL migration.
3. Create user `a` and a password of at least 10 characters. Usernames are case-insensitive, 1–32 characters, using letters, numbers, `_` or `-`, starting with a letter/number. Select **Allow NSFW** only for accounts that should receive the private source list.
4. User `a` signs in on a phone and laptop. Both use the same account data automatically. User `b` gets a separate collection. Admins manage account metadata; their app session does not receive another user's favorites or history.
5. Search users and review their last login and recently active browser/device sessions. Activity updates while an authenticated app is open.
6. Enable or disable a user's NSFW access. The change invalidates existing sessions, so the user must sign in again; the app then adds or removes the server-issued NSFW sources locally.
7. Reset a user's password, force logout on every device, disable the account, or permanently delete the account and its synced data. Destructive actions require confirmation. Database authorization immediately blocks old sessions. Password reset requires fresh login on all devices; re-enabling an account does not restore its old sessions. Open apps check account status every 30 seconds and on focus/reconnect.
8. Review the recent administrator audit log. It records successful account creation, NSFW permission changes, status changes, password resets, forced logouts and deletions without storing passwords.

There is no automatic import of old device data when signing in. If desired, the user can choose **Import this device's original favorites and history (导入此设备原有收藏与历史)**. Existing cloud records, including deletions, win over these imports. Verify that this is the user's own collection before importing on a shared device.

## Sync behavior and limits

If the playback migration previously failed at `position double precision default null`, run the entire corrected `supabase/migrations/202610030001_playback_lease.sql` again in the Supabase SQL Editor. It preserves existing table data and can be rerun after a partial attempt. Then redeploy the frontend and refresh open tabs: the corrected RPC uses `p_` parameter names, which must match the frontend.

- Apply `202610290002_private_playback_lease.sql` before deploying private mode so live mode changes update the server lease.

- Multiple devices stay signed in, but one player per account holds a server-issued playback lease. Starting playback on another device displays the current device and video and asks for confirmation. Cancelling leaves the existing player alone. Confirmation transfers ownership; the previous player pauses on its next heartbeat (normally within 5 seconds).
- For the same episode, takeover resumes at the last position reported by the previous player (normally within 5 seconds of its current position). Different videos/episodes keep their own history. Separate browser tabs also count as separate players.
- A lease is renewed every 5 seconds while playing and expires after 30 seconds without renewal. Closing a player attempts to release it immediately. Paused players stop renewing after a final checkpoint. During a prolonged network failure the app pauses before its last confirmed lease expires; starting playback requires a working connection.
- Progress carries a playback lease ID. Database triggers reject progress from replaced players; delayed/offline uploads cannot overwrite the current player's progress. Favorites, preferences and history deletion remain available across devices. Apply the playback migration before deploying this frontend, and refresh old open tabs after deployment. This coordinates app playback; it cannot revoke downloaded media or copied third-party stream URLs.

- Local changes appear immediately. Uploads run within about 10 seconds during use, with a pull every 30 seconds while visible and sync on focus, reconnect, visibility change and video pause. Failed uploads remain queued locally.
- Different items merge independently. Changes to the same item normally use the newest edit timestamp, with deterministic tie-breaking. Keep device clocks accurate. A new playback owner takes precedence over the previous owner's progress. Ordinary background sync does not seek an already-playing video.
- Deletions retain tombstones so older devices cannot resurrect removed items. Local history limits can produce deletions that sync to the account.
- Sources, subscriptions, API tokens, network settings, search-history text and caches are not synced. Import/export source configuration separately; CMS playback needs matching sources on each device.
- Signing out affects only the current device. It restores the previous guest snapshot locally, while the login screen blocks access. Account caches/queued edits remain on that browser, keyed by account ID. Clear site data to remove those copies, after uploading pending changes. This is not encrypted local storage.
- An already verified, open app can continue locally during an outage. Fresh login or browser reload needs an online account check. Disabling an account blocks cloud access, not copies already downloaded to a device.
- The static frontend and existing media proxy are not made private by this change. Server-side checks protect account management and per-user cloud data.

## Cross-device series reminders

Apply `supabase/migrations/202610190001_series_notifications.sql` in the Supabase SQL Editor after the existing managed-account migrations, then deploy the frontend and refresh your open devices. The migration is rerunnable and keeps favorites, history and existing settings intact. It creates a separate `series_notifications` table and an authenticated `sync_series_notifications` RPC; no Vercel environment variables, scheduling, service-role credentials or push subscriptions are added.

Reminders use the existing account session. The settings page shows a separate reminder-sync status and a migration hint if the RPC is not installed. **Sync now** also flushes reminder receipts. Missing migrations or network failures keep reminders working locally and retain pending changes for retry.

- Sync stores observed episode numbers and explicit read receipts. The database atomically unions both sets, so a stale/offline device cannot resurrect a read reminder or clear a newly arrived episode. Source details, playlists, playback URLs, tokens and proxy settings remain local.
- The first uploaded resource creates its baseline from that device's existing reminder state, preserving its existing unread episodes. Subsequent devices inherit that cloud baseline, even when their first local check sees more episodes. Refresh older frontend tabs so they participate in receipt sync too.
- Each account, favorite season, binding and source configuration fingerprint has its own reminder history. Matching source IDs and endpoint configuration are required to share a resource's reminder state. Changing resources creates a separate baseline; returning to the same resource reuses its receipts. Disabling/deleting a favorite does not erase its old read receipts, preventing another device from reviving them.
- Local reads apply immediately and upload within about 10 seconds while the app is running. Visible pages pull every 30 seconds and sync on focus/reconnect. Local pending receipts survive reload and account changes. Signing into another account never uploads the previous account's receipts.
- If cloud reminders reveal episodes missing from this device's cached list, the app schedules one check for that resource through the existing two-worker queue. Episode/playback results still come from the local source configuration. Reminder receipt sync does not perform checks or send notifications while the site is closed.
- Cross-tab local caches merge observed/read/confirmed sets before writing. Cloud-confirmed sets acknowledge only content the server has seen, preserving reads or episodes added during an in-flight upload.
- CMS numeric video IDs are normalized to strings. Older reminder caches are repaired on read/write, including composite resource keys, while retaining episode observations and read receipts. When a key changes, receipts are re-uploaded under the normalized identity; invalid rows are skipped individually. This frontend fix needs no additional SQL migration or clearing of favorites/history.

Verify with two devices on one account: establish a baseline, let device A discover new episodes, sync both, then mark only the displayed episodes read on B. A should clear those reminders while retaining the same pending-watch count. Add another episode while B is offline; reconnect B and confirm the new episode remains unread. A different account must not see either device's reminder rows.

Automated tests run the migration against a local PostgreSQL engine (PGlite), including privileges/RLS, first-device baselines, interleaved observations/read receipts, invalid payloads and rollback. Live behavior still requires applying the migration to your configured Supabase project.

## Site announcement

Before deploying the login-first maintenance flow, run [202610250001_public_maintenance_status.sql](../supabase/migrations/202610250001_public_maintenance_status.sql) after the scheduled-maintenance and optional-body migrations. It adds a separate anonymous-readable RPC containing only server time and a published maintenance window's public explanation and times. Drafts, expired windows, account data and other announcement metadata remain private. Existing authenticated maintenance checks and database access restrictions remain enforced. No new environment variables are required.

Visitors now see the maintenance check before the ordinary login form. Active maintenance replaces the login page; the page returns to login automatically at the known server-calibrated end time. The lock icon above the login form and the logo in the maintenance card header are accessible **Management entry (管理入口)** links to `/admin/login`; these pages have no additional footer. The entry remains reachable even during maintenance or if the public check fails. The server-verified account must have the admin role to enter the management center; ordinary accounts cannot use that entry to bypass maintenance. On the administrator login page, the lock icon links **Back to site (返回主站)**. Existing ordinary sessions need not be signed out merely to open the administrator login page.

The editor's **Preview announcement (预览公告)** button displays the current unsaved title, body, type and metadata using the same dialog as published announcements. Preview does not save, publish or mark anything read; closing it returns to the existing draft. A title and body are enough to preview, even before maintenance times are filled in.

During maintenance, ordinary users see an estimated recovery countdown in `HH:MM:SS`, including days for longer windows. It updates every second using the existing server-calibrated monotonic clock, follows updated end times on the next status check, and disappears when access resumes automatically. These display changes need no additional migration or configuration.

Apply [202610200001_site_announcement.sql](../supabase/migrations/202610200001_site_announcement.sql), [202610200002_announcement_types.sql](../supabase/migrations/202610200002_announcement_types.sql), [202610200003_scheduled_maintenance.sql](../supabase/migrations/202610200003_scheduled_maintenance.sql), then [202610220001_optional_announcement_content.sql](../supabase/migrations/202610220001_optional_announcement_content.sql) in the Supabase SQL Editor after the existing account, admin dashboard, NSFW and playback migrations, then deploy the frontend. Run only migrations that are not already installed. The upgrades are rerunnable and preserve the current announcement and revision. No new environment variables, cron jobs or Vercel API routes are needed. Apply the maintenance migration before the new frontend: ordinary users stay on the status/retry screen if the maintenance status RPC is unavailable; administrators can still sign in and access the app.

- **Admin center → Site announcement (站内公告)** manages one current announcement: title (up to 100 characters), optional plain-text body (up to 10,000 characters, with line breaks), draft saving, publishing/updating and unpublishing. Editing a published announcement leaves its current content live until **Publish update**. **Unpublish** removes the saved announcement without publishing unsaved form edits. Saving changes increments its version; an outdated editor must reload before overwriting a newer version.
- The editor offers **Ordinary notice**, **Maintenance**, and **Version update**. Maintenance uses the fixed title **系统维护** and hides the title field. All types allow an empty body; ordinary notices and version updates still require a title to publish. Apply the optional-body migration before deploying this frontend; otherwise the older database rejects empty bodies. The maintenance page groups the countdown and times above an optional, independently scrolling description; long unbroken text wraps, and dialog headings/actions remain outside the scrolling content. Publishing a maintenance notice requires both times, with end strictly after start; incomplete drafts can still be saved. Times are entered in the admin device's local timezone and stored as absolute timestamps; recipients see their own local time. A published maintenance notice blocks ordinary users during **start ≤ server time < end** and restores access afterward. Saving a draft does not activate maintenance. Unpublishing or replacing it with another type ends maintenance early. The announcement itself remains published after the window ends until an admin edits/unpublishes it. Version updates support an optional version label (up to 40 characters). Switching types clears unrelated metadata on save. Older clients can still save ordinary notices using the original four-argument RPC; refresh older admin pages to use the new fields. Existing maintenance notices lacking either time remain informational until edited with a complete window.
- A new published revision automatically opens a dialog on any authenticated page. **I understand (我知道了)**, the close button, Escape or clicking the backdrop dismisses it. Dismissal is remembered per account in this browser and shared between local tabs; it does not sync across devices. A compact **View site announcement** icon remains in the top navigation for reopening. A newly published revision appears again.
- On playback routes, announcement dialogs are deferred; leaving playback shows the latest unread announcement. Temporarily hiding an open dialog for playback does not mark it read. This only applies to dialogs: an active maintenance window still replaces the ordinary user's player with the maintenance page. The built-in release-history dialog also defers the site announcement until closed so the two notifications do not overlap.
- While the authenticated site is open, it checks every minute while visible, and on focus, reconnect and becoming visible. Reloading fetches immediately. Publishing or unpublishing reaches other open pages on their next successful check. If loading fails, the dialog and entry hide and retry on the next check; the rest of the site remains available.
- Database authorization allows active users to read only published content; active admins can read drafts and use the save RPC. Anonymous, disabled and invalidated sessions cannot access announcements. Direct client table writes are denied, including for admins. Missing migration guidance appears in the admin section.

- Maintenance exempts administrators, including login, playback, account management and unpublishing maintenance. Ordinary users keep their login session and see a maintenance page in place of all application routes; the player is unmounted when maintenance begins. The maintenance card's logo links to the separate administrator login entry; signed-in users also retain a logout button. Dismissing the earlier announcement does not bypass the maintenance page.
- The access guard checks authenticated server maintenance status on entry, every 15 seconds while visible, and on focus/reconnect. A monotonic clock based on the server response schedules known start/end transitions without relying on the device's wall clock. Admin edits and early unpublishing are picked up at the next successful check. Failed checks block ordinary-user entry until a successful retry; local collections and queued changes remain saved.
- Database access is enforced immediately per request using server time: existing sync RLS, episode-receipt RPCs and playback lease authorization call the maintenance-aware `account_is_active()`. `current_account()` and device activity use a separate valid-session check so maintenance never signs users out. The authenticated maintenance-status RPC remains available; disabled/invalidated sessions and anonymous callers are denied. The private-source and password APIs return 503 for ordinary users during maintenance; administrators bypass this check.
- This restricts application access and account-backed operations. Static assets, the existing unauthenticated media proxy, third-party source endpoints and media already obtained outside the app are not made private or revoked by maintenance.

Verify with an admin and ordinary user: save a draft (user sees nothing), publish an ordinary notice, close/reopen its dialog, publish an update, then unpublish. Ordinary/version-update dialogs defer during playback. Publish a maintenance notice with a near-future window and check that the ordinary user enters the maintenance page at start, playback stops, and access returns at end without another login. Confirm that the admin remains able to use the app and can unpublish early. Check maintenance times on devices in different timezones and with an inaccurate device clock. Open two admin pages and confirm that saving from the stale page cannot overwrite the new version. Refresh older frontend tabs after deployment so they receive the new access guard.

## Upgrading the earlier email-code prototype

Keep the first two migrations if they are already applied; run the third provisioning-fix migration too. Existing email-only users are not automatically promoted or converted, and their cloud rows are not deleted. Create the managed admin/users above and explicitly import local favorites/history as needed. Email templates and SMTP setup are no longer required by this app.

## Verify after deployment

Older favorites with numeric video IDs in their tracking bindings are normalized to string IDs when reading cloud records or local sync caches. Missing/null TMDB display metadata receives empty defaults; notes, tags, tracking progress, record clocks and pending offline edits are retained. New tracking bindings and TMDB snapshots use the canonical format from the start. This frontend compatibility fix does not require SQL changes or clearing account data. If a record is still incompatible, the sync error identifies the record and affected field paths without printing its values; the record is not silently deleted or overwritten. Deploy the updated frontend and use **Sync now (立即同步)** to retry.

The build runs `pnpm check:api-types` to check API routes with Vercel-style dependency resolution. Keep the `@supabase/*` public-hoist rule in `.npmrc`: Vercel's TypeScript language-service host needs these transitive declarations at public package paths under pnpm. If a cached deployment reports missing `SupabaseAuthClient` methods (`admin`, `signInWithPassword`, `updateUser`, or `signOut`), redeploy the updated code without the existing build cache so the corrected dependency layout is installed. No database migration is needed for this build fix.

1. Create `a` and `b`; sign into `a` on two devices and `b` in a separate browser profile.
2. Add a favorite and pause a video as `a`. Sync both devices; confirm both changes appear for `a` and neither appears for `b`.
3. Delete a favorite, then reconnect a previously offline device. Confirm the deletion stays deleted.
4. Make an offline edit while the app remains open, reconnect and confirm it uploads.
5. Reset `a`'s password; confirm old sessions cannot sync and the new password works on both devices.
6. Disable `a`; confirm cloud access is blocked. Re-enable it and confirm fresh login is required.
7. Force logout `a`; confirm both devices return to the login screen. Confirm the action appears in the audit log.
8. As `b`, call `/api/accounts` with its token and confirm HTTP 403. Direct reads of `a`'s sync rows must also be denied by RLS.

Automated tests exercise authorization failures, admin operations, account transitions, offline queues and merge conflicts. Live Supabase policy enforcement and the two-device flow still need verification with your configured project.

References: [Supabase admin user creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [sessions](https://supabase.com/docs/guides/auth/sessions), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Global live-stream setting

For an existing installation, run [202611040001_site_settings.sql](../supabase/migrations/202611040001_site_settings.sql) after the existing account migrations. Fresh installations also need this step after `schema.sql`. Then deploy the frontend and refresh open tabs.

The migration creates `site_settings`, read/write RPCs, and RLS policies. Visitors and users can read flags; only active administrators can write them. It adds the table to `supabase_realtime` when that publication exists and sets `REPLICA IDENTITY FULL`. The script can be rerun without overwriting saved values. On a database without that publication, the publication step is skipped; cross-device change delivery requires Supabase Realtime to be configured.

No default `is_live_enabled` row is inserted. Until an administrator saves a value, a missing database value leaves the client's persisted or initial environment setting unchanged. Once saved, the database flag takes precedence; changing an environment variable does not overwrite it. Failed remote saves do not change local state or broadcast a successful update.

Administrators can toggle the flag on the live page, source settings, or system settings. Other users lose the navigation entry and see a closed message when visiting `/live`; administrators retain preview access. This controls the app UI, not third-party stream URLs already known to a user. Subscription lists and channel caches remain local; this migration synchronizes the global flag only.

If using an external live Worker, redeploy its latest script along with the app for native HLS support. See [Worker deployment](../workers/live-stream-proxy/README.md).

## TV casting

Apply [202611050001_tv_cast.sql](../supabase/migrations/202611050001_tv_cast.sql) after the managed-account migrations (also required after the consolidated schema for new projects). See [TV casting](tv-casting.md) for pairing, temporary credentials, consent, expiry and polling behavior. No public Realtime channel is used.
