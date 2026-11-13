# Full release build: backend -> nemi-api (PyInstaller), then the Tauri app + NSIS installer.
# Result: apps\desktop\src-tauri\target\release\bundle\nsis\NEMI_<version>_x64-setup.exe
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
& "$root\services\api\build_sidecar.ps1"
Push-Location "$root\apps\desktop"
try {
  npx tauri build
  if ($LASTEXITCODE -ne 0) { throw "tauri build failed ($LASTEXITCODE)" }
} finally { Pop-Location }
Get-ChildItem "$root\apps\desktop\src-tauri\target\release\bundle\nsis\*.exe" | Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,1)}}
