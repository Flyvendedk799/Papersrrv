@echo off
setlocal enabledelayedexpansion

REM Translate --workspace Windows paths to WSL /mnt/ paths
set "ARGS="
set "NEXT_IS_WORKSPACE=0"
for %%A in (%*) do (
    if "!NEXT_IS_WORKSPACE!"=="1" (
        set "WS=%%~A"
        REM Convert C:\path to /mnt/c/path
        set "DRIVE=!WS:~0,1!"
        call :lowercase DRIVE_LOWER !DRIVE!
        set "REST=!WS:~2!"
        set "REST=!REST:\=/!"
        set "ARGS=!ARGS! /mnt/!DRIVE_LOWER!!REST!"
        set "NEXT_IS_WORKSPACE=0"
    ) else if "%%~A"=="--workspace" (
        set "ARGS=!ARGS! --workspace"
        set "NEXT_IS_WORKSPACE=1"
    ) else (
        set "ARGS=!ARGS! %%~A"
    )
)

wsl -d Ubuntu -- /root/.local/bin/agent !ARGS!
exit /b %ERRORLEVEL%

:lowercase
    set "%1=%~2"
    for %%i in (a b c d e f g h i j k l m n o p q r s t u v w x y z) do (
        set "%1=!%1:%%i=%%i!"
    )
    exit /b
