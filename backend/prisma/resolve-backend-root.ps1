param(
  [string] $StartPath = (Get-Location).Path,
  [string] $ConfirmBackendRoot = ""
)

$ErrorActionPreference = 'Stop'
$ResolvedStart = [IO.Path]::GetFullPath($StartPath)
$Candidates = @(
  $ResolvedStart
  (Join-Path $ResolvedStart 'backend')
) | Select-Object -Unique

$Matches = @($Candidates | Where-Object {
  (Test-Path -LiteralPath (Join-Path $_ 'package.json') -PathType Leaf) -and
  (Test-Path -LiteralPath (Join-Path $_ 'prisma\schema.prisma') -PathType Leaf) -and
  (Test-Path -LiteralPath (Join-Path $_ 'prisma\migrations') -PathType Container)
})

if ($Matches.Count -ne 1) {
  throw "Expected exactly one backend root below '$ResolvedStart'; found $($Matches.Count)."
}

$BackendRoot = [IO.Path]::GetFullPath($Matches[0])
Write-Host "Resolved BackendRoot: $BackendRoot"
if ([String]::IsNullOrWhiteSpace($ConfirmBackendRoot)) {
  $ConfirmBackendRoot = Read-Host 'Type the exact absolute BackendRoot to continue'
}
if (-not [StringComparer]::OrdinalIgnoreCase.Equals(
  [IO.Path]::GetFullPath($ConfirmBackendRoot),
  $BackendRoot
)) {
  throw 'BackendRoot confirmation failed.'
}

Write-Output $BackendRoot
