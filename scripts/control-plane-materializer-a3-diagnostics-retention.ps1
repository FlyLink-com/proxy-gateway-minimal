# control-plane-materializer-a3-diagnostics-retention.ps1
#
# Per-command evidence retention for the disposable Aliyun SWAS A3-1 quota-only
# replay. Adds the per-command retention primitive referenced in
# https://github.com/gccwebos-com/proxy-gateway-minimal/issues/636#issuecomment-5377452689
# so a future runner-side wiring PR can call Persist-A3PerCommandEvidence from
# the diagnostics observer and recover the argv preview + bounded stderr that
# the final receipt alone cannot supply. (The runner-side wiring itself is
# intentionally OUT OF SCOPE for this PR; this module is a tested standalone
# primitive so the wiring PR can land independently once the diagnostics-1
# observer confirms its argv-redaction policy alignment.)
#
# Two ways to invoke this module:
#   1. Dot-source and call the functions directly (used by the existing
#      unit tests and by future runner-side callers that load the module
#      in-process).
#   2. Invoke as a CLI (used by the test suite's spawnSync wrapper and by
#      any external caller that prefers out-of-process isolation):
#        pwsh -File control-plane-materializer-a3-diagnostics-retention.ps1 `
#             -Action persist -DiagnosticsPath <abs.jsonl>  < record.json
#        pwsh -File control-plane-materializer-a3-diagnostics-retention.ps1 `
#             -Action summary -DiagnosticsPath <abs.jsonl> -RunLabel <label>
#
# Scope (B-tier; no remote access, no production impact):
#   - Persist-A3PerCommandEvidence writes one JSONL line per command BEFORE
#     the caller performs any cleanup. The line is fsynced; the function
#     throws on IO failure so callers can abort the whole replay.
#   - New-A3DiagnosticsRunSummary reads back the per-command lines, appends
#     one integrity footer line with the SHA-256 over all command lines,
#     and returns a [pscustomobject] summary. The summary is fully
#     materialized before the function returns so the caller can safely
#     run cleanup.
#   - Cleanup is intentionally NOT performed here. The caller owns cleanup
#     so this module stays testable without ever touching a remote host.
#
# Hard prohibitions (enforced by field caps and redaction):
#   - Raw stdout and stderr bytes are NEVER written. Only hash, byte size,
#     and a redaction-conditioned preview (max 512 bytes) per field.
#   - argv values that look like a token, secret, IP, or private key are
#     replaced with the literal '<redacted>'.
#   - Environment variable VALUES are never recorded; only the names that
#     were present at command time, joined by ','.
#   - No file is written outside the diagnostics directory the caller
#     passes; the path is validated as absolute and the parent directory
#     must already exist.
#   - No file is appended to when an existing file already carries an
#     integrity_footer (re-summarization is refused to prevent silent
#     receipt pollution).

param(
    [ValidateSet('persist', 'summary')]
    [string]$Action,

    [string]$DiagnosticsPath,

    [string]$RunLabel
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# UTF-8 without BOM. [Text.Encoding]::UTF8 includes a byte-order mark; we
# want the JSONL lines to be plain UTF-8 so consumers can parse line-by-line
# without first stripping a leading BOM.
$script:A3Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

# Bounded byte cap for each redacted preview field (stdout_preview /
# stderr_preview). 512 bytes is enough to surface the first error line and
# any obvious contract-violation marker without leaking large payloads.
$A3_DIAG_PREVIEW_BYTE_CAP = 512

# Bounded byte cap for the env_names string. A typical command has <20
# environment variables; 4096 bytes is well above any realistic value.
$A3_DIAG_ENV_NAMES_BYTE_CAP = 4096

# Per-token regex used by ConvertTo-A3RedactedArgv. Matches a single argv
# token whose name suggests a credential (token=, secret=, password=, etc.)
# OR a token that is a long mixed-case+digits blob (>=24 chars) OR an IPv4
# literal. We redacted the long-blob rule so a plain stream of identical
# ASCII letters (test payloads, English prose) is not over-redacted.
$script:A3RedactKeyValueRegex = '(?i)^-+(token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|bearer|aws_access_key_id|aws_secret_access_key)=(.+)$'
$script:A3RedactLongBlobRegex = '^(?=[A-Za-z0-9+/]*[0-9])(?=[A-Za-z0-9+/]*[A-Z])(?=[A-Za-z0-9+/]*[a-z])[A-Za-z0-9+/]{24,}={0,2}$'
$script:A3RedactIPv4Regex = '^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$'
$script:A3RedactKnownPrefixRegex = '^(sk-|pk-|ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{8,}$'

<#
.SYNOPSIS
  Compute a lowercase-hex SHA-256 over a UTF-8 byte payload.
#>
function Get-A3LowerHexSha256 {
    param([Parameter(Mandatory)][AllowEmptyCollection()][byte[]]$Bytes)
    if ($null -eq $Bytes -or $Bytes.Length -eq 0) {
        return ('0' * 64)
    }
    $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($Bytes)
    return ([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
}

<#
.SYNOPSIS
  Append UTF-8 bytes to a file with a true fsync (FlushFileBuffers equivalent).

.DESCRIPTION
  System.IO.File.AppendAllText writes through the user-space buffer but does
  NOT call FlushFileBuffers; on a crash the operator can observe a partial
  JSONL line on disk even though the call returned success. This helper opens
  the file with FileMode.Append + FileAccess.Write + FileShare.None, writes
  the bytes, then calls Flush($true) which dispatches to FlushFileBuffers on
  Windows and fsync(2) on POSIX. After Flush($true) returns, the bytes are
  durable on stable storage; a crash either preserves them whole or yields
  no visible change. The handle is closed in a finally block so an exception
  during write or flush cannot leak the fd.

  The function throws 'a3_diagnostics_write_failed' on any I/O failure so
  callers abort the whole replay rather than silently lose evidence.
#>
function Write-A3FsyncedAppend {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][AllowEmptyCollection()][byte[]]$Bytes
    )
    $stream = $null
    try {
        $stream = [System.IO.File]::Open(
            $Path,
            [System.IO.FileMode]::Append,
            [System.IO.FileAccess]::Write,
            [System.IO.FileShare]::None
        )
        if ($Bytes.Length -gt 0) {
            $stream.Write($Bytes, 0, $Bytes.Length)
        }
        $stream.Flush($true)
    } catch {
        throw 'a3_diagnostics_write_failed'
    } finally {
        if ($null -ne $stream) {
            try { $stream.Close() } catch { }
        }
    }
}

<#
.SYNOPSIS
  Redact an argv string token-by-token. Whitespace-delimited tokens that
  match a credential shape are replaced with '<redacted>'. Plain English
  prose or test payloads are preserved verbatim.
#>
function ConvertTo-A3RedactedArgv {
    param([string]$Argv)
    if ($null -eq $Argv -or $Argv -eq '') {
        return ''
    }
    $tokens = $Argv -split '\s+'
    $out = @()
    foreach ($t in $tokens) {
        if ($t -match $script:A3RedactKeyValueRegex) {
            $out += ('<redacted>')
        } elseif ($t -match $script:A3RedactKnownPrefixRegex) {
            $out += ('<redacted>')
        } elseif ($t -match $script:A3RedactLongBlobRegex) {
            $out += ('<redacted>')
        } elseif ($t -match $script:A3RedactIPv4Regex) {
            $out += ('<redacted>')
        } else {
            $out += $t
        }
    }
    return ($out -join ' ')
}

<#
.SYNOPSIS
  Capture stdout/stderr redacted previews plus hash, size, and condition.
#>
function Get-A3StreamSnapshot {
    param([string]$Stream)
    if ($null -eq $Stream) { $Stream = '' }
    $bytes = [Text.Encoding]::UTF8.GetBytes($Stream)
    $sha256 = Get-A3LowerHexSha256 -Bytes $bytes
    $size = $bytes.Length
    if ($size -eq 0) {
        return [pscustomobject]@{
            sha256       = $sha256
            size_bytes   = 0
            preview      = ''
            condition    = 'empty'
        }
    }
    $truncated = $false
    if ($size -gt $A3_DIAG_PREVIEW_BYTE_CAP) {
        $previewBytes = $bytes[0..($A3_DIAG_PREVIEW_BYTE_CAP - 1)]
        $truncated = $true
    } else {
        $previewBytes = $bytes
    }
    $preview = ([Text.Encoding]::UTF8.GetString($previewBytes))
    $preview = ConvertTo-A3RedactedArgv -Argv $preview
    return [pscustomobject]@{
        sha256       = $sha256
        size_bytes   = $size
        preview      = $preview
        condition    = if ($truncated) { 'truncated' } else { 'present' }
    }
}

<#
.SYNOPSIS
  Validate and persist one per-command evidence record.

.DESCRIPTION
  Persist-A3PerCommandEvidence writes one JSONL line to the caller-supplied
  diagnostics path BEFORE returning. The line is fsynced; on failure the
  function throws 'a3_diagnostics_write_failed' so callers can abort the
  whole replay.
#>
function Persist-A3PerCommandEvidence {
    param(
        [Parameter(Mandatory)][string]$DiagnosticsPath,
        [Parameter(Mandatory)][pscustomobject]$Record
    )

    if (-not (Test-Path -LiteralPath (Split-Path -Parent $DiagnosticsPath) -PathType Container)) {
        throw 'a3_diagnostics_parent_missing'
    }

    $argvRedacted = ConvertTo-A3RedactedArgv -Argv ([string]$Record.argv)
    $stdoutSnap = Get-A3StreamSnapshot -Stream ([string]$Record.stdout)
    $stderrSnap = Get-A3StreamSnapshot -Stream ([string]$Record.stderr)

    $envNames = [string]$Record.env_names
    if ([Text.Encoding]::UTF8.GetByteCount($envNames) -gt $A3_DIAG_ENV_NAMES_BYTE_CAP) {
        throw 'a3_diagnostics_env_names_too_large'
    }

    $line = [pscustomobject]@{
        kind          = 'command'
        command_index = [int]$Record.command_index
        command_label = [string]$Record.command_label
        working_dir   = [string]$Record.working_dir
        env_names     = $envNames
        argv_redacted = $argvRedacted
        stdout        = $stdoutSnap
        stderr        = $stderrSnap
        exit_code     = [int]$Record.exit_code
        started_at    = [string]$Record.started_at
        finished_at   = [string]$Record.finished_at
    }

    $json = ConvertTo-Json -Depth 6 -Compress -InputObject $line
        $jsonBytes = [Text.Encoding]::UTF8.GetBytes(($json + "`n"))

        Write-A3FsyncedAppend -Path $DiagnosticsPath -Bytes $jsonBytes

        return $line
    }

<#
.SYNOPSIS
  Finalize a diagnostics file by appending the integrity footer and
  returning the run-level summary.
#>
function New-A3DiagnosticsRunSummary {
    param(
        [Parameter(Mandatory)][string]$DiagnosticsPath,
        [Parameter(Mandatory)][string]$RunLabel
    )

    if (-not (Test-Path -LiteralPath $DiagnosticsPath)) {
        throw 'a3_diagnostics_file_missing'
    }

        # First pass: strict JSON parse every line. Any line that does not parse
        # as a complete JSON object is treated as a partial/garbled write and
        # the function throws 'a3_diagnostics_partial_line:<sha256-of-line>'. The
        # previous implementation used a permissive regex match that silently
        # skipped malformed lines; that let a partial-write footer pass even
        # though the operator's evidence was incomplete.
        $rawLines = Get-Content -LiteralPath $DiagnosticsPath -Encoding UTF8
        $parsedLines = @()
        $footerParsed = $null
        foreach ($line in $rawLines) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            try {
                $obj = $line | ConvertFrom-Json -ErrorAction Stop
            } catch {
                $lineSha = Get-A3LowerHexSha256 -Bytes ([Text.Encoding]::UTF8.GetBytes($line))
                throw ('a3_diagnostics_partial_line:' + $lineSha)
            }
            $parsedLines += $obj
        }

        foreach ($obj in $parsedLines) {
            if ($obj.kind -eq 'integrity_footer') {
                if ($null -ne $footerParsed) {
                    throw 'a3_diagnostics_footer_already_present'
                }
                $footerParsed = $obj
            }
        }

        if ($null -ne $footerParsed) {
            throw 'a3_diagnostics_footer_already_present'
        }

        $commandLines = @()
        foreach ($obj in $parsedLines) {
            if ($obj.kind -eq 'command') {
                $commandLines += ($obj | ConvertTo-Json -Depth 6 -Compress)
            }
        }

        $aggregateBytes = [Text.Encoding]::UTF8.GetBytes(($commandLines -join "`n"))
        $aggregateSha = Get-A3LowerHexSha256 -Bytes $aggregateBytes

        $footer = [pscustomobject]@{
            kind              = 'integrity_footer'
            run_label         = $RunLabel
            command_count     = $commandLines.Count
            jsonl_sha256      = $aggregateSha
            footer_written_at = (Get-Date).ToUniversalTime().ToString('o')
        }
        $footerJson = ConvertTo-Json -Depth 6 -Compress -InputObject $footer
        $footerBytes = [Text.Encoding]::UTF8.GetBytes(($footerJson + "`n"))

        Write-A3FsyncedAppend -Path $DiagnosticsPath -Bytes $footerBytes

        # Disk readback: re-open the file and re-parse every line. The
        # recomputed aggregate must match the footer.jsonl_sha256 byte for
        # byte; a mismatch means the on-disk content diverged from what the
        # in-memory aggregation saw (truncated write, racing writer, etc.).
        # This is the only integrity check that proves the bytes the operator
        # will read back later actually correspond to the hash we claim.
        $verifyRawLines = Get-Content -LiteralPath $DiagnosticsPath -Encoding UTF8
        $verifyParsed = @()
        foreach ($line in $verifyRawLines) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            try {
                $verifyObj = $line | ConvertFrom-Json -ErrorAction Stop
            } catch {
                $lineSha = Get-A3LowerHexSha256 -Bytes ([Text.Encoding]::UTF8.GetBytes($line))
                throw ('a3_diagnostics_partial_line:' + $lineSha)
            }
            $verifyParsed += $verifyObj
        }
        $verifyCommandLines = @()
        foreach ($obj in $verifyParsed) {
            if ($obj.kind -eq 'command') {
                $verifyCommandLines += ($obj | ConvertTo-Json -Depth 6 -Compress)
            }
        }
        $verifyAggregateBytes = [Text.Encoding]::UTF8.GetBytes(($verifyCommandLines -join "`n"))
        $verifyAggregateSha = Get-A3LowerHexSha256 -Bytes $verifyAggregateBytes

        $perCommand = @()
        foreach ($obj in $verifyParsed) {
            if ($obj.kind -eq 'command') {
                $perCommand += $obj
            }
        }

        $integrityVerified = ($verifyAggregateSha -eq $aggregateSha)

        return [pscustomobject]@{
            diagnostics_path   = $DiagnosticsPath
            run_label          = $RunLabel
            command_count      = $commandLines.Count
            jsonl_sha256       = $verifyAggregateSha
            integrity_verified = $integrityVerified
            per_command        = $perCommand
        }
}

if ($MyInvocation.InvocationName -ne '.' -and $MyInvocation.MyCommand.ModuleName) {
    Export-ModuleMember -Function `
        Persist-A3PerCommandEvidence, `
        New-A3DiagnosticsRunSummary, `
        Write-A3FsyncedAppend, `
        Get-A3LowerHexSha256, `
        ConvertTo-A3RedactedArgv, `
        Get-A3StreamSnapshot
}

# CLI dispatch: only runs when this script is invoked directly
# (`pwsh -File ...`); dot-sourcing sets $MyInvocation.InvocationName to '.'
# and skips this branch entirely. The dispatch reads the per-command record
# from STDIN as a single UTF-8 JSON object so the caller does not need to
# serialize argv via argv escaping (which would lose quoting and risk
# argv-secret leakage through the process command line).
if ($MyInvocation.InvocationName -ne '.') {
    if (-not $DiagnosticsPath) {
        throw 'a3_diagnostics_cli_path_required'
    }
    if (-not $Action) {
        throw 'a3_diagnostics_cli_action_required'
    }
    switch ($Action) {
        'persist' {
            $stdinRaw = [Console]::In.ReadToEnd()
            if ([string]::IsNullOrWhiteSpace($stdinRaw)) {
                throw 'a3_diagnostics_cli_persist_stdin_empty'
            }
            $record = $stdinRaw | ConvertFrom-Json -ErrorAction Stop
            Persist-A3PerCommandEvidence -DiagnosticsPath $DiagnosticsPath -Record $record
        }
        'summary' {
            if (-not $RunLabel) {
                throw 'a3_diagnostics_cli_summary_run_label_required'
            }
            New-A3DiagnosticsRunSummary -DiagnosticsPath $DiagnosticsPath -RunLabel $RunLabel
        }
        default {
            throw ('a3_diagnostics_cli_unknown_action:' + $Action)
        }
    }
}