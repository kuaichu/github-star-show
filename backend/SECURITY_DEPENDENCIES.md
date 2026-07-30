# Dependency audit notes

Audit date: 2026-07-26

Commands:

```powershell
npm audit --json
npm ls express body-parser qs --all
```

No dependency was upgraded in this reliability batch. The audit reports one low
and two moderate entries, with no high or critical findings.

| Package | Installed path/version | Advisory | Reachability in this backend |
| --- | --- | --- | --- |
| `body-parser` | `express > body-parser@1.20.5` | GHSA-v422-hmwv-36x6, low | The vulnerable condition requires an invalid `limit` value to disable enforcement. `app.js` supplies the constant valid value `100kb`; request input and environment variables cannot alter it. Not reachable through current routes. |
| `qs` | `express > qs@6.14.2`; `body-parser > qs@6.15.1` | GHSA-q8mj-m7cp-5q26, moderate | The crash is in `qs.stringify` with comma-format arrays and `encodeValuesOnly`. The application never imports or calls `qs.stringify`; Express request query parsing does not use that vulnerable call shape. Not reachable through current request handlers. |
| `express` | direct `express@4.22.1` | moderate through `qs` | This is the transitive `qs` finding above, not a separate reachable Express handler flaw. Current code does not exercise the affected stringify API. |

These findings should still be removed in the next dependency maintenance
window. Re-run the audit after any Express/body-parser query serialization code
is introduced; the reachability conclusions above are specific to the current
code.
