@echo off
setlocal enabledelayedexpansion

set "ROOT=%CD%"
set "SHARED_SRC=%ROOT%\packages\shared\src"

echo Creating junctions for shared sources...

:: ----- Server -----
set "SERVER_LINK=%ROOT%\packages\server\src\shared"
if exist "%SERVER_LINK%" (
    rmdir "%SERVER_LINK%" 2>nul
    if exist "%SERVER_LINK%" (
        echo [ERROR] Cannot remove existing junction: %SERVER_LINK%
        exit /b 1
    )
)
mklink /J "%SERVER_LINK%" "%SHARED_SRC%" >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create junction for server
    exit /b 1
)
echo [OK] Server junction created

:: ----- Client (если существует) -----
if exist "%ROOT%\packages\client\src" (
    set "CLIENT_LINK=%ROOT%\packages\client\src\shared"
    if exist "!CLIENT_LINK!" (
        rmdir "!CLIENT_LINK!" 2>nul
    )
    mklink /J "!CLIENT_LINK!" "%SHARED_SRC%" >nul 2>&1
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to create junction for client
        exit /b 1
    )
    echo [OK] Client junction created
) else (
    echo [SKIP] Client folder not found, skipping client junction
)

echo All junctions created successfully.
exit /b 0