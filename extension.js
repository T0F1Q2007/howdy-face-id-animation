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
            width: 90,
            height: 90,
            reactive: false,
        });
        this._phase = 0;
        this._isSuccess = false;
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        if (width <= 0 || height <= 0) return;

        cr.setOperator(Cairo.Operator.CLEAR);
        cr.paint();
        cr.setOperator(Cairo.Operator.OVER);

        const centerX = width / 2;
        const centerY = height / 2;
        const size = 32;

        cr.save();
        cr.translate(centerX, centerY);

        // ── 1. Corner Framing Brackets ──────────────────────────────────────
        cr.setLineWidth(3.5);
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setLineJoin(Cairo.LineJoin.ROUND);

        if (this._isSuccess) {
            cr.setSourceRGBA(0.2, 0.83, 0.55, 1.0);
        } else {
            cr.setSourceRGBA(1.0, 1.0, 1.0, 0.95);
        }

        for (let i = 0; i < 4; i++) {
            cr.save();
            cr.rotate(i * HALF_PI);

            const offset = this._isSuccess ? 0 : Math.sin(this._phase + i) * 2.5;
            const cornerRadius = 14 + offset;

            cr.moveTo(-size, -size + 20);
            cr.lineTo(-size, -size + cornerRadius);
            cr.arc(-size + cornerRadius, -size + cornerRadius, cornerRadius, Math.PI, 1.5 * Math.PI);
            cr.lineTo(-size + 20, -size);
            cr.stroke();

            cr.restore();
        }

        if (!this._isSuccess) {
            // ── 2. Biometric Facial Glyph (Scanning Mode) ───────────────────
            cr.setLineWidth(2.0);
            cr.setSourceRGBA(1.0, 1.0, 1.0, 0.55);

            // Eyes
            const blinkScale = 0.85 + 0.15 * Math.cos(this._phase * 0.9);
            cr.save();
            cr.scale(1.0, blinkScale);
            cr.arc(-11, -7 / blinkScale, 2.8, 0, 2 * Math.PI);
            cr.arc(11, -7 / blinkScale, 2.8, 0, 2 * Math.PI);
            cr.fill();
            cr.restore();

            // Smile
            cr.save();
            cr.setLineWidth(2.2);
            cr.moveTo(-11, 8);
            cr.curveTo(-6, 14, 6, 14, 11, 8);
            cr.stroke();
            cr.restore();

            // ── 3. Cyan Laser Scanning Beam ─────────────────────────────────
            const beamY = Math.sin(this._phase * 1.5) * 18;
            cr.save();
            cr.setLineWidth(2.5);
            cr.setLineCap(Cairo.LineCap.ROUND);
            cr.setSourceRGBA(0.35, 0.82, 1.0, 0.85);
            cr.moveTo(-22, beamY);
            cr.lineTo(22, beamY);
            cr.stroke();
            cr.restore();
        } else {
            // ── 4. Verified Checkmark (Success Mode) ─────────────────────────
            cr.setLineWidth(4.5);
            cr.setLineCap(Cairo.LineCap.ROUND);
            cr.setLineJoin(Cairo.LineJoin.ROUND);
            cr.setSourceRGBA(0.2, 0.83, 0.55, 1.0);

            cr.moveTo(-13, 2);
            cr.lineTo(-4, 11);
            cr.lineTo(15, -8);
            cr.stroke();
        }

        cr.restore();
    }

    updatePhase() {
        this._phase += 0.08;
        this.queue_repaint();
    }

    setSuccess(success) {
        this._isSuccess = success;
        this.queue_repaint();
    }
});

const FaceIDContainer = GObject.registerClass(
class FaceIDContainer extends St.BoxLayout {
    _init() {
        super._init({
            style_class: 'faceid-container',
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: false,
        });

        this._canvas = new FaceIDCanvasEngineFinal();
        this.add_child(this._canvas);

        this._label = new St.Label({
            text: 'Face ID',
            style_class: 'faceid-label',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._label);
    }

    setSuccess(success) {
        this._canvas.setSuccess(success);
        if (success) {
            this.add_style_class_name('success');
            this._label.add_style_class_name('success');
            this._label.set_text('Verified');
        } else {
            this.remove_style_class_name('success');
            this._label.remove_style_class_name('success');
            this._label.set_text('Face ID');
        }
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
            this._container = new FaceIDContainer();
            Main.layoutManager.addChrome(this._container, {
                affectsStruts: false,
                trackFullscreen: true,
            });

            const monitor = Main.layoutManager.primaryMonitor;
            const width = 150;
            const height = 145;
            this._container.set_size(width, height);

            const x = monitor.x + Math.round((monitor.width - width) / 2);
            const y = monitor.y + Main.panel.height + 16;
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
        this._successTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1200, () => {
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
