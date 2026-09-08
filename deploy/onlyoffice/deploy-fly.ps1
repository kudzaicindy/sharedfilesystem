# Deploy OnlyOffice Document Server to Fly.io (needs card on file, ~$10–20/mo for 4GB)
# Run from repo root:  .\deploy\onlyoffice\deploy-fly.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command fly -ErrorAction SilentlyContinue)) {
  Write-Host "Installing flyctl..."
  iwr https://fly.io/install.ps1 -useb | iex
}

Write-Host "Log in to Fly (browser opens)..."
fly auth login

if (-not $env:ONLYOFFICE_JWT_SECRET) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $env:ONLYOFFICE_JWT_SECRET = [Convert]::ToBase64String($bytes)
  Write-Host ""
  Write-Host "Generated JWT secret (save this — use the SAME value on Render):"
  Write-Host $env:ONLYOFFICE_JWT_SECRET
  Write-Host ""
}

fly launch --no-deploy --copy-config --yes 2>$null
fly secrets set "JWT_SECRET=$env:ONLYOFFICE_JWT_SECRET"
fly deploy

$app = (Get-Content fly.toml | Select-String "app = '(.+)'").Matches.Groups[1].Value
$url = "https://$app.fly.dev"

Write-Host ""
Write-Host "OnlyOffice URL: $url"
Write-Host "Test: $url/welcome"
Write-Host ""
Write-Host "Render env:"
Write-Host "  ONLYOFFICE_DS_URL=$url"
Write-Host "  ONLYOFFICE_JWT_SECRET=$env:ONLYOFFICE_JWT_SECRET"
Write-Host "  ONLYOFFICE_SERVER_URL=https://sharedfilesystem.onrender.com"
Write-Host ""
Write-Host "Vercel env (redeploy after):"
Write-Host "  VITE_ONLYOFFICE_DS_URL=$url"
