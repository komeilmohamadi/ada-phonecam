$ErrorActionPreference = 'Stop'
$certificatePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'runtime\certs\ada-phonecam-ca.crt'
if (-not (Test-Path -LiteralPath $certificatePath)) { throw 'Run Install.bat before trusting the local CA certificate.' }
$certificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certificatePath)
Write-Host ('Trusting this installation for the current Windows user: ' + $certificate.Subject)
Import-Certificate -FilePath $certificatePath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
Write-Host 'Certificate trusted. Restart your browser if it was already open.'
