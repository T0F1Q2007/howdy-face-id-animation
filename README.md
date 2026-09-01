# Biometric Visual Authentication Interface for GNOME Shell and Howdy

A high-performance GNOME Shell extension and companion integration layer engineered to render visual authentication state transitions during PAM-mediated facial recognition routines executed by the Howdy biometric framework.

---

## Architecture and System Theory

The Linux Pluggable Authentication Module (PAM) architecture operates as a discrete security subsystem, evaluating authentication challenges synchronously or asynchronously across local and network domains. When integrating facial recognition via Howdy (a multi-stage dlib/OpenCV facial landmark and neural inference pipeline), user feedback within the graphical desktop interface is typically absent, leading to ambiguity regarding sensor activation and verification latency.

This software implements a decoupled, event-driven telemetry and visualization architecture:

```
+-----------------------------------------------------------------------+
|                    Linux PAM Authentication Stack                     |
|                   (/etc/pam.d/system-auth, sudo, gdm)                 |
+-----------------------------------^-----------------------------------+
                                    |
                    Authentication Hook Execution
                                    |
+-----------------------------------v-----------------------------------+
|               Howdy Biometric Verification Engine                     |
|                     (/usr/lib/howdy/compare.py)                       |
+-----------------------------------^-----------------------------------+
                                    |
            Asynchronous State Token Write ("start" / "success")
                                    |
+-----------------------------------v-----------------------------------+
|                     POSIX Runtime File IPC Gateway                    |
|                      $XDG_RUNTIME_DIR/howdy_status                    |
+-----------------------------------^-----------------------------------+
                                    |
            Kernel inotify / Gio.FileMonitor (CHANGES_DONE_HINT)
                                    |
+-----------------------------------v-----------------------------------+
|               GNOME Shell Biometric Interface Engine                  |
|  - QuickSettings.QuickToggle state control integration                |
|  - Dynamic layout chrome placement on primary display monitor         |
|  - 60 FPS Clutter / Cairo 2D procedural vector rendering canvas      |
+-----------------------------------------------------------------------+
```

### Inter-Process Communication (IPC) Protocol

To maintain complete isolation between the privileged PAM execution context (frequently executing under elevated permissions or separate service accounts) and the unprivileged GNOME Shell user session, IPC is established over the POSIX `$XDG_RUNTIME_DIR` tmpfs filesystem:

1. **`start`**: Emitted immediately upon camera sensor initialization and facial frame acquisition.
2. **`success`**: Emitted upon valid Euclidean distance calculation below the configured threshold against enrolled facial models.
3. **`stop` / Timeout**: Emitted upon pipeline completion, timeout expiration, or failure.

State transitions are monitored using `Gio.FileMonitor` subscribed to the `CHANGES_DONE_HINT` event mask, preventing spurious re-triggering during partial file writes.

---

## Procedural Cairo Vector Rendering Engine

The visual representation avoids rasterized assets to eliminate scaling artifacts across variable display pixel densities (HiDPI / fractional scaling). The `FaceIDCanvasEngineFinal` class subclasses `St.DrawingArea` and renders dynamic geometric primitives via 2D vector path operations:

* **Bounding Corner Arcs**: Computed using parametric rotational transformations:
  $$x(\theta) = -r + \delta \sin(\phi + i)$$
  $$y(\theta) = -r + 25$$
  where $\phi$ represents the continuous phase accumulator incremented at 60 Hz, and $i \in \{0, 1, 2, 3\}$ indexes the orthogonal quadrants.
* **Scan Grid Interpolation**: Vertical harmonic waveforms modulated across the active scan aperture.
* **State Interpolation**: Smooth opacity and geometry easing executed via Clutter implicit animation curves (`Clutter.BinLayout`).

---

## Installation and Deployment

### 1. Extension Directory Placement

Clone or copy the extension assets to the user extension directory:

```bash
mkdir -p ~/.local/share/gnome-shell/extensions/faceidanimation@toowfeeq
cp extension.js metadata.json stylesheet.css howdy-trigger.sh ~/.local/share/gnome-shell/extensions/faceidanimation@toowfeeq/
```

### 2. Howdy Pipeline Integration

To configure Howdy to emit IPC telemetry during authentication passes, apply the integration hook to `/usr/lib/howdy/compare.py`.

Execute the automated installer:

```bash
chmod +x install.sh
./install.sh
```

#### Manual Patching Specification

Alternatively, insert the following telemetry hooks into `/usr/lib/howdy/compare.py`:

```python
import os

# Signal acquisition commencement:
try:
    runtime_dir = os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
    with open(os.path.join(runtime_dir, "howdy_status"), "w") as status_fd:
        status_fd.write("start")
except Exception:
    pass

# Prior to successful authentication return (exit(0)):
try:
    with open(os.path.join(runtime_dir, "howdy_status"), "w") as status_fd:
        status_fd.write("success")
except Exception:
    pass
```

### 3. Extension Activation

Enable the extension within the GNOME desktop environment:

```bash
gnome-extensions enable faceidanimation@toowfeeq
```

---

## Quick Settings Configuration

The extension registers an external toggle within the GNOME Shell Quick Settings panel (`QuickSettings.SystemIndicator`), allowing immediate activation or suppression of biometric visual overlays without disabling underlying PAM modules.

---

## Manual Verification

Manual triggering of the interface for verification purposes can be performed via the bundled trigger utility:

```bash
./howdy-trigger.sh start
sleep 2
./howdy-trigger.sh success
```

---

## License

This software is distributed under the terms of the GNU General Public License v3.0 (GPL-3.0).
