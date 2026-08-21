# control-plane-materializer-a3-remote-run-rc.ps1
#
# Pure helpers for parsing the A3_RUN_RC marker emitted by the disposable
# Linux physical-validation controller and for capturing evidence BEFORE the
# caller performs any remote cleanup.
#
# Scope:
#   - Read-A3RunRc parses a single A3_RUN_RC=<n> marker from raw stdout.
#   - Invoke-A3RemoteRunSummary captures diagnostics hash/size/condition
#     FIRST, then parses the marker, then returns the structured summary.
#   - Cleanup is intentionally NOT performed here; the caller owns cleanup
#     so this module can be tested without ever touching a remote host.
#
# This module never logs credentials, IPs, or raw stdout/stderr. It only
# returns aggregate hashes, sizes, marker counts, validation conditions,
# and exit codes.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

<#
.SYNOPSIS
  Parse a single A3_RUN_RC=<n> marker from raw controller stdout.

.DESCRIPTION
  Read-A3RunRc is fail-closed:
    - Output must be UTF-8 and at most 65536 bytes; otherwise throws
      'remote_output_too_large'.
    - Output must contain exactly one line matching ^A3_RUN_RC=[0-9]+$;
      otherwise throws 'remote_run_marker_count_invalid' or
      'remote_run_marker_invalid'.
    - The numeric value must fit in [0, 255]; otherwise throws
      'remote_run_exit_code_invalid'.

.PARAMETER Output
  Raw stdout captured from the controller process.

.OUTPUTS
  [int] Exit code in [0, 255].
#>
function Read-A3RunRc {
    param([Parameter(Mandatory)][string]$Output)

    if ($null -eq $Output) {
        throw 'remote_run_marker_count_invalid'
    }

    $byteCount = [Text.Encoding]::UTF8.GetByteCount($Output)
    if ($byteCount -gt 65536) {
        throw 'remote_output_too_large'
    }

    # Split on any line ending and keep only exact prefix matches.
    $lines = $Output -split "`r`n|`n|`r"
    $markers = @()
    foreach ($line in $lines) {
        if ($line -like 'A3_RUN_RC=*') {
            $markers += $line
        }
    }

    if ($markers.Count -ne 1) {
        throw 'remote_run_marker_count_invalid'
    }

    $marker = $markers[0]
    if ($marker -notmatch '^A3_RUN_RC=([0-9]+)$') {
        throw 'remote_run_marker_invalid'
    }

    $exitCode = [int]$Matches[1]
    if ($exitCode -lt 0 -or $exitCode -gt 255) {
        throw 'remote_run_exit_code_invalid'
    }

    return $exitCode
}

<#
.SYNOPSIS
  Capture diagnostics evidence and parse the A3_RUN_RC marker in the safe
  order: evidence FIRST, marker parse SECOND, caller cleanup LATER.

.DESCRIPTION
  Invoke-A3RemoteRunSummary is the validator entry point. The caller passes
  a [pscustomobject] describing the controller output and diagnostics; this
  function returns a [pscustomobject] summary containing:
    - remote_output_sha256
    - remote_output_size
    - marker_count
    - validation_condition
    - diagnostics_present
    - diagnostics_sha256
    - quota_validation_exit (only when validation_condition is 'ok')

  The function never performs cleanup. The caller MUST invoke cleanup
  AFTER receiving the summary, so evidence is preserved on any failure.

.PARAMETER RemoteRun
  [pscustomobject] with at least:
    [string] Output   - raw stdout captured from the controller process.

.PARAMETER Diagnostics
  [pscustomobject] (or $null) describing the diagnostics artifact the
  controller produced. Expected shape:
    [bool]   Present
    [string] Sha256
    [int]    Size

.PARAMETER FailClosedCondition
  Optional [string] condition string to use when validation fails. Defaults
  to 'remote_run_marker_invalid'.

.OUTPUTS
  [pscustomobject] summary record (see DESCRIPTION for fields).
#>
function Invoke-A3RemoteRunSummary {
    param(
        [Parameter(Mandatory)][pscustomobject]$RemoteRun,
        [pscustomobject]$Diagnostics,
        [string]$FailClosedCondition = 'remote_run_marker_invalid'
    )

    # 1. Capture raw evidence FIRST so it survives any later failure.
    $outputBytes = [Text.Encoding]::UTF8.GetBytes($RemoteRun.Output)
    $remoteOutputSha256 = ([BitConverter]::ToString(
        [System.Security.Cryptography.SHA256]::Create().ComputeHash($outputBytes)
        ) -replace '-', '').ToLowerInvariant()
    $remoteOutputSize = $outputBytes.Length

    $markerCount = 0
    if ($null -ne $RemoteRun.Output) {
        foreach ($line in ($RemoteRun.Output -split "`r`n|`n|`r")) {
            if ($line -like 'A3_RUN_RC=*') {
                $markerCount++
            }
        }
    }

    $diagnosticsPresent = $false
    $diagnosticsSha256 = ''
    if ($null -ne $Diagnostics -and $Diagnostics.Present) {
        $diagnosticsPresent = $true
        if ($Diagnostics.PSObject.Properties.Name -contains 'Sha256') {
            $diagnosticsSha256 = [string]$Diagnostics.Sha256
        }
    }

    # 2. Parse the marker; on any failure return a fail-closed summary.
    $summary = [pscustomobject]@{
        remote_output_sha256 = $remoteOutputSha256
        remote_output_size   = $remoteOutputSize
        marker_count         = $markerCount
        validation_condition = ''
        diagnostics_present  = $diagnosticsPresent
        diagnostics_sha256   = $diagnosticsSha256
        quota_validation_exit = $null
    }

    try {
        $exitCode = Read-A3RunRc -Output $RemoteRun.Output
    }
    catch {
        $summary.validation_condition = if ($_.Exception.Message) {
            $_.Exception.Message
        } else {
            $FailClosedCondition
        }
        return $summary
    }

    $summary.validation_condition = 'ok'
    $summary.quota_validation_exit = $exitCode
    return $summary
}

# When this script is dot-sourced (as it is by the test harness), the
# functions are already in script scope and Export-ModuleMember is not
# permitted. When it is loaded via Import-Module, callers need the
# explicit export. Use the cmdlet-in-module sentinel to detect the
# Import-Module path only.
if ($MyInvocation.InvocationName -ne '.' -and $MyInvocation.MyCommand.ModuleName) {
    Export-ModuleMember -Function Read-A3RunRc, Invoke-A3RemoteRunSummary
}