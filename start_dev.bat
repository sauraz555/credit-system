@echo off
title Nepal Credit Reporting Mechanism - Dev Server
echo ===============================================================================
echo     Nepal Credit Reporting Mechanism (नेपाल कर्जा सूचना प्रणाली)
echo     Starting Autonomous Full-Stack Development Environment...
echo ===============================================================================
echo.

cd /d "%~dp0frontend"
echo [1/2] Checking npm dependencies in frontend...
if not exist "node_modules\" (
    echo Installing frontend dependencies...
    call npm install
)

echo.
echo [2/2] Launching Next.js Autonomous Full-Stack Server on http://localhost:3000...
echo.
echo  - Portal URL: http://localhost:3000
echo  - Language Switcher: EN / नेपाली
echo  - Test Accounts:
echo      * Admin:    admin@example.com    / Sprint2026!Admin (TOTP code: 123456)
echo      * Analyst:  analyst@example.com  / Sprint2026!Analyst (TOTP code: 123456)
echo      * Provider: provider@example.com / Sprint2026!Provider (TOTP code: 123456)
echo      * Consumer: subject@example.com  / Sprint2026!Subject (Direct Login)
echo.
call npm run dev
pause
