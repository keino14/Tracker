@echo off
chcp 1251 >nul
setlocal EnableDelayedExpansion
title HabitFlow — запуск

:: ============================================================
:: HabitFlow — удобный запуск трекера привычек
:: Положите этот батник в корень репозитория (Tracker-main\run.bat)
:: ============================================================

set "PROJECT_DIR=%~dp0habit-tracker\habit-tracker"
for %%i in ("%PROJECT_DIR%") do set "PROJECT_DIR_SHORT=%%~si"
set "VENV_DIR=%PROJECT_DIR%\.venv"
for %%i in ("%VENV_DIR%") do set "VENV_DIR_SHORT=%%~si"
set "APP_ENTRY=app.main:app"
set "PORT=8000"

echo.
echo ========================================
echo   HabitFlow — трекер привычек
echo ========================================
echo.

:: ----- 1. Python -----
echo [1/6] Проверяю Python...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ОШИБКА] Python не найден в PATH. Установите Python 3.11+.
    pause
    exit /b 1
)
python --version

:: ----- 2. Виртуальное окружение -----
echo [2/6] Проверяю/создаю .venv...
python -m venv "%VENV_DIR%" 2>nul
if not exist "%VENV_DIR%\Scripts\python.exe" (
    echo.
    echo [ОШИБКА] Не удалось создать/найти .venv
    pause
    exit /b 1
)
echo   Готово.
echo   Активирую...
call "%VENV_DIR%\Scripts\activate.bat"
if %errorlevel% neq 0 (
    echo.
    echo [ОШИБКА] Не удалось активировать .venv
    pause
    exit /b 1
)

:: ----- 3. Pip -----
echo [3/6] Обновляю pip...
python -m pip install --upgrade -q pip

:: ----- 4. Зависимости -----
echo [4/6] Устанавливаю зависимости...
python -m pip install -r "%PROJECT_DIR%\requirements.txt"
if %errorlevel% neq 0 (
    echo.
    echo [ОШИБКА] Не удалось установить зависимости
    pause
    exit /b 1
)
echo   Готово.

:: ----- 5. .env -----
echo [5/6] Проверяю .env...
powershell -Command "Test-Path %PROJECT_DIR%\.env" >nul 2>&1
if %errorlevel% neq 0 (
    echo   Создаю .env с SECRET_KEY...
    for /f "usebackq delims=" %%k in (`python -c "import secrets; print(secrets.token_urlsafe(48))"`) do set "KEY=%%k"
    echo SECRET_KEY=%KEY% > "%PROJECT_DIR%\.env"
    echo DATABASE_URL=sqlite:///./app.db >> "%PROJECT_DIR%\.env"
    echo COOKIE_SECURE=false >> "%PROJECT_DIR%\.env"
    echo APP_ENV=development >> "%PROJECT_DIR%\.env"
    echo   Создано.
) else (
    echo   Есть.
)
for /f "usebackq eol=# delims=" %%l in ("%PROJECT_DIR%\.env") do (
    set "%%l"
)

:: ----- 6. Миграции -----
echo [6/6] Применяю миграции Alembic...
cd /d "%PROJECT_DIR%"
python -m alembic upgrade head
if %errorlevel% neq 0 (
    echo.
    echo [ОШИБКА] Не удалось применить миграции
    pause
    exit /b 1
)
echo   Готово.

:: ----- Запуск -----
echo.
echo ========================================
echo   Готово! Сервер запускается...
echo   Приложение:    http://127.0.0.1:%PORT%
echo   Документация:  http://127.0.0.1:%PORT%/docs
echo   Для остановки: Ctrl+C
echo ========================================
echo.

python -m uvicorn %APP_ENTRY% --reload --port %PORT%

if %errorlevel% neq 0 (
    echo.
    echo [ОШИБКА] Сервер завершился с кодом %errorlevel%.
    pause
)

endlocal
