@echo off
chcp 65001 >nul
title HELL FIRE - Game Launcher
color 0C
cls

echo.
echo  ██╗  ██╗ █████╗ ██╗     ██╗      ██████╗ ██╗    ██╗███████╗████████╗██████╗  ██████╗ ██╗    ██╗
echo  ╚██╗██╔╝██╔══██╗██║     ██║     ██╔═══██╗██║    ██║██╔════╝╚══██╔══╝██╔══██╗██║    ██║
echo   ╚███╔╝ ███████║██║     ██║     ██║   ██║██║ █╗ ██║█████╗     ██║   ██████╔╝██║ █╗ ██║
echo   ██╔██╗ ██╔══██║██║     ██║     ██║   ██║██║███╗██║██╔══╝     ██║   ██╔══██╗██║███╗██║
echo  ██╔╝ ██╗██║  ██║███████╗███████╗╚██████╔╝╚███╔███╔╝███████╗   ██║   ██║  ██║╚███╔███╔╝
echo  ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝ ╚═════╝  ╚══╝╚══╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚══╝╚══╝
echo.
echo  ┌──────────────────────────────────────────────────────────────┐
echo  │  A roguelike action RPG - Co-op Multiplayer Enabled         │
echo  │  Created by devils_call                                      │
echo  └──────────────────────────────────────────────────────────────┘
echo.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please install Node.js 22+ from: https://nodejs.org/
    echo Then restart this script.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js found:
node --version
echo.

:: Check npm
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not installed!
    echo Please reinstall Node.js with npm included.
    pause
    exit /b 1
)

echo [OK] npm found:
npm --version
echo.

:: Install dependencies if needed
if not exist "node_modules" (
    echo [SETUP] First time setup - installing dependencies...
    echo This may take a minute...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] Installation failed! Check your internet connection.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencies installed!
    echo.
) else (
    echo [OK] Dependencies already installed.
    echo.
)

:: Main menu
echo  What do you want to do?
echo.
echo   [1] Play on PC (opens browser)
echo   [2] Build Android APK
echo   [3] Exit
echo.
set /p choice=Enter choice [1-3]: 

if "%choice%"=="2" goto build_apk
if "%choice%"=="3" goto exit
if not "%choice%"=="1" (
    echo Invalid choice.
    pause
    exit /b 1
)

:: Start the game
echo.
echo [START] Starting HELL FIRE...
echo.
echo  The game will open in your browser shortly.
echo  Co-op relay server will also start on port 3001.
echo.
echo  ┌──────────────────────────────────────────────────────────┐
echo  │  Controls:                                               │
echo  │  WASD - Move   ^|  Left Click - Attack   ^|  SPACE - Dodge │
echo  │  E - Inventory ^|  L - Level Up         ^|  ESC - Settings │
echo  └──────────────────────────────────────────────────────────┘
echo.
echo  Press Ctrl+C in this window to stop the game.
echo.

:: Start game server in background window
start "HELL FIRE - Game (port 5173)" cmd /c "npm run dev"

:: Wait for game server to boot
timeout /t 4 /nobreak >nul

:: Start co-op relay in background window
start "HELL FIRE - Co-op Relay (port 3001)" cmd /c "npm run server"

:: Wait a moment then open browser
timeout /t 2 /nobreak >nul
start http://localhost:5173

echo [OK] Game launched! Check your browser.
echo.
echo  Two helper windows were opened (Game + Co-op Relay).
echo  Keep them running while you play.
echo.
echo  Close this window to stop everything.
echo.

:: Keep this window open and show relay logs
echo ========== Co-op Relay Logs ==========
npm run server

goto end

:build_apk
echo.
echo [BUILD APK] Starting Android APK build...
echo.

:: Check for Android SDK
set "ANDROID_HOME="
if defined ANDROID_HOME set "ANDROID_HOME=%ANDROID_HOME%"
if defined ANDROID_SDK_ROOT set "ANDROID_HOME=%ANDROID_SDK_ROOT%"
if not defined ANDROID_HOME if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not defined ANDROID_HOME if exist "%LOCALAPPDATA%\Android\AndroidSDK" set "ANDROID_HOME=%LOCALAPPDATA%\Android\AndroidSDK"
if not defined ANDROID_HOME if exist "C:\Users\gajay\AppData\Local\Android\Sdk" set "ANDROID_HOME=C:\Users\gajay\AppData\Local\Android\Sdk"

if not defined ANDROID_HOME (
    echo [WARN] Android SDK not found.
    echo.
    echo  To build the APK:
    echo   1. Install Android Studio: https://developer.android.com/studio
    echo   2. Open the android\ folder in Android Studio
    echo   3. Click Build -^> Build APK
    echo   4. APK will be at: android\app\build\outputs\apk\debug\app-debug.apk
    echo.
    echo  Opening android\ folder in File Explorer...
    explorer android
    pause
    goto end
)

echo [OK] Android SDK: %ANDROID_HOME%
echo.

:: Create local.properties if missing
if not exist "android\local.properties" (
    echo [INFO] Creating android\local.properties...
    echo sdk.dir=%ANDROID_HOME% > android\local.properties
    echo [OK] local.properties created.
    echo.
)

:: Build web assets
echo [1/3] Building web assets...
call npm run build
if errorlevel 1 (
    echo [ERROR] Build failed!
    pause
    goto end
)
echo [OK] Web assets built.
echo.

:: Sync with Capacitor
echo [2/3] Syncing assets to Android project...
call npx cap sync android
if errorlevel 1 (
    echo [ERROR] Capacitor sync failed!
    pause
    goto end
)
echo [OK] Assets synced.
echo.

:: Build APK
echo [3/3] Building APK (this may take 5-10 minutes)...
cd android
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo.
    echo [ERROR] APK build failed!
    echo Try opening android\ folder in Android Studio.
    cd ..
    pause
    goto end
)
cd ..

echo.
echo ============================================
echo  APK BUILD SUCCESSFUL!
echo ============================================
echo.
echo  Output: android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo  To install on your phone:
echo   1. Copy app-debug.apk to your phone
echo   2. Open it to install
echo   3. Enable "Install unknown apps" if prompted
echo.
echo  Opening APK folder...
explorer android\app\build\outputs\apk\debug

:end
pause
