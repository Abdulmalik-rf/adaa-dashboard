@echo off
REM Emergize WhatsApp agent launcher.
REM Runs on Windows login (via a copy in %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\).
REM Auto-restarts if the agent crashes.

title Emergize WhatsApp Agent
cd /d "C:\Users\LENOVO\Desktop\adaa agency dashboard\temp_zip_agency\whatsapp-agent"

:restart
echo. >> agent.log
echo === %date% %time%  Starting Emergize agent === >> agent.log
call npm start >> agent.log 2>&1
echo. >> agent.log
echo === %date% %time%  Agent exited (code %ERRORLEVEL%). Restarting in 5s... >> agent.log
timeout /t 5 /nobreak >nul
goto restart
