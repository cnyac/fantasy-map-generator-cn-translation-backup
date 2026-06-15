@echo off
rem 双击本文件即可启动本地预览服务器（Vite）。
rem 启动后在浏览器打开： http://localhost:5173/Fantasy-Map-Generator/?locale=zh-CN
cd /d "%~dp0.."
call npm run dev
pause
