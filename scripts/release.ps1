# Publish a new NEMI version as a signed one-click update.
#   .\scripts\release.ps1 -Version 0.1.2            # notes are taken from docs/CHANGELOG.md, section "## 0.1.2"
#   .\scripts\release.ps1 -Version 0.1.2 -NoUpload  # build and sign only
# Needs: updater key  %USERPROFILE%\.tauri\nemi-updater.key (never in git),
#        its password in Windows Credential Manager (service personal-ai-assistant, name tauri_signing_password),
#        SSH key access to the landing server.
param(
  [Parameter(Mandatory)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
  [switch]$NoUpload,
  [string]$Server = 'root@31.192.111.33',
  [string]$RemoteDir = '/var/www/nemi.siteaccess.ru/updates',
  [string]$BaseUrl = 'https://nemi.siteaccess.ru/updates'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$py = "$root\services\api\.venv\Scripts\python.exe"
$key = "$env:USERPROFILE\.tauri\nemi-updater.key"
if (-not (Test-Path $key)) { throw "Updater key not found: $key" }

# 1. one version everywhere + release notes from the changelog
& $py "$PSScriptRoot\release_helper.py" bump $Version
if ($LASTEXITCODE -ne 0) { throw 'version bump failed' }

# 2. signed build (the password never touches disk or the command line)
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $key -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (& $py -c "import keyring; print(keyring.get_password('personal-ai-assistant','tauri_signing_password') or '')").Trim()
if (-not $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) { throw 'Signing password missing in Credential Manager' }
try {
  & "$PSScriptRoot\build-installer.ps1"
} finally {
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY, Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
}

$nsis = "$root\apps\desktop\src-tauri\target\release\bundle\nsis"
$exe = "NEMI_${Version}_x64-setup.exe"
if (-not (Test-Path "$nsis\$exe.sig")) { throw "Signature not produced: $nsis\$exe.sig" }

# 3. update manifest
& $py "$PSScriptRoot\release_helper.py" manifest $Version "$nsis\$exe.sig" "$BaseUrl/$exe" "$nsis\latest.json"
if ($LASTEXITCODE -ne 0) { throw 'manifest failed' }
New-Item -ItemType Directory -Force "$root\release" | Out-Null
Copy-Item "$nsis\$exe" "$root\release\" -Force

# 4. upload: installer first, manifest last, so clients never see a version whose file is missing
if (-not $NoUpload) {
  ssh $Server "mkdir -p $RemoteDir"
  scp "$nsis\$exe" "$nsis\$exe.sig" "${Server}:$RemoteDir/"
  if ($LASTEXITCODE -ne 0) { throw 'upload failed' }
  scp "$nsis\latest.json" "${Server}:$RemoteDir/latest.json.tmp"
  ssh $Server "mv $RemoteDir/latest.json.tmp $RemoteDir/latest.json && ls -la $RemoteDir"
  Write-Host "Published $Version -> $BaseUrl/latest.json"
} else {
  Write-Host "Built and signed $Version (not uploaded): $nsis"
}
