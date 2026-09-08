# OnlyOffice online — setup for sharedfilesystem

OnlyOffice **cannot** run on Vercel or Render. You need a **third public URL** for the Document Server (~4 GB RAM).

Your stack:

| Service | URL |
|---------|-----|
| Frontend | `https://sharedfilessystem.vercel.app` |
| API | `https://sharedfilesystem.onrender.com` |
| **OnlyOffice** | `https://YOUR-ONLYOFFICE-URL` ← you create this |

---

## Step 1 — Deploy Document Server

### Option A: Fly.io (easiest cloud)

Requires a Fly account with payment method (~$10–20/month for 4 GB).

```powershell
cd deploy\onlyoffice
.\deploy-fly.ps1
```

Or manually:

```powershell
npm i -g flyctl
fly auth login
cd deploy\onlyoffice
fly launch --no-deploy
fly secrets set JWT_SECRET="your-long-random-secret"
fly deploy
```

Your URL will be like: `https://shared-docs-onlyoffice.fly.dev`

### Option B: VPS (Hetzner / DigitalOcean / Hostinger, ~$6–12/mo)

1. Create a VPS with **4 GB+ RAM**
2. Point a subdomain DNS A record → server IP (e.g. `onlyoffice.yourdomain.com`)
3. Install Docker, copy this folder to the server
4. Create `.env` from `.env.example` (set `ONLYOFFICE_JWT_SECRET` and `OO_HOST`)
5. Run:

```bash
docker compose -f docker-compose.prod.yml up -d
```

Your URL: `https://onlyoffice.yourdomain.com`

---

## Step 2 — Generate one JWT secret

Use the **same** secret everywhere:

```powershell
# PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

---

## Step 3 — Render (API)

Add / update environment variables:

```
ONLYOFFICE_DS_URL=https://YOUR-ONLYOFFICE-URL
ONLYOFFICE_JWT_SECRET=<same secret as Document Server>
ONLYOFFICE_SERVER_URL=https://sharedfilesystem.onrender.com
SERVER_PUBLIC_URL=https://sharedfilesystem.onrender.com
CLIENT_URL=https://sharedfilessystem.vercel.app
STORAGE_TYPE=s3
# ... plus S3/R2 vars so downloads work
```

Redeploy the Render service.

---

## Step 4 — Vercel (frontend)

```
VITE_ONLYOFFICE_DS_URL=https://YOUR-ONLYOFFICE-URL
VITE_API_URL=https://sharedfilesystem.onrender.com/api
VITE_SOCKET_URL=https://sharedfilesystem.onrender.com
```

**Redeploy** Vercel (clear cache). Do not use `localhost:8082` here.

---

## Step 5 — Test

1. Open `https://YOUR-ONLYOFFICE-URL/welcome` — OnlyOffice welcome page
2. Log in to your app, upload a `.docx`, click **Open** → should open OnlyOffice editor
3. If editor is blank, check Render logs and ensure S3 storage is configured

---

## Local dev (optional)

Keep using Docker on your PC:

```powershell
docker run -d --name alamait-onlyoffice -p 8082:80 `
  -e JWT_ENABLED=true -e JWT_SECRET=change-me `
  onlyoffice/documentserver:8.2.2
```

`server/.env`: `ONLYOFFICE_DS_URL=http://localhost:8082`  
`client/.env`: `VITE_ONLYOFFICE_DS_URL=http://localhost:8082`
