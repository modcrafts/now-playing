@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "NP_NODE=node.exe"
set "NP_USE_FNM="
call :check_version >nul 2>nul
if not errorlevel 1 goto node_ready

where.exe fnm.exe >nul 2>nul
if errorlevel 1 goto bundled_node
set "NP_USE_FNM=1"
call :check_version >nul 2>nul
if not errorlevel 1 goto node_ready

:bundled_node
set "NP_USE_FNM="
set "NP_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
call :check_version >nul 2>nul
if not errorlevel 1 goto node_ready
echo Node.js 18 or later was not found.
where.exe fnm.exe >nul 2>nul
if errorlevel 1 (
    echo Install Node.js from https://nodejs.org/ and run this file again.
) else (
    echo Install an LTS version with: fnm install --lts
    echo Then run this file again.
)
if /i "%~1"=="--check" exit /b 1
pause
exit /b 1
:node_ready
if /i "%~1"=="--check" goto check_node
echo Now Playing - Apple Music for OBS
echo Dashboard: http://127.0.0.1:3963
echo Keep this window open while streaming. Press Ctrl+C to stop.
call :run_node server.mjs
set "NP_EXIT=%ERRORLEVEL%"
if "%NP_EXIT%"=="0" exit /b 0
echo.
echo The service exited with code %NP_EXIT%.
pause
exit /b %NP_EXIT%
:check_node
call :run_node --version
exit /b %ERRORLEVEL%

:check_version
call :run_node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)"
exit /b %ERRORLEVEL%

:run_node
if defined NP_USE_FNM goto run_fnm_node
"%NP_NODE%" %*
exit /b %ERRORLEVEL%

:run_fnm_node
fnm.exe exec --resolve-engines=true node.exe %*
exit /b %ERRORLEVEL%
