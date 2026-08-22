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

    [string]$RunLabel,

    [string]$SinkRoot
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
$script:A3RedactKeyValueRegex    = '(?i)^[-_]*(token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|bearer|aws_access_key_id|aws_secret_access_key)=(.+)$'
$script:A3RedactLongBlobRegex    = '^(?=[A-Za-z0-9+/]*[0-9])(?=[A-Za-z0-9+/]*[A-Z])(?=[A-Za-z0-9+/]*[a-z])[A-Za-z0-9+/]{24,}={0,2}$'
$script:A3RedactJwtRegex         = '^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$'
$script:A3RedactIPv4Regex        = '^(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?::[0-9]+)?(?:/[0-9]+)?$'
$script:A3RedactIPv6Regex        = '^(?:[\[]?(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\]?|(?:[0-9a-f]{0,4}:){2,7}:[0-9a-f]{0,4}|::1?|::)(?::[0-9]+)?(?:%[A-Za-z0-9_.\-]+)?$'
$script:A3RedactUserHostRegex    = '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
$script:A3RedactKnownPrefixRegex = '^(sk-|pk-|ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{8,}$'
$script:A3RedactUrlQueryRegex    = '(?i)([?&])(token|access_token|access_key|secret|password|passwd|api[_-]?key|sig|signature|x-api-key|x-amz-signature|x-amz-security-token|refresh_token|client_secret|client_id|aws_session_token|private[_-]?key|code)(=)([^&\s"]+)'
# URL userinfo scrubber: matches `scheme://user:pass@` and replaces the
# `user:pass` pair with `<redacted>` so e.g.
# `https://svc:hunter2@example.com/x` becomes `https://<redacted>@example.com/x`.
$script:A3RedactUrlUserInfoRegex = '^([a-z][a-z0-9+.\-]*://)([^:@/\s]+):([^@/\s]+)@'
# URL IPv4-host scrubber: matches `scheme://10.0.0.5` or `scheme://10.0.0.5/...`
# and replaces the IPv4 literal with `<redacted>`.
$script:A3RedactUrlIPv4HostRegex = '^([a-z][a-z0-9+.\-]*://)([0-9]{1,3}(?:\.[0-9]{1,3}){3})(?=[:/]|$)'
# URL IPv6-host scrubber: matches `scheme://[2001:db8::1]` (bracketed) and
# replaces the bracketed literal with `<redacted>`.
$script:A3RedactUrlIPv6HostRegex = '^([a-z][a-z0-9+.\-]*://)(\[[0-9a-fA-F:]+\])(?=[:/]|$)'
# URL user@host scrubber: matches `scheme://user@host` and replaces
# `user@host` with `<redacted>`. The `:` exclusion in the user slot
# prevents the userinfo shape `user:pass@host` from being matched here
# (the userinfo scrubber handles that case separately).
$script:A3RedactUrlUserHostRegex = '^([a-z][a-z0-9+.\-]*://)([^:@/?#\s]+@[^:@/?#\s]+)(?=[:/]|$)'
# URL JWT-in-path scrubber: matches a path-segment shaped like
# `header.payload.signature` (each part [A-Za-z0-9_-]+, length >= 2)
# preceded by a `/`, and replaces the whole segment with `<redacted>`.
# The lookbehind `(?<=[^:/])` ensures the `/` is a real path separator
# and not the second `/` of `scheme://`; without it `api.example.com`
# would be matched as a JWT and the host would be dropped.
$script:A3RedactUrlJwtPathRegex  = '(?<=[^:/])(/)([A-Za-z0-9_\-]{2,})\.([A-Za-z0-9_\-]{2,})\.([A-Za-z0-9_\-]{2,})(?=/|\?|\#|$)'

# On Windows the filesystem is case-insensitive; the operator may pass a
# DiagnosticsPath whose drive letter or segment casing differs from the
# resolved SinkRoot. Use OrdinalIgnoreCase there so the boundary check
# matches reality. On POSIX keep Ordinal so the check stays strict.
$script:A3PathCompare = if ([System.IO.Path]::DirectorySeparatorChar -eq '\') {
    [System.StringComparison]::OrdinalIgnoreCase
} else {
    [System.StringComparison]::Ordinal
}

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
  prose or test payloads are preserved verbatim. Tokens that look like a
  URL are scanned for query-string credential parameters, and each
  `key=value` substring inside the URL is replaced with
  `key=<redacted>` while the rest of the URL (scheme, host, path, other
  query keys) is preserved.
#>
function ConvertTo-A3RedactedArgv {
    param([string]$Argv)
    if ($null -eq $Argv -or $Argv -eq '') {
        return ''
    }
    $tokens = $Argv -split '\s+'
    $out = @()
    foreach ($t in $tokens) {
        # URL detection: contains '://' or starts with http(s):// etc.
        # Inside such a token we apply a sequence of targeted credential
        # scrubbers so e.g.
        #   `?access_key=ABC&token=DEF`          -> `?access_key=<redacted>&token=<redacted>`
        #   `https://user:pass@host/path`         -> `https://<redacted>@host/path`
        #   `https://10.0.0.5/x`                  -> `https://<redacted>/x`
        #   `https://[2001:db8::1]/x`             -> `https://<redacted>/x`
        #   `https://admin@example.com/x`         -> `https://<redacted>/x`
        #   `https://h/p/eyJ.x.y/call`            -> `https://h/p/<redacted>/call`
        # After scrubbing we still `continue` so the per-token rule chain
        # does not re-match already-redacted substrings.
        if ($t -match '://' -or $t -match '^https?=' -or $t -match '^[a-z][a-z0-9+.\-]*://') {
            $scrubbed = $t
            # Order matters: user@host must run BEFORE userinfo, otherwise
            # the userinfo scrubber's `<redacted>@host` output would be
            # re-matched by the user@host scrubber and the host would be
            # dropped. user@host's regex `[^@/?#\s]+@[^@/?#\s]+` does not
            # accept `:` in the user slot, so `user:pass@host` (the userinfo
            # shape) does NOT match it and survives until the userinfo scrub.
            $scrubbed = [System.Text.RegularExpressions.Regex]::Replace(
                $scrubbed,
                $script:A3RedactUrlUserHostRegex,
                { param($m) ($m.Groups[1].Value + '<redacted>') }
            )
            $scrubbed = [System.Text.RegularExpressions.Regex]::Replace(
                $scrubbed,
                $script:A3RedactUrlUserInfoRegex,
                { param($m) ($m.Groups[1].Value + '<redacted>@') }
            )
            $scrubbed = [System.Text.RegularExpressions.Regex]::Replace(
                $scrubbed,
                $script:A3RedactUrlQueryRegex,
                { param($m) ($m.Groups[1].Value + $m.Groups[2].Value + $m.Groups[3].Value + '<redacted>') }
            )
            $scrubbed = [System.Text.RegularExpressions.Regex]::Replace(
                $scrubbed,
                $script:A3RedactUrlIPv4HostRegex,
                { param($m) ($m.Groups[1].Value + '<redacted>') }
            )
            $scrubbed = [System.Text.RegularExpressions.Regex]::Replace(
                $scrubbed,
                $script:A3RedactUrlIPv6HostRegex,
                { param($m) ($m.Groups[1].Value + '<redacted>') }
            )
            # JWT-in-path: requires a `/` immediately before so a host like
            # `api.example.com` at the start of the URL is NOT mistaken for
            # a JWT (the path begins at the first `/` after the host).
            $scrubbed = [System.Text.RegularExpressions.Regex]::Replace(
                $scrubbed,
                $script:A3RedactUrlJwtPathRegex,
                { param($m) ($m.Groups[1].Value + '<redacted>') }
            )
            $out += $scrubbed
            continue
        }
        if ($t -match $script:A3RedactKeyValueRegex) {
            $out += ('<redacted>')
        } elseif ($t -match $script:A3RedactKnownPrefixRegex) {
            $out += ('<redacted>')
                } elseif ($t -match $script:A3RedactJwtRegex) {
            $out += ('<redacted>')
                } elseif ($t -match $script:A3RedactLongBlobRegex) {
            $out += ('<redacted>')
                } elseif ($t -match $script:A3RedactIPv4Regex) {
            $out += ('<redacted>')
                } elseif ($t -match $script:A3RedactIPv6Regex) {
            $out += ('<redacted>')
                } elseif ($t -match $script:A3RedactUserHostRegex) {
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
  Resolve an operator-supplied path to its canonical absolute form.

.DESCRIPTION
  GetFullPath collapses '.' and '..' segments so 'sink\..\outside\file'
  cannot bypass a downstream prefix check by hiding the divergence in
  an un-normalized segment. The function additionally rejects the
  Windows drive-relative form 'C:file' where IsPathRooted returns true
  but there is no separator between the drive letter and the rest;
  such a path is ambiguous (relative to the current directory on that
  drive) and must not be accepted for a sink-bound write.
#>
function Resolve-A3DiagnosticsPath {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][ValidateSet('diagnostics','sink_root')][string]$PathRole
    )
    if (-not [System.IO.Path]::IsPathRooted($Path)) {
        if ($PathRole -eq 'sink_root') {
            throw 'a3_diagnostics_sink_root_not_absolute'
        }
        throw 'a3_diagnostics_path_not_absolute'
    }
    # Windows drive-relative form (e.g. 'C:file') is rooted but lacks
    # the explicit separator between the drive and the remainder, so
    # GetFullPath interprets it as relative to the current directory on
    # that drive. Reject explicitly.
    if ($Path -match '^[A-Za-z]:[^/\\]') {
        if ($PathRole -eq 'sink_root') {
            throw 'a3_diagnostics_sink_root_drive_relative'
        }
        throw 'a3_diagnostics_path_drive_relative'
    }
    try {
        return [System.IO.Path]::GetFullPath($Path)
    } catch {
        if ($PathRole -eq 'sink_root') {
            throw 'a3_diagnostics_sink_root_invalid'
        }
        throw 'a3_diagnostics_path_invalid'
    }
}

<#
.SYNOPSIS
  Walk the directory chain from RootAbs (inclusive) down to TargetParent
  (inclusive) and confirm every segment is a real directory whose
  FileAttributes.ReparsePoint bit is unset. Closes the 'a junction or
  symlink inside the operator-controlled tree redirects the write'
  gap that a single Test-Path + GetAttributes(parentDir) pair misses.
#>
function Test-A3AncestorChainNoReparse {
    param(
        [Parameter(Mandatory)][string]$RootAbs,
        [Parameter(Mandatory)][string]$TargetParent
    )
    $sep = [System.IO.Path]::DirectorySeparatorChar
        if ($RootAbs.EndsWith($sep)) {
            $rootWithSep = $RootAbs
        } else {
            $rootWithSep = $RootAbs + $sep
        }
        if ($TargetParent -ne $RootAbs -and -not $TargetParent.StartsWith($rootWithSep, $script:A3PathCompare)) {
            throw 'a3_diagnostics_sink_root_violation'
        }
    $cursor = $TargetParent
    while ($true) {
        if (-not (Test-Path -LiteralPath $cursor -PathType Container)) {
            throw 'a3_diagnostics_ancestor_segment_missing'
        }
        $segAttrs = [System.IO.File]::GetAttributes($cursor)
        if (($segAttrs -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'a3_diagnostics_ancestor_is_symlink'
        }
        if ($cursor -eq $RootAbs) { break }
        $parent = Split-Path -Parent $cursor
        if ($parent -eq $cursor) { break }
        $cursor = $parent
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

  The optional -SinkRoot parameter, when supplied, MUST be the absolute
  parent directory the operator controls. The function then enforces:

    - DiagnosticsPath resolves to an absolute path through
      [System.IO.Path]::GetFullPath (so 'sink\..\outside\file' cannot
      bypass the sink boundary via raw prefix matching).
    - DiagnosticsPath is NOT a Windows drive-relative form such as
      'C:file' (where IsPathRooted returns true but there is no
      separator between the drive and the rest).
    - DiagnosticsPath is strictly nested under the resolved SinkRoot
      using an Ordinal string-prefix compare with a trailing
      directory separator on the sink side.
    - Every directory segment from the resolved SinkRoot (inclusive)
      down to DiagnosticsPath's parent (inclusive) is a real directory
      (FileAttributes.ReparsePoint bit is unset). This closes the
      'junctions or symlinks inside the trusted tree redirect the
      write' gap that a single Test-Path + GetAttributes(parentDir)
      pair misses.
    - If the file already exists and contains an integrity_footer
      line, the function refuses with
      'a3_diagnostics_footer_already_present' to prevent silent
      pollution of an already-finalized receipt.
#>
function Persist-A3PerCommandEvidence {
    param(
        [Parameter(Mandatory)][string]$DiagnosticsPath,
        [Parameter(Mandatory)][pscustomobject]$Record,
        [string]$SinkRoot
    )

    $resolvedDiag = Resolve-A3DiagnosticsPath -Path $DiagnosticsPath -PathRole 'diagnostics'

    if ($SinkRoot) {
        $resolvedSink = Resolve-A3DiagnosticsPath -Path $SinkRoot -PathRole 'sink_root'
        $sep = [System.IO.Path]::DirectorySeparatorChar
        $normalizedSink = $resolvedSink.TrimEnd($sep) + $sep
        $normalizedDiag = $resolvedDiag.Replace([System.IO.Path]::AltDirectorySeparatorChar, $sep)
        if (-not $normalizedDiag.StartsWith($normalizedSink, $script:A3PathCompare)) {
            throw 'a3_diagnostics_sink_root_violation'
        }
        Test-A3AncestorChainNoReparse -RootAbs $resolvedSink -TargetParent (Split-Path -Parent $resolvedDiag)
    }

    $parentDir = Split-Path -Parent $resolvedDiag
    if (-not (Test-Path -LiteralPath $parentDir -PathType Container)) {
        throw 'a3_diagnostics_parent_missing'
    }
    $parentAttrs = [System.IO.File]::GetAttributes($parentDir)
    if (($parentAttrs -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'a3_diagnostics_parent_is_symlink'
    }

    # Refuse to pollute an already-finalized receipt. If the file exists
    # AND its last non-empty line is an integrity_footer, the previous
    # replay already closed this sink.
        if (Test-Path -LiteralPath $resolvedDiag) {
            $existingRaw = Get-Content -LiteralPath $resolvedDiag -Encoding UTF8
        foreach ($existing in $existingRaw) {
            if ([string]::IsNullOrWhiteSpace($existing)) { continue }
            try {
                $existingObj = $existing | ConvertFrom-Json -ErrorAction Stop
            } catch {
                $lineSha = Get-A3LowerHexSha256 -Bytes ([Text.Encoding]::UTF8.GetBytes($existing))
                throw ('a3_diagnostics_partial_line:' + $lineSha)
            }
            if ($existingObj.kind -eq 'integrity_footer') {
                throw 'a3_diagnostics_footer_already_present'
            }
        }
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

    Write-A3FsyncedAppend -Path $resolvedDiag -Bytes $jsonBytes

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
            [Parameter(Mandatory)][string]$RunLabel,
            [string]$SinkRoot
        )

        $resolvedDiag = Resolve-A3DiagnosticsPath -Path $DiagnosticsPath -PathRole 'diagnostics'
        if ($SinkRoot) {
            $resolvedSink = Resolve-A3DiagnosticsPath -Path $SinkRoot -PathRole 'sink_root'
            $sep = [System.IO.Path]::DirectorySeparatorChar
            $normalizedSink = $resolvedSink.TrimEnd($sep) + $sep
            $normalizedDiag = $resolvedDiag.Replace([System.IO.Path]::AltDirectorySeparatorChar, $sep)
            if (-not $normalizedDiag.StartsWith($normalizedSink, $script:A3PathCompare)) {
                throw 'a3_diagnostics_sink_root_violation'
            }
            Test-A3AncestorChainNoReparse -RootAbs $resolvedSink -TargetParent (Split-Path -Parent $resolvedDiag)
        }
        $parentDir = Split-Path -Parent $resolvedDiag
        if (-not (Test-Path -LiteralPath $parentDir -PathType Container)) {
            throw 'a3_diagnostics_parent_missing'
        }
        $parentAttrs = [System.IO.File]::GetAttributes($parentDir)
        if (($parentAttrs -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'a3_diagnostics_parent_is_symlink'
        }

        if (-not (Test-Path -LiteralPath $resolvedDiag)) {
            throw 'a3_diagnostics_file_missing'
        }

        # First pass: strict JSON parse every line. Any line that does not parse
        # as a complete JSON object is treated as a partial/garbled write and
        # the function throws 'a3_diagnostics_partial_line:<sha256-of-line>'. The
        # previous implementation used a permissive regex match that silently
        # skipped malformed lines; that let a partial-write footer pass even
        # though the operator's evidence was incomplete.
                $rawLines = Get-Content -LiteralPath $resolvedDiag -Encoding UTF8
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

                Write-A3FsyncedAppend -Path $resolvedDiag -Bytes $footerBytes

        # Disk readback: re-open the file and re-parse every line. The
        # recomputed aggregate must match the footer.jsonl_sha256 byte for
        # byte; a mismatch means the on-disk content diverged from what the
        # in-memory aggregation saw (truncated write, racing writer, etc.).
        # This is the only integrity check that proves the bytes the operator
        # will read back later actually correspond to the hash we claim.
                $verifyRawLines = Get-Content -LiteralPath $resolvedDiag -Encoding UTF8
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
                    diagnostics_path   = $resolvedDiag
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
            $persistArgs = @{
                DiagnosticsPath = $DiagnosticsPath
                Record          = $record
            }
            if ($SinkRoot) { $persistArgs['SinkRoot'] = $SinkRoot }
            Persist-A3PerCommandEvidence @persistArgs
        }
        'summary' {
            if (-not $RunLabel) {
                throw 'a3_diagnostics_cli_summary_run_label_required'
            }
            $summaryArgs = @{
                DiagnosticsPath = $DiagnosticsPath
                RunLabel        = $RunLabel
            }
            if ($SinkRoot) { $summaryArgs['SinkRoot'] = $SinkRoot }
            New-A3DiagnosticsRunSummary @summaryArgs
        }
        default {
            throw ('a3_diagnostics_cli_unknown_action:' + $Action)
        }
    }
}