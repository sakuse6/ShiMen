@echo off
cd /d "%~dp0"
node scripts\lmentor-codex-bridge.mjs 1>> bridge.stdout.log 2>> bridge.stderr.log
