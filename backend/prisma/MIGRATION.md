# SQLite production migration

Only three automatic paths are supported:

| State | Automatic action |
| --- | --- |
| fresh (no application tables and no `_prisma_migrations`) | `prisma migrate deploy` |
| exact legacy db-push (no history and exactly `legacy-schema.prisma`) | backup, resolve the baseline, deploy |
| complete current history (all repository migrations finished successfully) | deploy; normally a no-op |

Every other state is a hard-stop for manual reconciliation. This explicitly
includes partial history or schema, failed history, historyless-current,
resolved-only history, unknown or duplicate rows, checksum drift, and a gap in
history. Do not infer that migration SQL ran from a current-looking schema.

Do not use `prisma db push` on a persistent database.

## Resolve the repository paths

Start in either the repository root or `backend`. The array wrappers are
intentional: PowerShell otherwise degrades a one-element result to a scalar,
and indexing it can return a single character.

```powershell
$ErrorActionPreference = 'Stop'
$ResolverCandidates = @(@(
  (Join-Path (Get-Location).Path 'backend\prisma\resolve-backend-root.ps1')
  (Join-Path (Get-Location).Path 'prisma\resolve-backend-root.ps1')
) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
if ($ResolverCandidates.Count -ne 1) {
  throw "Expected exactly one BackendRoot resolver; found $($ResolverCandidates.Count)."
}
$BackendRoot = & $ResolverCandidates[0] -StartPath (Get-Location).Path
Set-Location -LiteralPath $BackendRoot
$SchemaPath = Join-Path $BackendRoot 'prisma\schema.prisma'
$LegacySchemaPath = Join-Path $BackendRoot 'prisma\legacy-schema.prisma'
$MigrationsRoot = Join-Path $BackendRoot 'prisma\migrations'
```

`resolve-backend-root.ps1` supports Windows PowerShell 5.1 and PowerShell 7 and
fails closed outside those two entry directories.

## Bind and verify the database

Stop every process that can access SQLite. Supply the deployed database's
absolute path; do not derive it from a sample `dev.db` path.

```powershell
$DbPath = 'C:\ProgramData\GitHub Star Show\data\production.db' # replace
$DbPath = [IO.Path]::GetFullPath($DbPath)
if (-not (Test-Path -LiteralPath $DbPath -PathType Leaf)) {
  throw "Database does not exist: $DbPath"
}
$Sqlite = Get-Command sqlite3 -ErrorAction Stop
function Invoke-SqliteLines([string] $Path, [string] $Sql) {
  $Output = @(& $Sqlite.Source -batch -bail $Path $Sql 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "sqlite3 failed with exit code $LASTEXITCODE" }
  return @($Output | ForEach-Object { "$($_)".Trim() } | Where-Object { $_ -ne '' })
}
$OpenedPathLines = @(Invoke-SqliteLines $DbPath "SELECT file FROM pragma_database_list WHERE name='main';")
if ($OpenedPathLines.Count -ne 1) { throw 'SQLite did not report exactly one main path.' }
$OpenedPath = [IO.Path]::GetFullPath($OpenedPathLines[0])
if (-not [StringComparer]::OrdinalIgnoreCase.Equals($OpenedPath, $DbPath)) {
  throw "SQLite opened a different file: $OpenedPath"
}
$SourceIntegrity = @(Invoke-SqliteLines $DbPath 'PRAGMA integrity_check;')
if ($SourceIntegrity.Count -ne 1 -or $SourceIntegrity[0] -cne 'ok') {
  throw 'Source integrity check failed.'
}
$SourceForeignKeys = @(Invoke-SqliteLines $DbPath 'PRAGMA foreign_key_check;')
if ($SourceForeignKeys.Count -ne 0) { throw 'Source foreign-key check failed.' }
$JournalMode = @(Invoke-SqliteLines $DbPath 'PRAGMA journal_mode;')
if ($JournalMode.Count -ne 1 -or $JournalMode[0] -cne 'delete') {
  throw 'Only a stopped database in delete journal mode is supported.'
}
$PrismaDatabasePath = $DbPath.Replace('\', '/')
$env:DATABASE_URL = "file:$PrismaDatabasePath"
```

The database and any `-journal`, `-wal`, or `-shm` sidecar can contain GitHub
tokens, sessions, and private project data. Keep the backup outside the
repository when possible, restrict its ACL/file permissions, and securely
delete it only after the migrated application has started and been checked.

## Classify before changing anything

Inspect application objects and migration history. Do not run deploy or
resolve until the state is one of the three allowed rows above.

```sql
SELECT type, name FROM sqlite_master
WHERE type IN ('table','view','trigger') ORDER BY type, name;
SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
FROM _prisma_migrations ORDER BY started_at;
```

A legacy candidate with **any** row whose `type IN ('view','trigger')` is a
hard-stop. Do not analyze whether the object depends on an application table.

Complete current history means exactly one finished, non-rolled-back row for
every directory in `prisma/migrations`, in order, with its exact SHA-256
checksum; the baseline may have `applied_steps_count` 0 or 1, while migrations
2 through 5 must have `applied_steps_count=1`. Any absent, extra, duplicate, unfinished,
rolled-back, zero-step, or checksum-mismatched row is manual reconciliation.
Thus partial is a hard-stop/manual state, failed is a hard-stop/manual state,
historyless-current is a hard-stop/manual state, and resolved-only is a
hard-stop/manual state.

## Fresh

For an intentionally empty database with neither application tables nor
`_prisma_migrations`:

```powershell
npx --no-install prisma migrate deploy
```

## Complete current history

After the exact history check above:

```powershell
npx --no-install prisma migrate deploy
```

Do not deploy a partial history. Pending migrations are not an automatic state
in this runbook even if the recorded prefix appears plausible.

## Exact legacy db-push

This is the only historyless existing database that can proceed automatically.
It must have no `_prisma_migrations`, VIEW, or TRIGGER. First compare the actual
database directly with the repository's official `legacy-schema.prisma` using
Prisma's official `migrate diff`. Exit code 0 means equal; exit code 2 means
different and is a hard-stop; exit code 1 is an error and is also a hard-stop.

```powershell
& node (Join-Path $BackendRoot 'node_modules\prisma\build\index.js') migrate diff `
  --exit-code `
  --from-schema-datamodel $LegacySchemaPath `
  --to-url $env:DATABASE_URL
if ($LASTEXITCODE -ne 0) {
  throw 'Legacy database does not exactly match prisma/legacy-schema.prisma.'
}
```

Only after that exact diff succeeds, create and verify a unique backup. Never
reuse a fixed backup name and never use a hand-built temporary directory.

```powershell
$Timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffffffZ')
$BackupPath = "$DbPath.before-migrate.$Timestamp.$([Guid]::NewGuid().ToString('N')).bak"
if (Test-Path -LiteralPath $BackupPath) { throw 'Backup path already exists.' }
[IO.File]::Copy($DbPath, $BackupPath, $false)
$BackupIntegrity = @(Invoke-SqliteLines $BackupPath 'PRAGMA integrity_check;')
if ($BackupIntegrity.Count -ne 1 -or $BackupIntegrity[0] -cne 'ok') {
  throw 'Backup integrity check failed.'
}
$BackupForeignKeys = @(Invoke-SqliteLines $BackupPath 'PRAGMA foreign_key_check;')
if ($BackupForeignKeys.Count -ne 0) { throw 'Backup foreign-key check failed.' }
```

Keep all writers stopped and the same `DATABASE_URL` bound, then run only:

```powershell
npx --no-install prisma migrate resolve --applied 20260725000000_baseline
npx --no-install prisma migrate deploy
```

After deployment, rerun `PRAGMA integrity_check` and
`PRAGMA foreign_key_check`, start the application, and verify it before removing
the protected backup.
