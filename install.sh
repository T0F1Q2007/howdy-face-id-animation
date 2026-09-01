#!/bin/bash

# Howdy Face ID Animation - Ultimate Bugless Installer
# Automates extension installation and safe Howdy integration

set -e

echo "🚀 Starting Howdy Face ID Animation Setup..."

# 1. Detect User Info
USER_ID=$(id -u)
EXT_UUID="faceidanimation@toowfeeq"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_UUID"
HOWDY_COMPARE="/usr/lib/howdy/compare.py"

# 2. Install Extension Files
echo "📦 Installing extension files to $EXT_DIR..."
mkdir -p "$EXT_DIR"
cp extension.js metadata.json stylesheet.css howdy-trigger.sh "$EXT_DIR/"
chmod +x "$EXT_DIR/howdy-trigger.sh"

# 3. Patch Howdy (The Safe Way)
if [ -f "$HOWDY_COMPARE" ]; then
    echo "🔧 Integrating with Howdy at $HOWDY_COMPARE..."
    
    # Use a robust Python script to patch the file
    sudo python3 <<EOF
import os

path = "$HOWDY_COMPARE"
status_path = f"/run/user/$USER_ID/howdy_status"

with open(path, "r") as f:
    lines = f.readlines()

# Clean up all previous attempts
new_lines = [l for l in lines if "howdy_status" not in l]

# Ensure 'import os' exists for the signal logic
if not any("import os" in l for l in new_lines[:10]):
    new_lines.insert(1, "import os\n")

# Add 'start' signal at the top
new_lines.insert(2, f'open("{status_path}", "w").write("start")\n')

# Find EVERY exit point and add 'success' signal before it
# This ensures it works even if Howdy's structure changes slightly
final_lines = []
for line in new_lines:
    if "exit(0)" in line:
        # Capture EXACT indentation (tabs or spaces)
        indent = line[:line.find("exit(0)")]
        final_lines.append(f'{indent}open("{status_path}", "w").write("success")\n')
    final_lines.append(line)

with open(path, "w") as f:
    f.writelines(final_lines)
EOF
    echo "✅ Howdy integration complete (Indentation safe)."
else
    echo "⚠️ Warning: Howdy not found at $HOWDY_COMPARE."
    echo "You will need to manually patch Howdy if it is installed in a different path."
fi

# 4. Finalize
echo "✨ Setup finished!"
echo "-------------------------------------------------------"
echo "1. IMPORTANT: Log out and Log back in to clear memory."
echo "2. Enable the extension in the 'Extensions' app."
echo "-------------------------------------------------------"
