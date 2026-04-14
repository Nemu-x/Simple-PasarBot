# Admin Web

Available at `/admin/` behind Nginx.

Current features:

- Secure admin sessions with:
  - server-side session store
  - signed session cookie
  - TTL refresh
  - IP/User-Agent fingerprint binding
  - login rate limit
- Login via `ADMIN_WEB_USER` + `ADMIN_WEB_PASSWORD_HASH` (recommended) or fallback `ADMIN_WEB_PASSWORD`
- PasarGuard connect form (panel URL, credentials, optional direct API key)
- Dashboard counters
- Plans management (create/update/delete)
- Instructions management (RU/EN + platform)
- Users list
- Subscription list view
