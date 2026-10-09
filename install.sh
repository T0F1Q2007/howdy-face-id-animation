#!/bin/bash
# Howdy Face ID Animation - Automated Installer & System Integrator
# Sets up GNOME Shell extension files, patches Howdy PAM compare engine,
# and installs a pacman hook to ensure persistence across package updates.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_UUID="faceidanimation@toowfeeq"

# Resolve target user and home directory accurately (even under sudo)
if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
    TARGET_USER="$SUDO_USER"
    TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
else
    TARGET_USER="$(id -un)"
    TARGET_HOME="$HOME"
fi

EXT_DIR="$TARGET_HOME/.local/share/gnome-shell/extensions/$EXT_UUID"
HOWDY_COMPARE="/usr/lib/howdy/compare.py"
PACMAN_HOOK_DIR="/etc/pacman.d/hooks"

echo "Deploying Howdy Face ID Animation for user: $TARGET_USER"
echo "Target extension directory: $EXT_DIR"

# 1. Install Extension Files
mkdir -p "$EXT_DIR"
cp "$SCRIPT_DIR/extension.js" "$EXT_DIR/"
cp "$SCRIPT_DIR/metadata.json" "$EXT_DIR/"
cp "$SCRIPT_DIR/stylesheet.css" "$EXT_DIR/"
cp "$SCRIPT_DIR/howdy-trigger.sh" "$EXT_DIR/"
cp "$SCRIPT_DIR/patch_howdy.py" "$EXT_DIR/"

chmod +x "$EXT_DIR/howdy-trigger.sh"
chmod +x "$EXT_DIR/patch_howdy.py"

if [ -n "$SUDO_USER" ]; then
    chown -R "$TARGET_USER:$TARGET_USER" "$EXT_DIR"
fi

echo "Extension files successfully placed."

# 2. Patch Howdy PAM Integration
if [ -f "$HOWDY_COMPARE" ]; then
    echo "Configuring Howdy comparison engine at $HOWDY_COMPARE..."
    if [ "$(id -u)" -eq 0 ]; then
        python3 "$EXT_DIR/patch_howdy.py"
    else
        sudo python3 "$EXT_DIR/patch_howdy.py"
    fi
else
    echo "Notice: Howdy compare script not found at $HOWDY_COMPARE. Skipping hook injection."
fi

# 3. Install Pacman Hook for Auto-Persistence Across System Updates
if [ -d "/etc/pacman.d" ] && [ -f "$HOWDY_COMPARE" ]; then
    echo "Installing pacman hook to preserve patch across Howdy package updates..."
    HOOK_CONTENT="[Trigger]
Operation = Install
Operation = Upgrade
Type = Path
Target = usr/lib/howdy/compare.py

[Action]
Description = Maintaining Howdy Face ID Animation telemetry hook...
When = PostTransaction
Exec = /usr/bin/python3 $EXT_DIR/patch_howdy.py
"
    if [ "$(id -u)" -eq 0 ]; then
        mkdir -p "$PACMAN_HOOK_DIR"
        echo "$HOOK_CONTENT" > "$PACMAN_HOOK_DIR/howdy-faceid.hook"
    else
        sudo mkdir -p "$PACMAN_HOOK_DIR"
        echo "$HOOK_CONTENT" | sudo tee "$PACMAN_HOOK_DIR/howdy-faceid.hook" > /dev/null
    fi
    echo "Pacman hook successfully registered at $PACMAN_HOOK_DIR/howdy-faceid.hook."
fi

# 4. Reload Extension in GNOME Shell
if command -v gnome-extensions >/dev/null 2>&1; then
    echo "Reloading extension state..."
    gnome-extensions disable "$EXT_UUID" 2>/dev/null || true
    sleep 0.5
    gnome-extensions enable "$EXT_UUID" 2>/dev/null || true
fi

echo "Setup complete. Howdy Face ID Animation is active and integrated."
