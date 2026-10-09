@echo off
rem Doble clic aqui, con el pendrive puesto.
rem "Bypass" solo vale para ESTA ejecucion: no cambia nada del sistema.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0copia-seguridad.ps1"
