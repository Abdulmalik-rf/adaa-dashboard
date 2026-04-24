@echo off
REM Adaa WhatsApp agent launcher.
REM Runs on Windows login (via a copy in %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\).
REM Auto-restarts if the agent crashes.

title Adaa WhatsApp Agent
cd /d "C:\Users\LENOVO\Desktop\adaa agency dashboard\temp_zip_agency\whatsapp-agent"

:restart
echo.
echo === %date% %time%  Starting Adaa agent ===
call npm start
echo.
echo === %date% %time%  Agent exited (code %ERRORLEVEL%). Restarting in 5s... ===
timeout /t 5 /nobreak >nul
goto restart
