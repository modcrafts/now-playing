@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "NP_NODE=node"
where.exe node >nul 2>nul
if not errorlevel 1 goto node_ready
set "NP_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%NP_NODE%" goto node_ready
echo Node.js 18 or later was not found.
echo Install Node.js from https://nodejs.org/ and run this file again.
if /i "%~1"=="--check" exit /b 1
pause
exit /b 1
:node_ready
if /i "%~1"=="--check" goto check_node
echo Now Playing - Apple Music for OBS
echo Dashboard: http://127.0.0.1:3963
echo Keep this window open while streaming. Press Ctrl+C to stop.
"%NP_NODE%" server.mjs
set "NP_EXIT=%ERRORLEVEL%"
if "%NP_EXIT%"=="0" exit /b 0
echo.
echo The service exited with code %NP_EXIT%.
pause
exit /b %NP_EXIT%
:check_node
"%NP_NODE%" --version
exit /b %ERRORLEVEL%
