$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "windows_runner_process_identity.ps1")

function Assert-True($Value, [string]$Message) {
    if (-not $Value) { throw $Message }
}
function Assert-False($Value, [string]$Message) {
    if ($Value) { throw $Message }
}
function Assert-Throws([scriptblock]$Action, [string]$Pattern) {
    try { & $Action; throw "Expected failure matching '$Pattern'" }
    catch {
        if ($_.Exception.Message -notmatch $Pattern) { throw }
    }
}

# Primary classification: ordinary argv is accepted.
Assert-True (Test-PrimaryRunnerArguments -Arguments @("codegpt-runner.exe", "--config", "runner.toml")) "normal Runner argv was not classified primary"

# Internal mode exclusion: both current modes and any future internal prefix fail closed.
Assert-False (Test-PrimaryRunnerArguments -Arguments @("codegpt-runner.exe", "--codegpt-internal-detached-supervisor", "x")) "detached supervisor was classified primary"
Assert-False (Test-PrimaryRunnerArguments -Arguments @("codegpt-runner.exe", "--codegpt-internal-detached-watchdog", "x")) "detached watchdog was classified primary"
Assert-False (Test-PrimaryRunnerArguments -Arguments @("codegpt-runner.exe", "--codegpt-internal-future-mode")) "future internal mode was classified primary"
Assert-False (Test-PrimaryRunnerArguments -Arguments @("--codegpt-internal-detached-supervisor", "x")) "internal mode in the first parsed argv token was classified primary"

# Same executable path is intentionally not sufficient: role comes from exact argv.
$normal = Test-PrimaryRunnerArguments -Arguments @("C:\same\codegpt-runner.exe")
$internal = Test-PrimaryRunnerArguments -Arguments @("C:\same\codegpt-runner.exe", "--codegpt-internal-detached-watchdog")
Assert-True ($normal -and -not $internal) "same executable path did not preserve role distinction"

# Windows command-line parsing is exact argv parsing rather than substring matching.
$parsed = @(ConvertFrom-WindowsCommandLine -CommandLine '"C:\Program Files\codegpt-runner.exe" --config "C:\Runner Config\runner.toml"')
Assert-True ($parsed.Count -eq 3 -and $parsed[1] -eq "--config" -and $parsed[2] -eq "C:\Runner Config\runner.toml") "Windows argv parsing contract failed"

# Deterministic creation-identity mismatch seam: live check must reject the current
# PID when the captured creation FILETIME is not the current creation FILETIME.
$currentPid = [uint32]$PID
$currentCreation = [CodeGPT.WindowsProcessIdentity]::GetCreationTime($currentPid)
Assert-True ([CodeGPT.WindowsProcessIdentity]::IsLive($currentPid, $currentCreation)) "current process exact identity should be live"
$differentCreation = if ($currentCreation -eq [uint64]::MaxValue) { [uint64]0 } else { $currentCreation + [uint64]1 }
Assert-False ([CodeGPT.WindowsProcessIdentity]::IsLive($currentPid, $differentCreation)) "creation identity mismatch did not fail closed"
Assert-False ([CodeGPT.WindowsProcessIdentity]::CreationIdentityMatches($currentCreation, $differentCreation)) "creation mismatch seam would allow an effect"
Assert-True ([CodeGPT.WindowsProcessIdentity]::CreationIdentityMatches($currentCreation, $currentCreation)) "matching creation identity seam rejected exact identity"
Assert-Throws { [CodeGPT.WindowsProcessIdentity]::TerminateExact($currentPid, $differentCreation) } "creation identity mismatch"
Assert-True ([CodeGPT.WindowsProcessIdentity]::IsLive($currentPid, $currentCreation)) "mismatched termination attempt affected the current process"

Write-Output "Windows Runner process identity focused tests passed."
