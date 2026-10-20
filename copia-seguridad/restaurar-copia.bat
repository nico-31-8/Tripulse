@echo off
rem Doble clic aqui, con el disco de las copias puesto. Restaura una copia en un
rem proyecto de Supabase NUEVO y comprueba que esta todo. Nunca toca produccion.
rem "Bypass" solo vale para ESTA ejecucion: no cambia nada del sistema.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0restaurar-copia.ps1"
