[CmdletBinding()]
param(
    [ValidateSet('Status', 'Install', 'Remove')]
    [string]$Action = 'Status'
)
$ErrorActionPreference = 'Stop'
$category = 'SOFTWARE\Classes\CLSID\{860BB310-5D01-11D0-BD3B-00A0C911CE86}\Instance'
$instance = '{8DD9D5ED-6718-46A3-9FC8-AC7B4A6C2816}'
$owner = 'AdaPhoneCam.OBSBridge.v1'
$name = 'Ada PhoneCam'
$views = @([Microsoft.Win32.RegistryView]::Registry32)
if ([Environment]::Is64BitOperatingSystem) {
    $views = @([Microsoft.Win32.RegistryView]::Registry64, [Microsoft.Win32.RegistryView]::Registry32)
}
if ($Action -ne 'Status') {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this script in an Administrator PowerShell for Install or Remove. No registry changes made.'
    }
}
function Find-Backend($root) {
    $parent = $root.OpenSubKey($category)
    if (-not $parent) { return $null }
    try {
        foreach ($keyName in $parent.GetSubKeyNames()) {
            if ($keyName -eq $instance) { continue }
            $entry = $parent.OpenSubKey($keyName)
            try {
                if ($entry.GetValue('FriendlyName') -ne 'OBS Virtual Camera') { continue }
                $clsid = [string]$entry.GetValue('CLSID')
                $guid = [Guid]::Empty
                if (-not [Guid]::TryParse($clsid, [ref]$guid)) { continue }
                $clsid = $guid.ToString('B').ToUpperInvariant()
                $server = $root.OpenSubKey("SOFTWARE\Classes\CLSID\$clsid\InprocServer32")
                if (-not $server) { continue }
                try { $dll = [Environment]::ExpandEnvironmentVariables([string]$server.GetValue('')).Trim('"') }
                finally { $server.Dispose() }
                if (-not (Test-Path -LiteralPath $dll -PathType Leaf)) { continue }
                if ([IO.Path]::GetFileName($dll) -notmatch '^obs-virtualcam-module(32|64)?\.dll$') { continue }
                $data = $entry.GetValue('FilterData')
                if ($data -isnot [byte[]] -or $data.Length -eq 0) { continue }
                return [PSCustomObject]@{ Clsid = $clsid; Data = $data; Dll = $dll }
            } finally { $entry.Dispose() }
        }
    } finally { $parent.Dispose() }
    return $null
}
function Get-AdaEntry($root) {
    $key = $root.OpenSubKey("$category\$instance")
    if (-not $key) { return $null }
    try {
        return [PSCustomObject]@{
            Owned = ($key.GetValue('AdaOwner') -eq $owner)
            Clsid = [string]$key.GetValue('CLSID')
            Name = [string]$key.GetValue('FriendlyName')
        }
    } finally { $key.Dispose() }
}
$plans = @()
foreach ($view in $views) {
    $root = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, $view)
    try {
        $backend = Find-Backend $root
        $alias = Get-AdaEntry $root
        $plans += [PSCustomObject]@{ View = $view; Backend = $backend; Alias = $alias }
        if ($Action -eq 'Status') {
            $backendText = if ($backend) { $backend.Dll } else { 'not found' }
            $aliasText = if ($alias -and $alias.Owned) { $alias.Name } elseif ($alias) { 'foreign key' } else { 'not registered' }
            Write-Host "$view : OBS backend = $backendText ; Ada entry = $aliasText"
        }
    } finally { $root.Dispose() }
}
if ($Action -eq 'Status') { exit 0 }
foreach ($plan in $plans) {
    if ($plan.Alias -and -not $plan.Alias.Owned) { throw "Reserved instance already belongs to another registration in $($plan.View). No changes made." }
    if ($Action -eq 'Install' -and $plan.Alias -and (-not $plan.Backend -or $plan.Alias.Clsid -ne $plan.Backend.Clsid -or $plan.Alias.Name -ne $name)) {
        throw 'Existing Ada registration differs from the current OBS backend. Run Remove, then Install.'
    }
}
if ($Action -eq 'Install' -and -not ($plans | Where-Object { $_.Backend })) {
    throw 'No registered OBS Virtual Camera backend was found. Install OBS Studio and its Virtual Camera first.'
}
$created = @()
try {
    foreach ($plan in $plans) {
        $root = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, $plan.View)
        try {
            if ($Action -eq 'Remove') {
                $alias = Get-AdaEntry $root
                if ($alias -and $alias.Owned) {
                    $root.DeleteSubKeyTree("$category\$instance", $false)
                    Write-Host "Removed Ada registration in $($plan.View)."
                }
                continue
            }
            if (-not $plan.Backend) { Write-Warning "No OBS backend for $($plan.View); skipped."; continue }
            if ($plan.Alias) { Write-Host "Already registered in $($plan.View)."; continue }
            if (Get-AdaEntry $root) { throw 'Instance appeared during registration. Refusing to overwrite.' }
            $key = $root.CreateSubKey("$category\$instance")
            try {
                $key.SetValue('AdaOwner', $owner, [Microsoft.Win32.RegistryValueKind]::String)
                $created += $plan.View
                $key.SetValue('FriendlyName', $name, [Microsoft.Win32.RegistryValueKind]::String)
                $key.SetValue('CLSID', $plan.Backend.Clsid, [Microsoft.Win32.RegistryValueKind]::String)
                $key.SetValue('FilterData', $plan.Backend.Data, [Microsoft.Win32.RegistryValueKind]::Binary)
                Write-Host "Registered Ada PhoneCam in $($plan.View)."
            } finally { $key.Dispose() }
        } finally { $root.Dispose() }
    }
} catch {
    foreach ($view in $created) {
        $root = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, $view)
        try {
            $alias = Get-AdaEntry $root
            if ($alias -and $alias.Owned) { $root.DeleteSubKeyTree("$category\$instance", $false) }
        } finally { $root.Dispose() }
    }
    throw
}
Write-Host 'Done. Restart camera applications. The original OBS Virtual Camera registration was not changed.'
if ($Action -eq 'Install') {
    Write-Host 'This is an experimental DirectShow alias for OBS, not an independent camera driver. Verify the device in your target app.'
}
