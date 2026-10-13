import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Cairo from 'gi://cairo';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const textDecoder = new TextDecoder();
const HALF_PI = Math.PI / 2;

const HowdyFinalToggle = GObject.registerClass(
class HowdyFinalToggle extends QuickSettings.QuickToggle {
    _init(extension) {
        super._init({
            title: 'Face ID Animation',
            iconName: 'face-smile-symbolic',
            toggleMode: true,
        });
        this._extension = extension;
        this.checked = this._extension.getAnimationEnabled();
        this.connect('notify::checked', () => {
            this._extension.setAnimationEnabled(this.checked);
        });
    }
});

const HowdyFinalIndicator = GObject.registerClass(
class HowdyFinalIndicator extends QuickSettings.SystemIndicator {
    _init(extension) {
        super._init();
        this._toggle = new HowdyFinalToggle(extension);
        this.quickSettingsItems.push(this._toggle);
    }
});

const FaceIDCanvasEngineFinal = GObject.registerClass(
class FaceIDCanvasEngineFinal extends St.DrawingArea {
    _init() {
        super._init({
            style_class: 'faceid-canvas',
            width: 120,
            height: 120,
            reactive: false,
        });
        this._phase = 0;
        this._isSuccess = false;
        this._successProgress = 0.0;
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        if (width <= 0 || height <= 0) return;

        cr.setOperator(Cairo.Operator.CLEAR);
        cr.paint();
        cr.setOperator(Cairo.Operator.OVER);

        const cx = width / 2;
        const cy = height / 2;
        const scaleFactor = Math.min(width, height) / 120;

        cr.save();
        cr.translate(cx, cy);
        cr.scale(scaleFactor, scaleFactor);

        // Dynamic scale spring
        let scale = 1.0;
        if (this._isSuccess) {
            const ease = 1 - Math.pow(1 - this._successProgress, 3);
            scale = 1.0 + Math.sin(ease * Math.PI) * 0.12;
        } else {
            scale = 1.0 + Math.sin(this._phase * 1.8) * 0.025;
        }
        cr.scale(scale, scale);

        // ── 1. Corner Framing Brackets ──────────────────────────────────────
        cr.setLineWidth(3.2);
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setLineJoin(Cairo.LineJoin.ROUND);

        if (this._isSuccess) {
            cr.setSourceRGBA(0.20, 0.86, 0.44, 1.0);
        } else {
            cr.setSourceRGBA(1.0, 1.0, 1.0, 0.94);
        }

        const boxSize = 36;
        const cornerR = this._isSuccess ? 13 : 14 + Math.sin(this._phase * 1.4) * 0.8;
        const legLen = 14;

        for (let i = 0; i < 4; i++) {
            cr.save();
            cr.rotate(i * HALF_PI);
            cr.moveTo(-boxSize, -boxSize + legLen);
            cr.lineTo(-boxSize, -boxSize + cornerR);
            cr.arc(-boxSize + cornerR, -boxSize + cornerR, cornerR, Math.PI, 1.5 * Math.PI);
            cr.lineTo(-boxSize + legLen, -boxSize);
            cr.stroke();
            cr.restore();
        }

        // ── 2. Biometric Facial Anatomy (Scanning Phase) ────────────────────
        if (!this._isSuccess || this._successProgress < 0.45) {
            const faceAlpha = this._isSuccess ? Math.max(0, 1.0 - this._successProgress / 0.45) : 1.0;

            // 3D Parallax Tilt (TrueDepth scanning perception)
            const tiltX = Math.sin(this._phase * 1.3) * 2.4;
            const tiltY = Math.cos(this._phase * 0.95) * 1.6;

            // Vertical scan sweep coordinate
            const waveY = Math.sin(this._phase * 1.6) * 26;
            const waveDist = (y) => Math.abs(y - waveY);

            // Biometric Depth Landmarks Matrix
            const landmarks = [
                { x: 0, y: -20, depth: 0.8 },
                { x: -16, y: -14, depth: 0.9 },
                { x: 16, y: -14, depth: 0.9 },
                { x: -16, y: 3, depth: 1.1 },
                { x: 16, y: 3, depth: 1.1 },
                { x: 0, y: 1, depth: 1.3 },
                { x: -10, y: 19, depth: 1.0 },
                { x: 10, y: 19, depth: 1.0 },
                { x: 0, y: 22, depth: 0.9 },
            ];

            // Soft Triangulation Mesh Connections
            cr.save();
            cr.setLineWidth(1.0);
            cr.setSourceRGBA(0.35, 0.82, 1.0, 0.12 * faceAlpha);
            const connections = [
                [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5], [3, 6], [4, 7], [6, 8], [7, 8]
            ];
            for (const [i1, i2] of connections) {
                const p1 = landmarks[i1];
                const p2 = landmarks[i2];
                cr.moveTo(p1.x + tiltX * p1.depth, p1.y + tiltY * p1.depth);
                cr.lineTo(p2.x + tiltX * p2.depth, p2.y + tiltY * p2.depth);
            }
            cr.stroke();

            // Biometric Node Points
            for (const pt of landmarks) {
                const px = pt.x + tiltX * pt.depth;
                const py = pt.y + tiltY * pt.depth;
                const dist = Math.abs(py - waveY);
                const isNearWave = dist < 8.5;
                const dotAlpha = (isNearWave ? 0.92 : 0.26) * faceAlpha;
                const dotRadius = isNearWave ? 2.2 : 1.2;

                cr.setSourceRGBA(0.35, 0.85, 1.0, dotAlpha);
                cr.arc(px, py, dotRadius, 0, 2 * Math.PI);
                cr.fill();
            }
            cr.restore();

            // Sonar / Radar Pulse Wave
            const pulseR = ((this._phase * 9) % 46) + 6;
            const pulseAlpha = Math.max(0, (1 - pulseR / 46) * 0.22) * faceAlpha;
            if (pulseAlpha > 0.01) {
                cr.save();
                cr.setLineWidth(1.4);
                cr.setSourceRGBA(0.35, 0.82, 1.0, pulseAlpha);
                cr.arc(0, 0, pulseR, 0, 2 * Math.PI);
                cr.stroke();
                cr.restore();
            }

            // Eyes (Pill Capsules with Dynamic Blinking & Luminance)
            const blinkCycle = (this._phase * 0.28) % (Math.PI * 2);
            const eyeScaleY = blinkCycle > 5.9 ? Math.max(0.12, Math.sin((blinkCycle - 5.9) / 0.38 * Math.PI)) : 1.0;

            for (const eyeSign of [-1, 1]) {
                const eyeX = eyeSign * 11 + tiltX;
                const eyeY = -7 + tiltY;
                const dist = waveDist(eyeY);
                const isIlluminated = dist < 9;

                cr.save();
                cr.translate(eyeX, eyeY);
                cr.scale(1.0, eyeScaleY);

                if (isIlluminated) {
                    cr.setSourceRGBA(0.55, 0.92, 1.0, 0.98 * faceAlpha);
                } else {
                    cr.setSourceRGBA(1.0, 1.0, 1.0, 0.86 * faceAlpha);
                }

                cr.arc(0, -2.2, 2.3, Math.PI, 0);
                cr.arc(0, 2.2, 2.3, 0, Math.PI);
                cr.closePath();
                cr.fill();
                cr.restore();
            }

            // Subtle Nose Bridge Tick
            cr.save();
            cr.setLineWidth(1.8);
            cr.setLineCap(Cairo.LineCap.ROUND);
            cr.setSourceRGBA(1.0, 1.0, 1.0, 0.45 * faceAlpha);
            cr.moveTo(tiltX * 1.1, -1 + tiltY);
            cr.lineTo(tiltX * 1.1, 2.5 + tiltY);
            cr.stroke();
            cr.restore();

            // Expressive Smiling Mouth
            const mouthY = 9 + tiltY;
            const mouthIlluminated = waveDist(mouthY) < 9;
            cr.save();
            cr.setLineWidth(2.4);
            cr.setLineCap(Cairo.LineCap.ROUND);
            if (mouthIlluminated) {
                cr.setSourceRGBA(0.45, 0.9, 1.0, 0.98 * faceAlpha);
            } else {
                cr.setSourceRGBA(1.0, 1.0, 1.0, 0.86 * faceAlpha);
            }
            cr.moveTo(-11 + tiltX * 0.7, mouthY);
            cr.curveTo(-5 + tiltX * 0.7, mouthY + 6.2, 5 + tiltX * 0.7, mouthY + 6.2, 11 + tiltX * 0.7, mouthY);
            cr.stroke();
            cr.restore();

            // Radiant Volumetric Wave Sweep (Soft gradient luminous illumination)
            cr.save();
            const waveGrad = new Cairo.LinearGradient(0, waveY - 11, 0, waveY + 11);
            waveGrad.addColorStopRGBA(0, 0.35, 0.82, 1.0, 0.0);
            waveGrad.addColorStopRGBA(0.5, 0.45, 0.92, 1.0, 0.58 * faceAlpha);
            waveGrad.addColorStopRGBA(1, 0.35, 0.82, 1.0, 0.0);
            cr.setSource(waveGrad);
            cr.setLineWidth(2.6);
            cr.setLineCap(Cairo.LineCap.ROUND);
            cr.moveTo(-24, waveY);
            cr.curveTo(-8, waveY + 2, 8, waveY + 2, 24, waveY);
            cr.stroke();
            cr.restore();
        }

        // ── 3. Verified State: Animated Checkmark & Pulse ───────────────────
        if (this._isSuccess && this._successProgress > 0.05) {
            const checkT = Math.min(1.0, (this._successProgress - 0.05) / 0.85);
            const easeCheck = 1 - Math.pow(1 - checkT, 3);

            const p1 = { x: -14, y: 1 };
            const p2 = { x: -4, y: 11 };
            const p3 = { x: 15, y: -8 };

            const len1 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const len2 = Math.hypot(p3.x - p2.x, p3.y - p2.y);
            const totalLen = len1 + len2;
            const progressLen = easeCheck * totalLen;

            cr.save();
            cr.setLineWidth(4.2);
            cr.setLineCap(Cairo.LineCap.ROUND);
            cr.setLineJoin(Cairo.LineJoin.ROUND);
            cr.setSourceRGBA(0.20, 0.86, 0.44, 1.0);

            cr.moveTo(p1.x, p1.y);
            if (progressLen <= len1) {
                const frac = progressLen / len1;
                cr.lineTo(p1.x + (p2.x - p1.x) * frac, p1.y + (p2.y - p1.y) * frac);
            } else {
                cr.lineTo(p2.x, p2.y);
                const rem = (progressLen - len1) / len2;
                cr.lineTo(p2.x + (p3.x - p2.x) * rem, p2.y + (p3.y - p2.y) * rem);
            }
            cr.stroke();
            cr.restore();

            // Expanding Success Confirmation Ripple
            if (this._successProgress < 0.9) {
                const rippleR = 24 + this._successProgress * 28;
                const rippleAlpha = Math.max(0, (1 - this._successProgress) * 0.45);
                cr.save();
                cr.setLineWidth(2.0);
                cr.setSourceRGBA(0.20, 0.86, 0.44, rippleAlpha);
                cr.arc(0, 0, rippleR, 0, 2 * Math.PI);
                cr.stroke();
                cr.restore();
            }
        }

        cr.restore();
    }

    updatePhase() {
        if (!this._isSuccess) {
            this._phase += 0.055;
        } else {
            if (this._successProgress < 1.0) {
                this._successProgress = Math.min(1.0, this._successProgress + 0.035);
            }
        }
        this.queue_repaint();
    }

    setSuccess(success) {
        this._isSuccess = success;
        if (!success) {
            this._successProgress = 0.0;
        }
        this.queue_repaint();
    }
});

const FaceIDContainerV2 = GObject.registerClass(
class FaceIDContainerV2 extends St.Widget {
    _init() {
        super._init({
            style_class: 'faceid-container',
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: false,
        });

        this._canvas = new FaceIDCanvasEngineFinal();
        this.add_child(this._canvas);
    }

    setSuccess(success) {
        this._canvas.setSuccess(success);
    }

    updatePhase() {
        this._canvas.updatePhase();
    }
});

export default class HowdyFaceIDExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._container = null;
        this._monitor = null;
        this._indicator = null;
        this._enabled = true;
        this._tickId = null;
        this._autoHideId = null;
        this._successTimeoutId = null;

        const runtimeDir = GLib.get_user_runtime_dir();
        this._statusPath = GLib.build_filenamev([runtimeDir, 'howdy_status']);
        this._statusFile = Gio.File.new_for_path(this._statusPath);
    }

    enable() {
        if (this._indicator) return;

        this._indicator = new HowdyFinalIndicator(this);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        this._setupFileMonitor();
    }

    disable() {
        this._stopFileMonitor();
        this._removeAnimation();

        if (this._indicator) {
            this._indicator.quickSettingsItems.forEach(item => item.destroy());
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _setupFileMonitor() {
        if (this._monitor) return;
        try {
            if (!this._statusFile.query_exists(null)) {
                this._statusFile.replace_contents('', null, false, Gio.FileCreateFlags.NONE, null);
            }
            GLib.chmod(this._statusPath, 0o666);
            this._monitor = this._statusFile.monitor_file(Gio.FileMonitorFlags.NONE, null);
            this._monitor.connect('changed', (m, f, o, eventType) => {
                if (eventType === Gio.FileMonitorEvent.CHANGED ||
                    eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                    eventType === Gio.FileMonitorEvent.CREATED) {
                    this._readStatus();
                }
            });
            this._readStatus();
        } catch (e) {
            console.error(`[HowdyFaceID] File monitor setup error: ${e.message}`);
        }
    }

    _stopFileMonitor() {
        if (this._monitor) {
            this._monitor.cancel();
            this._monitor = null;
        }
    }

    _readStatus() {
        try {
            if (!this._statusFile.query_exists(null)) return;
            const [success, contents] = this._statusFile.load_contents(null);
            if (!success) return;
            const status = textDecoder.decode(contents).trim().toLowerCase();
            if (!status) return;

            if (status === 'start') {
                this._showAnimation();
            } else if (status === 'success') {
                this._signalSuccess();
            } else if (status === 'stop') {
                this._removeAnimation();
            }
        } catch (e) {
            console.error(`[HowdyFaceID] Read status error: ${e.message}`);
        }
    }

    _showAnimation() {
        if (!this._enabled) return;

        if (!this._container) {
            this._container = new FaceIDContainerV2();
            Main.layoutManager.addChrome(this._container, {
                affectsStruts: false,
                trackFullscreen: true,
            });

            const monitor = Main.layoutManager.primaryMonitor;
            const width = 120;
            const height = 120;
            this._container.set_size(width, height);

            const x = monitor.x + Math.round((monitor.width - width) / 2);
            const y = monitor.y + Main.panel.height + 24;
            this._container.set_position(x, y);

            this._container.opacity = 0;
            this._container.ease({
                opacity: 255,
                duration: 250,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        this._container.setSuccess(false);

        if (!this._tickId) {
            this._tickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
                if (this._container) this._container.updatePhase();
                return GLib.SOURCE_CONTINUE;
            });
        }

        if (this._autoHideId) {
            GLib.source_remove(this._autoHideId);
        }
        this._autoHideId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 7000, () => {
            this._autoHideId = null;
            this._removeAnimation();
            return GLib.SOURCE_REMOVE;
        });
    }

    _signalSuccess() {
        if (this._autoHideId) {
            GLib.source_remove(this._autoHideId);
            this._autoHideId = null;
        }

        if (!this._container) {
            this._showAnimation();
        }

        if (this._container) {
            this._container.setSuccess(true);
        }

        if (this._successTimeoutId) {
            GLib.source_remove(this._successTimeoutId);
        }
        this._successTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            this._successTimeoutId = null;
            this._removeAnimation();
            return GLib.SOURCE_REMOVE;
        });
    }

    _removeAnimation() {
        if (this._tickId) {
            GLib.source_remove(this._tickId);
            this._tickId = null;
        }
        if (this._autoHideId) {
            GLib.source_remove(this._autoHideId);
            this._autoHideId = null;
        }
        if (this._successTimeoutId) {
            GLib.source_remove(this._successTimeoutId);
            this._successTimeoutId = null;
        }

        if (this._container) {
            const containerToDestroy = this._container;
            this._container = null;

            containerToDestroy.ease({
                opacity: 0,
                duration: 250,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    Main.layoutManager.removeChrome(containerToDestroy);
                    containerToDestroy.destroy();
                },
            });
        }

        try {
            if (this._statusFile.query_exists(null)) {
                this._statusFile.replace_contents('', null, false, Gio.FileCreateFlags.NONE, null);
            }
        } catch (_) {}
    }

    getAnimationEnabled() {
        return this._enabled;
    }

    setAnimationEnabled(enabled) {
        this._enabled = enabled;
        if (!enabled) this._removeAnimation();
    }
}
