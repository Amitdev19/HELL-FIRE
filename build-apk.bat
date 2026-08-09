@echo off
chcp 65001 >nul
title HELL FIRE - APK Builder
color 0B
cls

echo.
echo  ██╗  ██╗ █████╗ ██╗     ██╗      ██████╗ ██╗    ██╗███████╗████████╗██████╗  ██████╗ ██╗    ██╗
echo  ╚██╗██╔╝██╔══██╗██║     ██║     ██╔═══██╗██║    ██║██╔════╝╚══██╔══╝██╔══██╗██║    ██║
echo   ╚███╔╝ ███████║██║     ██║     ██║   ██║██║ █╗ ██║█████╗     ██║   ██████╔╝██║ █╗ ██║
echo   ██╔██╗ ██╔══██║██║     ██║     ██║   ██║██║███╗██║██╔══╝     ██║   ██╔══██╗██║███╗██║
echo  ██╔╝ ██╗██║  ██║███████╗███████╗╚██████╔╝╚███╔███╔╝███████╗   ██║   ██║  ██║╚███╔███╔╝
echo  ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝ ╚═════╝  ╚══╝╚══╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚══╝╚══╝
echo.
echo  ┌──────────────────────────────────────────────────────────────────┐
echo  │  APK Builder - Build HELL FIRE for Android                      │
echo  └──────────────────────────────────────────────────────────────────┘
echo.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js 22+ from: https://nodejs.org/
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
    pause
    exit /b 1
)

echo [OK] npm found:
npm --version
echo.

:: Install dependencies if needed
if not exist "node_modules" (
    echo [SETUP] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed!
        pause
        exit /b 1
    )
    echo.
)

:: Check for Android SDK
set "ANDROID_HOME="
if defined ANDROID_HOME (
    set "ANDROID_HOME=%ANDROID_HOME%"
)
if defined ANDROID_SDK_ROOT (
    set "ANDROID_HOME=%ANDROID_SDK_ROOT%"
)

:: Also check common install locations
if not defined ANDROID_HOME (
    if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
)
if not defined ANDROID_HOME (
    if exist "%LOCALAPPDATA%\Android\AndroidSDK" set "ANDROID_HOME=%LOCALAPPDATA%\Android\AndroidSDK"
)
if not defined ANDROID_HOME (
    if exist "C:\Users\gajay\AppData\Local\Android\Sdk" set "ANDROID_HOME=C:\Users\gajay\AppData\Local\Android\Sdk"
)

if not defined ANDROID_HOME (
    echo [WARN] Android SDK not found.
    echo.
    echo  To build the APK, install one of:
    echo.
    echo  1. Android Studio (recommended, easiest):
    echo     https://developer.android.com/studio
    echo     - Install and open this project's android\ folder
    echo     - Click Build -^> Build APK
    echo     - APK appears at: android\app\build\outputs\apk\debug\app-debug.apk
    echo.
    echo  2. Command-line SDK tools:
    echo     https://developer.android.com/studio#command-tools
    echo     Then set ANDROID_HOME and run this script again.
    echo.
    pause
    exit /b 1
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
    exit /b 1
)
echo [OK] Web assets built.
echo.

:: Sync with Capacitor
echo [2/3] Syncing assets to Android project...
call npx cap sync android
if errorlevel 1 (
    echo [ERROR] Capacitor sync failed!
    pause
    exit /b 1
)
echo [OK] Assets synced.
echo.

:: Build APK
echo [3/3] Building APK (this may take a few minutes)...
cd android
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo.
    echo [ERROR] APK build failed!
    echo Try opening the android\ folder in Android Studio.
    cd ..
    pause
    exit /b 1
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
echo   2. Open it on your phone to install
echo   3. Enable "Unknown Sources" if prompted
echo.
echo  NOTE: You may need to sign the APK for distribution.
echo  Use Android Studio ^> Build ^> Generate Signed APK
echo.
pause
