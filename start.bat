@echo off
chcp 65001 >nul
title ВОнлайне
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Нужен Node.js версии 20 или новее: https://nodejs.org
  echo   Поставьте его и запустите этот файл снова.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo   Первый запуск: ставлю зависимости, это займёт пару минут...
  echo.
  call npm install
  if errorlevel 1 (
    echo   Не удалось установить зависимости.
    pause
    exit /b 1
  )
)

if not exist data (
  echo.
  echo   Создаю демо-страницы ^(пароль у всех vonline2010^)...
  echo.
  call npm run seed
)

start "" http://localhost:8080
node src/server.js
pause
