@echo off
chcp 65001 >nul
rem ============================================
rem  英语学习站 一键启动
rem  双击运行：自动启动本地服务并打开浏览器
rem ============================================
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 python，请先安装 Python 并勾选 Add to PATH
  pause
  exit /b 1
)

rem 已有服务在跑就直接打开页面，避免端口冲突
powershell -NoProfile -Command "try{Invoke-WebRequest -Uri 'http://localhost:8899/index.html' -UseBasicParsing -TimeoutSec 2|Out-Null;exit 0}catch{exit 1}"
if errorlevel 1 (
  echo 启动本地服务 http://localhost:8899 ...
  start "corpus-server" /min python -m http.server 8899 --directory "%~dp0."
  timeout /t 1 /nobreak >nul
)

start "" "http://localhost:8899/#/study/ep005"
echo 已在浏览器打开学习站。关闭本窗口不影响使用；最小化的 corpus-server 窗口是服务本体。
timeout /t 3 /nobreak >nul
