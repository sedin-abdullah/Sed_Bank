# Demo credentials

Five accounts are provisioned automatically — one per role. Business data is
never seeded, so every list and dashboard starts genuinely empty.

| Role | Email | Password | Lands on |
|---|---|---|---|
| Admin | `admin@sedbank.test` | `Admin@12345` | `/admin` |
| Credit officer | `credit@sedbank.test` | `Staff@12345` | `/admin` |
| Ops officer | `ops@sedbank.test` | `Staff@12345` | `/admin` |
| Collections officer | `collections@sedbank.test` | `Staff@12345` | `/admin` |
| Customer | `customer@sedbank.test` | `Customer@12345` | `/app` |

On the sign-in screen the demo buttons **fill the form** — you still press
**Sign in**. Set `VITE_SHOW_DEMO_LOGINS=false` to hide them.

## What each role can do

- **Admin** — everything. Partner banks, users and roles, product and credit
  policy, the audit trail.
- **Credit officer** — the underwriting queue. Approve, reject or send an
  application back for more information.
- **Ops officer** — verify uploaded documents, then disburse. A loan cannot be
  paid out until every document is verified.
- **Collections officer** — the overdue worklist, ageing buckets, bulk
  reminders and follow-up notes.
- **Customer** — the borrower journey end to end: apply, KYC, documents, credit
  check, offer, e-sign, repay, foreclose.

## Where the passwords come from

The seeder reads these, falling back to the values above:

```
SEED_ADMIN_EMAIL       SEED_ADMIN_PASSWORD
SEED_CUSTOMER_EMAIL    SEED_CUSTOMER_PASSWORD
                       SEED_STAFF_PASSWORD
```

Seeding runs automatically when the database is ephemeral. **Against a real
`MONGO_URI` it is skipped**, so a fresh cluster has no accounts at all and
nobody can sign in — set `SEED_ON_BOOT=true` for the first deploy. It is
idempotent, so leaving it on is harmless.

Changing a `SEED_*_PASSWORD` after an account exists does **not** rewrite it.
Reset it from **Admin → Users & roles** instead.

## Staff you create yourself

Adding a user through **Admin → Users & roles** generates a temporary password
and shows it **exactly once**. Copy it then — it is hashed immediately and
cannot be recovered.

## Security

These credentials are public: they are in `backend/.env.example`, printed on
the sign-in screen, and in this repository. Anyone who finds a deployed URL has
full admin access.

That is deliberate for a demo. Before putting anything real behind it:

- set strong `SEED_*_PASSWORD` values, or delete the demo accounts
- set `VITE_SHOW_DEMO_LOGINS=false`
- set `EXPOSE_OTP=false` — it currently returns the mocked OTP to any caller
- keep `ENABLE_TEST_HOOKS=false`
- confirm `JWT_SECRET` is a generated value (the app refuses to boot in
  production with the bundled dev default)
