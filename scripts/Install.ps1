$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
      throw 'Install Node.js 24 or newer from https://nodejs.org/en/download, then run Install.bat again. Automatic installation requires Windows App Installer (winget).'
    }
    Write-Host 'Installing Node.js LTS using Windows Package Manager...'
    & winget install --exact --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw 'Node.js installation failed. Install it from https://nodejs.org/en/download.' }
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  }
  & node -e "if (Number(process.versions.node.split('.')[0]) < 24) { console.error('Node.js 24 or newer is required.'); process.exit(1); }"
  if ($LASTEXITCODE -ne 0) { throw 'Update Node.js from https://nodejs.org/en/download, then run Install.bat again.' }
  & npm.cmd ci --ignore-scripts --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check your Internet connection and try again.' }
  & node scripts/setup.mjs
  if ($LASTEXITCODE -ne 0) { throw 'HTTPS setup failed.' }
} catch {
  Write-Host ('Installation failed: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
