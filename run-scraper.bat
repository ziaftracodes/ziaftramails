@echo off
echo ====================================================
echo    ZIAFTRA MAILS - MASSIVE LEAD BANK SCRAPER
echo ====================================================
echo.
echo Starting the 5-Hour Scraper Engine...
echo Leave this window open to continue scraping leads in the background.
echo You can minimize it. If you want to stop scraping, just close this window.
echo.
cd /d "e:\ziaftramails"
node catchup.js
pause
