# Howdy Biometric Visual Authentication Interface

```
               .---.                 .---.
              /     \   [HOWDY]     /     \
             | () () |  =======>   |   *   |  VERIFIED (exit 0)
              \  ^  /               \ --- /
               '---'                 '---'
       [Raw Video Frames]    [Facial Landmark Match]
```

[![GNOME Version](https://img.shields.io/badge/GNOME%20Shell-45%20--%2052-blue.svg?style=flat-square)](#)
[![Subsystem](https://img.shields.io/badge/Subsystem-Linux%20PAM%20%2F%20Howdy-purple.svg?style=flat-square)](#)
[![Renderer](https://img.shields.io/badge/Rendering-Cairo%202D%20Procedural-red.svg?style=flat-square)](#)
[![License](https://img.shields.io/badge/License-GPL--3.0-green.svg?style=flat-square)](#)

---

## 1. System Overview

In standard Linux installations, the Pluggable Authentication Module (PAM) architecture processes authentication requests in headless subprocesses without composited graphical feedback. When utilizing Howdy—a local infrared facial verification engine driven by OpenCV frame acquisition and dlib high-dimensional feature metric evaluation—desktop users receive no real-time visual telemetric signals indicating sensor activation, tracking focus, or biometric verification status.

This GNOME Shell extension delivers an asynchronous, hardware-accelerated on-screen display (OSD) overlay. It presents a modern glassmorphic interface featuring procedural vector animations during active recognition passes, dynamic scanning sweeps, and immediate green checkmark confirmation upon credential verification.

---

## 2. Architecture and Inter-Process Communication Pipeline

```
User Invocation / Sudo / Polkit / Lock Screen
                    |
                    v
          +-------------------+
          |  Linux PAM Stack  |
          +-------------------+
                    |
                    | 1. Invokes PAM authentication module
                    v
          +-----------------------------+
          | /usr/lib/howdy/compare.py   |  (Privileged / Root UID 0)
          +-----------------------------+
                    |
                    | 2. Resolves target desktop UID via pwd.getpwnam(target_user)
                    |    Writes "start" -> /run/user/<UID>/howdy_status (0666)
                    v
          +------------------------------------+
          | Linux inotify / Gio.FileMonitor    |
          +------------------------------------+
                    |
                    | 3. Instant event delivery (CHANGED / CHANGES_DONE_HINT)
                    v
          +------------------------------------+       4. 60 FPS Drawing Loop
          | GNOME Shell Extension              | ---------------------------------+
          | HowdyFaceIDExtension (extension.js)|                                  |
          +------------------------------------+                                  v
                    |                                                     +-----------------------+
                    |                                                     | Cairo Vector Canvas   |
                    |                                                     | St.DrawingArea Overlay|
                    | 5. Euclidean Metric < Threshold                     +-----------------------+
                    v
          +-----------------------------+
          | Howdy Emits "success" Token |  (or "stop" on non-zero exit)
          +-----------------------------+
                    |
                    | 6. Transition to verified state, ease dismiss after 1200ms
                    v
          +------------------------------------+
          | Visual Interface Clean Teardown    |
          +------------------------------------+
```

---

## 3. Procedural Vector Engine & Visual Layout

The presentation layer avoids pre-rendered raster assets to guarantee resolution independence across arbitrary fractional scaling configurations and high-DPI displays. The rendering surface floats with zero background card occlusion, eliminating intrusive shadows while displaying exclusively the active biometric vector glyph.

```
       (-size, -size+14)                 (size-14, -size)
              +---------+               +---------+
             /   o   o   \             /           \
            |  (.)   (.)  |           |     \   /   |
            |     \---/   |           |      \_/    |
            +-------------+           +-------------+
         [Volumetric Light Sweep]    [Parametric Emerald Check]
```

### 3.1 Geometric Formulations

1. **Quadrant Bezier Generation**: Four orthogonal corner brackets computed via rotations $\theta_i = i \cdot \frac{\pi}{2}$ for $i \in \{0, 1, 2, 3\}$.
2. **Harmonic Bracket Breathing**:
   $$\text{offset}(\phi) = \sin(\phi \cdot 1.8) \cdot 1.6$$
   where phase parameter $\phi \leftarrow \phi + 0.055$ updates per animation tick.
3. **Three-Dimensional Parallax Depth**:
   $$\Delta x = \sin(\phi \cdot 1.3) \cdot 2.4, \quad \Delta y = \cos(\phi \cdot 0.95) \cdot 1.6$$
   Facial features and depth landmarks translate proportionally to simulate spatial sensor acquisition.
4. **Volumetric Radiant Light Sweep**:
   $$y_{\text{wave}}(\phi) = \sin(\phi \cdot 1.6) \cdot 26.0$$
   A radiant linear gradient field dynamically illuminates intersecting facial contours, capsule eye nodes, and landmark vertices.
5. **Parametric Verification Easing**:
   $$s(t) = 1.0 + \sin\left(\left(1 - (1 - t)^3\right) \cdot \pi\right) \cdot 0.12$$
   Upon successful verification, the glyph performs an elastic spring expansion, dynamically tracing the emerald checkmark contour alongside an expanding confirmation pulse.

---

## 4. State Machine and Lifecycle Transitions

| State | Transition Trigger | Active Subsystems | Duration / Exit Criteria |
|---|---|---|---|
| **IDLE** | System quiescent | `Gio.FileMonitor` on `/run/user/<UID>/howdy_status` | Status file mutation |
| **SCANNING** | Status token = `"start"` | 60 Hz GLib timer (`_tickId`), Cairo draw loop, Primary monitor alignment | Status file token update or 7000ms safety timeout |
| **VERIFIED** | Status token = `"success"` | Parametric checkmark interpolation, emerald pulse ring, spring scale | 1500ms timer (`_successTimeoutId`) |
| **DISMISSAL** | Status token = `"stop"` or timeout | Clutter opacity ease (250ms duration, `EASE_IN_QUAD`) | Stage chrome removal and actor destruction |

---

## 5. Security Architecture and Privilege Boundaries

```
+-------------------------------------------------+
| PRIVILEGED EXECUTION CONTEXT (Root / PAM)       |
| - Howdy Video Frame Grabber                     |
| - Facial Feature Embedding Extractor            |
| - Resolves authenticating user UID dynamically  |
+-------------------------------------------------+
                        |
                        | Writes unprivileged IPC token (chmod 0666)
                        v
+-------------------------------------------------+
| UNPRIVILEGED COMPOSITOR CONTEXT (GNOME Shell)   |
| - /run/user/<UID>/howdy_status                  |
| - GNOME Shell Desktop Compositor (St / Clutter) |
| - Quick Settings Toggle Integration             |
+-------------------------------------------------+
```

The desktop extension operates entirely in unprivileged user space. Raw camera video streams, infrared frames, and facial embedding vectors remain strictly quarantined within the Howdy daemon boundary.

---

## 6. Deployment and Integration

### 6.1 Automated Installation

The integrated deployment script installs extension files, patches the Howdy compare engine, and registers an automated pacman hook to maintain patch integrity across package upgrades:

```bash
cd howdy-face-id-animation
chmod +x install.sh
sudo ./install.sh
```

### 6.2 Pacman Post-Transaction Hook

On Arch Linux and derived distributions, package upgrades to `howdy` or `howdy-git` overwrite `/usr/lib/howdy/compare.py`. The installer writes a pacman hook to `/etc/pacman.d/hooks/howdy-faceid.hook`:

```ini
[Trigger]
Operation = Install
Operation = Upgrade
Type = Path
Target = usr/lib/howdy/compare.py

[Action]
Description = Maintaining Howdy Face ID Animation telemetry hook...
When = PostTransaction
Exec = /usr/bin/python3 /home/istisu/.local/share/gnome-shell/extensions/faceidanimation@toowfeeq/patch_howdy.py
```

### 6.3 Manual Telemetry Testing

State transitions can be simulated independently of physical camera hardware using the bundled verification script:

```bash
# Initiate scanning sequence
./howdy-trigger.sh start

# Transition to verified state
./howdy-trigger.sh success

# Abort or dismiss overlay
./howdy-trigger.sh stop
```

---

## 7. License

Distributed under the terms of the GNU General Public License v3.0 (GPL-3.0).
