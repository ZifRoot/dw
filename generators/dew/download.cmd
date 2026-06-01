@echo off
set URL="http://100.123.252.125:8081/api/openapi.json"
set TARGET=".\specs\openapi.json"
set TEMP=%TARGET%.tmp

curl -L -s -o "%TEMP%" "%URL%"
if %errorlevel% equ 0 (
    del /f /q "%TARGET%" 2>nul
    move /y "%TEMP%" "%TARGET%" >nul
) else (
    del /f /q "%TEMP%" 2>nul
)