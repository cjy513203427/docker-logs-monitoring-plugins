@echo off
rem Kills any orphaned `docker logs -f <id>` processes left running from a
rem *previous*, uncleanly-terminated session of this extension's UI (e.g. the
rem panel's script crashed before a single React effect cleanup could run).
rem
rem Only ever matches a specific container ID the extension itself passes in
rem (see cleanupOrphanedLogStreams() in ui/src/api/containers.ts) combined
rem with "docker" and "logs" both appearing in the command line - never a
rem bare "docker logs" pattern - so a user's own unrelated `docker logs -f`
rem session in a separate terminal is never touched.
if "%~1"=="" exit /b 0
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$ids = ('%*' -split ' ') | Where-Object { $_ }; foreach ($id in $ids) { Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'docker' -and $_.CommandLine -match 'logs' -and $_.CommandLine -match [regex]::Escape($id) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }"
