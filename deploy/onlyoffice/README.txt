OnlyOffice Document Server — public deployment
===============================================

You need THREE URLs in production:

  1. Frontend (Vercel):     https://sharedfilessystem.vercel.app
  2. API (Render):          https://sharedfilesystem.onrender.com
  3. OnlyOffice (this):     https://YOUR-ONLYOFFICE-URL   <-- you create this

Pick ONE hosting option below.


Option A — Fly.io (easiest cloud, ~$10–20/mo for 4GB RAM)
---------------------------------------------------------
  npm i -g flyctl
  fly auth login
  cd deploy/onlyoffice
  fly launch --no-deploy
  fly secrets set JWT_SECRET="same-secret-as-render-ONLYOFFICE_JWT_SECRET"
  fly deploy

  Your DS URL:  https://shared-docs-onlyoffice.fly.dev
  (or custom domain: fly certs add onlyoffice.yourdomain.com)


Option B — VPS + Docker (Hetzner/DigitalOcean, ~$6–12/mo)
---------------------------------------------------------
  Copy deploy/onlyoffice/ to the server
  Create .env with ONLYOFFICE_JWT_SECRET and OO_HOST=onlyoffice.yourdomain.com
  docker compose -f docker-compose.prod.yml up -d

  Your DS URL:  https://onlyoffice.yourdomain.com


Option C — Render (NOT recommended for OnlyOffice)
--------------------------------------------------
  OnlyOffice needs 4GB+ RAM and listens on port 80 inside Docker.
  Render expects apps on $PORT — often fails. Use Fly.io or a VPS instead.


Environment variables (after OnlyOffice is public)
----------------------------------------------------

Render (API server):
  ONLYOFFICE_JWT_SECRET=<same as OnlyOffice JWT_SECRET>
  ONLYOFFICE_DS_URL=https://YOUR-ONLYOFFICE-URL
  ONLYOFFICE_SERVER_URL=https://sharedfilesystem.onrender.com
  SERVER_PUBLIC_URL=https://sharedfilesystem.onrender.com
  CLIENT_URL=https://sharedfilessystem.vercel.app

Vercel (frontend — redeploy after setting):
  VITE_ONLYOFFICE_DS_URL=https://YOUR-ONLYOFFICE-URL
  VITE_API_URL=https://sharedfilesystem.onrender.com/api
  VITE_SOCKET_URL=https://sharedfilesystem.onrender.com

JWT secret: generate once, use the SAME value on OnlyOffice + Render.
Never commit secrets to git.

Test: open https://YOUR-ONLYOFFICE-URL/welcome — OnlyOffice welcome page should load.
