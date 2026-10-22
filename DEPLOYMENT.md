# Local + production setup (without OnlyOffice)

The app works **fully** with built-in editors — OnlyOffice is optional.

| File type | Editor | Works local + Vercel? |
|-----------|--------|------------------------|
| `.docx` | Collab editor (`/collab/...`) | Yes |
| `.xlsx` | Spreadsheet editor (`/xlsx-editor/...`) | Yes |
| Word/Excel/PPT | OnlyOffice (`/editor/...`) | Needs separate 4GB server |

---

## Local development

### 1. Install dependencies

```powershell
cd client
npm install --legacy-peer-deps --strict-ssl=false

cd ..\server
npm install --strict-ssl=false
```

### 2. Environment files

Copy examples (already done if you have `server/.env` and `client/.env`):

- **server/.env** — `STORAGE_TYPE=local`, `REDIS_URL=memory`, MongoDB URI
- **client/.env** — `VITE_API_URL=http://localhost:5000/api` — **do not** set `VITE_ONLYOFFICE_DS_URL` unless Docker OnlyOffice is healthy

### 3. Run (two terminals)

```powershell
# Terminal 1 — API
cd server
npm run dev

# Terminal 2 — Frontend
cd client
npm run dev
```

Open **http://localhost:5173** → upload a file → **Open** uses collab/xlsx editors.

**Re-upload files** after switching to `STORAGE_TYPE=local` (old files may only exist in S3).

---

## Production (Vercel + Render)

### Vercel (frontend)

| Variable | Value |
|----------|--------|
| `VITE_API_URL` | `https://sharedfilesystem.onrender.com/api` |
| `VITE_SOCKET_URL` | `https://sharedfilesystem.onrender.com` |

Do **not** set `VITE_ONLYOFFICE_DS_URL` until OnlyOffice is deployed.

### Render (API)

| Variable | Value |
|----------|--------|
| `MONGODB_URI` | your Atlas connection string |
| `JWT_SECRET` | strong random string |
| `REDIS_URL` | Redis add-on URL or `memory` |
| `STORAGE_TYPE` | `s3` or `r2` |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | your object storage |
| `CLIENT_URL` | `https://sharedfilessystem.vercel.app` |
| `SERVER_PUBLIC_URL` | `https://sharedfilesystem.onrender.com` |

**Do not** set `ONLYOFFICE_DS_URL` to localhost on Render.

### Storage (required for production)

Render disk is ephemeral — use **Cloudflare R2** (free tier) or **AWS S3** with correct IAM:

- `s3:ListBucket`, `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on your bucket

After configuring storage, **re-upload** files.

---

## OnlyOffice later (optional)

When you want full Excel/Word UI + co-editing via OnlyOffice:

1. Deploy Document Server (Fly.io or VPS, ~4GB RAM) — see `deploy/onlyoffice/SETUP.md`
2. Set `ONLYOFFICE_DS_URL` + `ONLYOFFICE_JWT_SECRET` on Render
3. Set `VITE_ONLYOFFICE_DS_URL` on Vercel
4. Redeploy both

Until then, collab + xlsx editors are the default everywhere.
