#!/bin/bash
# Instala (o actualiza) la tarea de macOS que corre herramientas/latido.js cada 2 minutos.
# Uso: bash herramientas/instalar-latido.sh        Quitarla: bash herramientas/instalar-latido.sh --quitar
set -e
ETIQUETA="com.miplan.latido"
PLIST="$HOME/Library/LaunchAgents/$ETIQUETA.plist"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
launchctl bootout "gui/$(id -u)/$ETIQUETA" 2>/dev/null || true
if [ "$1" = "--quitar" ]; then rm -f "$PLIST"; echo "Latido quitado."; exit 0; fi
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ETIQUETA</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/herramientas/latido.js</string></array>
  <key>StartInterval</key><integer>120</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/miplan-latido.log</string>
</dict>
</plist>
PLIST
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Latido instalado: cada 2 minutos, solo si hay una sesión de Claude Code abierta."
