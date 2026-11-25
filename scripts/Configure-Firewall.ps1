param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$ruleName = 'AdaPhoneCam-' + ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($projectDirectory)) -replace '[^A-Za-z0-9]', '')
if ($Remove) {
  Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Write-Host 'Ada PhoneCam firewall rule removed.'
  exit 0
}
Push-Location -LiteralPath $projectDirectory
try {
  $portOutput = & node --input-type=module -e "import {loadConfig} from './src/config.mjs'; console.log((await loadConfig()).port);"
  if ($LASTEXITCODE -ne 0) { throw 'Could not read the server port.' }
  $port = [int]$portOutput
  $nodePath = (Get-Command node -ErrorAction Stop).Source
  Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -Name $ruleName -DisplayName 'Ada PhoneCam local HTTPS' -Description $projectDirectory -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Program $nodePath -RemoteAddress LocalSubnet -Profile Private | Out-Null
  Write-Host ('Allowed local-subnet HTTPS connections on private networks, TCP port ' + $port + '.')
} finally { Pop-Location }
