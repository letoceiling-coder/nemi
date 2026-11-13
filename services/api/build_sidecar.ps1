# Builds the backend into a self-contained folder dist\nemi-api\ (nemi-api.exe + runtime).
# The Tauri installer ships that folder as a resource. Run from services\api:  .\build_sidecar.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$py = '.venv\Scripts\python.exe'
& $py -m pip install -q -r requirements.txt -r requirements-build.txt
& $py -m PyInstaller run_server.py --name nemi-api --onedir --console --noconfirm --clean `
  --hidden-import keyring.backends.Windows `
  --collect-submodules uvicorn `
  --collect-data botocore `
  --exclude-module pytest --exclude-module tkinter
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed ($LASTEXITCODE)" }
Write-Host "OK: $PSScriptRoot\dist\nemi-api\nemi-api.exe"
