# Howdy Biometric Visual Authentication Interface

```
               .---.                 .---.
              /     \   [HOWDY]     /     \
             | () () |  =======>   |   *   |  VERIFIED (exit 0)
              \  ^  /               \ --- /
               '---'                 '---'
       [Raw Video Frames]    [Facial Landmark Match]
```

[![GNOME Version](https://img.shields.io/badge/GNOME%20Shell-45%20--%2050-blue.svg?style=flat-square)](#)
[![Subsystem](https://img.shields.io/badge/Subsystem-Linux%20PAM%20%2F%20Howdy-purple.svg?style=flat-square)](#)
[![Renderer](https://img.shields.io/badge/Rendering-Cairo%202D%20Procedural-red.svg?style=flat-square)](#)
[![License](https://img.shields.io/badge/License-GPL--3.0-green.svg?style=flat-square)](#)

---

## 1. System Overview

In standard Linux configurations, the Pluggable Authentication Module (PAM) pipeline authenticates credentials without visual feedback. When integrating Howdy—an infrared facial authentication engine utilizing OpenCV video capture and dlib facial feature vector comparison—the desktop user lacks immediate feedback indicating sensor acquisition, optical alignment, or verification outcome.

This extension provides an asynchronous, hardware-accelerated visual overlay that renders procedural scanning animations during active authentication passes and checkmark confirmations upon successful verification.

---

## 2. End-to-End Authentication Sequence

```
User Action / Sudo / Lock Screen
      |
      v
+------------------+
|  Linux PAM Stack |
+------------------+
      |
      | 1. Invokes PAM Module
      v
+-----------------------------+
| /usr/lib/howdy/compare.py   |
+-----------------------------+
      |
      | 2. Write "start" -> $XDG_RUNTIME_DIR/howdy_status
      v
+------------------------------------+
| Linux inotify / Gio.FileMonitor    |
+------------------------------------+
      |
      | 3. Event: CHANGES_DONE_HINT
      v
+------------------------------------+       4. 60 FPS Repaint Cycle
| GNOME Shell Extension              | ---------------------------------+
| HowdyFaceIDExtension (extension.js)|                                  |
+------------------------------------+                                  v
      |                                                     +-----------------------+
      |                                                     | Cairo Vector Canvas   |
      |                                                     | St.DrawingArea Overlay|
      | 5. Euclidean Distance < Threshold                   +-----------------------+
      v
+-----------------------------+
| Howdy Emits "success" Token |
+-----------------------------+
      |
      | 6. Trigger Green Stroke & Eased Dismissal (1200ms)
      v
+------------------------------------+
| Visual Interface Clean Teardown    |
+------------------------------------+
```

---

## 3. Procedural Vector Canvas Architecture

The rendering system avoids rasterized bitmap dependencies to ensure crisp scaling across high-DPI displays. Drawing operations are executed in `vfunc_repaint()` on a custom `St.DrawingArea` canvas:

```
        (-size, -size+25)               (size-25, -size)
               +---------+             +---------+
              /           \           /           \
             |             |         |             |
             |             |         |             |
             +-------------+         +-------------+
        Quadrant 0: Upper-Left     Quadrant 1: Upper-Right

        Quadrant 3: Lower-Left     Quadrant 2: Lower-Right
             +-------------+         +-------------+
             |             |         |             |
             |             |         |             |
              \           /           \           /
               +---------+             +---------+
        (-size, size-25)                (size-25, size)
```

### 3.1 Mathematical Transform Parameters

1. **Quadrant Bezier Generation**: Four orthogonal quadrants rotated via $\theta_i = i \cdot \frac{\pi}{2}$ for $i \in \{0, 1, 2, 3\}$.
2. **Harmonic Corner Modulation**:
   $$\text{offset}(\phi, i) = \sin(\phi + i) \cdot 6.0$$
   where $\phi \leftarrow \phi + 0.08$ is updated at 60 Hz.
3. **Harmonic Scanlines**:
   $$\text{shift}(x, \phi) = \sin\left(\phi + \frac{x}{10}\right) \cdot 12.0, \quad x \in [-35, 35], \ \Delta x = 15$$

---

## 4. State Machine and Timing Specifications

| State | Entry Trigger | Active Subsystems | Duration / Exit Condition |
|---|---|---|---|
| **IDLE** | System quiescent | `Gio.FileMonitor` active | Status file modified |
| **SCANNING** | Status token = `"start"` | 60 FPS GLib timer (`_tickId`), Cairo draw loop, Primary monitor centering | Status file token change or 8000ms safety timeout |
| **VERIFIED** | Status token = `"success"` | Cairo green source stroke (`#34d399`), Checkmark vector path | 1200ms timer (`_successTimeoutId`) |
| **DISMISSAL** | Status token = `"stop"` or timeout | Clutter opacity ease (400ms duration) | Canvas deallocation and chrome removal |

---

## 5. Security and Process Isolation

```
+------------------------------------+
| PRIVILEGED CONTEXT (Root / PAM)    |
| - Howdy Video Frame Grabber        |
| - Facial Embeddings Comparator     |
+------------------------------------+
                  |
                  | Write Unprivileged Status Token (chmod 0666)
                  v
+------------------------------------+
| UNPRIVILEGED CONTEXT (User / Shell)|
| - $XDG_RUNTIME_DIR/howdy_status    |
| - GNOME Shell Desktop Compositor   |
| - Quick Settings Toggle Control    |
+------------------------------------+
```

The extension requires zero root privileges and never touches raw video feeds or biometric embedding vectors.

---

## 6. Automated and Manual Deployment

### 6.1 Installation via Script

```bash
# Clone and enter directory
cd howdy-face-id-animation

# Run installer (patches compare.py and copies extension)
chmod +x install.sh
./install.sh
```

### 6.2 Manual Integration Hook

To hook Howdy manually, append the status emitters directly inside `/usr/lib/howdy/compare.py`:

```python
import os

def emit_signal(state):
    try:
        run_dir = os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
        with open(os.path.join(run_dir, "howdy_status"), "w") as fd:
            fd.write(state)
    except Exception:
        pass

# Call emit_signal("start") at script start
# Call emit_signal("success") immediately prior to sys.exit(0)
```

---

## 7. Verification Utilities

Trigger state transitions independently of the camera hardware using `howdy-trigger.sh`:

```bash
# Initiate scanning state
./howdy-trigger.sh start

# Transition to verified state
./howdy-trigger.sh success

# Reset to idle state
./howdy-trigger.sh stop
```

---

## 8. License

Distributed under the terms of the GNU General Public License v3.0 (GPL-3.0).
