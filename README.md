# SkinVault

Full-stack SkinVault project with a Vite client and an Express/SQLite API.

## Setup

Install the dependencies:

```powershell
npm install
npm --prefix client install
npm --prefix server install
```

Create the server configuration from the example:

```powershell
Copy-Item server/.env.example server/.env
```

Edit `server/.env` before starting the app. Set `JWT_SECRET` to a random value of at least 32 characters and `ADMIN_PASSWORD` to a unique password of at least 12 characters. The admin account is created on first startup using `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Without `ADMIN_PASSWORD`, the server starts without creating an admin account.

Generate a secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Start the client and API:

```powershell
npm run dev
```

The SQLite database is created in `server/data/` and is intentionally excluded from Git because it may contain local user data.
