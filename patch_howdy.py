#!/usr/bin/env python3
"""
Patch utility for Howdy PAM facial authentication daemon.
Integrates IPC telemetry with the Howdy Face ID Animation GNOME Extension.
"""

import sys
import os
import shutil
import py_compile

HOWDY_COMPARE_PATH = "/usr/lib/howdy/compare.py"
BACKUP_PATH = "/usr/lib/howdy/compare.py.orig"

PATCH_MARKER_START = "# === FACEID_EXTENSION_PATCH START ==="
PATCH_MARKER_END = "# === FACEID_EXTENSION_PATCH END ==="

HOOK_CODE = f"""{PATCH_MARKER_START}
def notify_faceid_status(status):
\ttry:
\t\timport os, pwd, sys
\t\ttarget_user = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("USER", "root")
\t\ttry:
\t\t\ttarget_uid = pwd.getpwnam(target_user).pw_uid
\t\texcept Exception:
\t\t\ttarget_uid = 1000
\t\tstatus_file = f"/run/user/{{target_uid}}/howdy_status"
\t\twith open(status_file, "w") as f:
\t\t\tf.write(status)
\t\ttry:
\t\t\tos.chmod(status_file, 0o666)
\t\texcept Exception:
\t\t\tpass
\texcept Exception:
\t\tpass
{PATCH_MARKER_END}
"""

def patch_howdy(path=HOWDY_COMPARE_PATH):
    if not os.path.isfile(path):
        print(f"Error: Howdy compare script not found at {path}", file=sys.stderr)
        return False

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    if PATCH_MARKER_START in content:
        print("Notice: Howdy is already patched with Face ID telemetry hook.")
        return True

    # Create backup if not present
    if not os.path.exists(BACKUP_PATH):
        try:
            shutil.copy2(path, BACKUP_PATH)
            print(f"Created clean backup at {BACKUP_PATH}")
        except Exception as e:
            print(f"Warning: Could not create backup file: {e}", file=sys.stderr)

    # 1. Inject notify_faceid_status definition before def exit
    target_exit_def = "def exit(code=None):"
    if target_exit_def not in content:
        print(f"Error: Could not locate '{target_exit_def}' in {path}", file=sys.stderr)
        return False

    patched_exit = (
        HOOK_CODE
        + "\ndef exit(code=None):\n"
        + '\tif "notify_faceid_status" in globals():\n'
        + '\t\tnotify_faceid_status("success" if code == 0 else "stop")\n'
    )
    content = content.replace(target_exit_def, patched_exit, 1)

    # 2. Inject start trigger after user assignment
    target_user_assign = "\nuser = sys.argv[1]\n"
    if target_user_assign not in content:
        # Fallback if whitespace differs
        target_user_assign = "user = sys.argv[1]"
        if target_user_assign not in content:
            print(f"Error: Could not locate 'user = sys.argv[1]' in {path}", file=sys.stderr)
            return False
        content = content.replace(
            target_user_assign,
            f'{target_user_assign}\nnotify_faceid_status("start")',
            1
        )
    else:
        content = content.replace(
            target_user_assign,
            f'\nuser = sys.argv[1]\nnotify_faceid_status("start")\n',
            1
        )

    # Validate compilation
    try:
        compile(content, path, "exec")
    except Exception as e:
        print(f"Compilation error on patched content: {e}", file=sys.stderr)
        return False

    # Write patched file
    temp_path = f"{path}.tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        f.write(content)

    os.chmod(temp_path, 0o755)
    os.replace(temp_path, path)
    print(f"Successfully patched {path} with Face ID telemetry hook.")
    return True

def revert_howdy(path=HOWDY_COMPARE_PATH):
    if os.path.exists(BACKUP_PATH):
        shutil.copy2(BACKUP_PATH, path)
        print(f"Restored {path} from original backup.")
        return True

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    if PATCH_MARKER_START not in content:
        print("Notice: No patch detected to revert.")
        return True

    # Strip patched blocks
    lines = content.splitlines(keepends=True)
    clean_lines = []
    skip = False
    for line in lines:
        if PATCH_MARKER_START in line:
            skip = True
            continue
        if PATCH_MARKER_END in line:
            skip = False
            continue
        if skip:
            continue
        if 'notify_faceid_status("success" if code == 0 else "stop")' in line:
            continue
        if 'notify_faceid_status("start")' in line:
            continue
        clean_lines.append(line)

    restored = "".join(clean_lines)
    with open(path, "w", encoding="utf-8") as f:
        f.write(restored)

    print(f"Cleaned patch markers from {path}.")
    return True

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--revert":
        success = revert_howdy()
    else:
        success = patch_howdy()
    sys.exit(0 if success else 1)
