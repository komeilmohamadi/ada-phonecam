$ErrorActionPreference = 'Stop'
$category = 'SOFTWARE\Classes\CLSID\{860BB310-5D01-11D0-BD3B-00A0C911CE86}\Instance'
$views = @([Microsoft.Win32.RegistryView]::Registry32)
if ([Environment]::Is64BitOperatingSystem) {
    $views = @([Microsoft.Win32.RegistryView]::Registry64, [Microsoft.Win32.RegistryView]::Registry32)
}
foreach ($view in $views) {
    $root = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, $view)
    $found = 0
    try {
        $parent = $root.OpenSubKey($category)
        if ($parent) {
            try {
                foreach ($key in $parent.GetSubKeyNames()) {
                    $entry = $parent.OpenSubKey($key)
                    try {
                        if ($entry.GetValue('FriendlyName') -ne 'Ada PhoneCam') { continue }
                        $found++
                        $clsid = [string]$entry.GetValue('CLSID')
                        $guid = [Guid]::Empty
                        $dll = 'unknown'
                        if ([Guid]::TryParse($clsid, [ref]$guid)) {
                            $server = $root.OpenSubKey("SOFTWARE\Classes\CLSID\$($guid.ToString('B'))\InprocServer32")
                            if ($server) {
                                try { $dll = [Environment]::ExpandEnvironmentVariables([string]$server.GetValue('')).Trim('"') }
                                finally { $server.Dispose() }
                            }
                        }
                        Write-Host "$view : Ada PhoneCam ; backend = $dll"
                    } finally { $entry.Dispose() }
                }
            } finally { $parent.Dispose() }
        }
        if ($found -eq 0) { Write-Host "$view : Ada PhoneCam is not registered" }
        if ($found -gt 1) { Write-Warning "Duplicate Ada PhoneCam entries in $view. Remove the old OBS alias if installed." }
    } finally { $root.Dispose() }
}
if (Get-Command Get-PnpDevice -ErrorAction SilentlyContinue) {
    try {
        $pnp = @(Get-PnpDevice -PresentOnly -ErrorAction Stop | Where-Object { $_.FriendlyName -eq 'Ada PhoneCam' })
        Write-Host "PnP devices named Ada PhoneCam: $($pnp.Count) (DirectShow registration is separate)."
    } catch { Write-Warning "PnP enumeration unavailable: $($_.Exception.Message)" }
}
Write-Host 'Registration does not prove video delivery. Test in a camera client.'
