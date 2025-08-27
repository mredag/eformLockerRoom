@echo off
echo Running Card Assignment Flow Tests
echo ===================================

echo.
echo Checking if Node.js is available...
node --version
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    exit /b 1
)

echo.
echo Running comprehensive card assignment tests...
node scripts/run-card-assignment-tests.js

if %errorlevel% neq 0 (
    echo.
    echo Tests failed! Please check the output above.
    exit /b 1
) else (
    echo.
    echo All tests passed successfully!
)

pause