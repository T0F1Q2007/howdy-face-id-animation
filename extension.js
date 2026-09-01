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
        this.connect('clicked', () => this._extension.setAnimationEnabled(this.checked));
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
        super._init({ style_class: 'faceid-canvas', width: 200, height: 200 });
        this._phase = 0;
        this._isSuccess = false;
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        cr.setOperator(Cairo.Operator.CLEAR);
        cr.paint();
        cr.setOperator(Cairo.Operator.OVER);

        const centerX = width / 2;
        const centerY = height / 2;
        const size = 60;

        cr.setLineWidth(3);
        if (this._isSuccess) {
            cr.setSourceRGBA(0.2, 0.8, 0.5, 1.0);
        } else {
            cr.setSourceRGBA(1.0, 1.0, 1.0, 0.9);
        }

        cr.save();
        cr.translate(centerX, centerY);
        for (let i = 0; i < 4; i++) {
            cr.rotate(HALF_PI);
            const offset = this._isSuccess ? 0 : Math.sin(this._phase + i) * 6;
            cr.moveTo(-size, -size + 25);
            cr.curveTo(-size + offset, -size + offset, -size + offset, -size + offset, -size + 25, -size);
        }
        cr.stroke();
        cr.restore();

        if (!this._isSuccess) {
            cr.setLineWidth(1.5);
            cr.setSourceRGBA(1.0, 1.0, 1.0, 0.15);
            for (let x = -35; x <= 35; x += 15) {
                const shift = Math.sin(this._phase + x / 10) * 12;
                cr.moveTo(centerX + x + shift, centerY - 45);
                cr.lineTo(centerX + x - shift, centerY + 45);
            }
            cr.stroke();
        } else {
            cr.setLineWidth(5);
            cr.setSourceRGBA(0.2, 0.8, 0.5, 1.0);
            cr.moveTo(centerX - 15, centerY);
            cr.lineTo(centerX - 5, centerY + 10);
            cr.lineTo(centerX + 20, centerY - 15);
            cr.stroke();
        }
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

export default class HowdyFaceIDExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._container = null;
        this._canvas = null;
        this._monitor = null;
        this._indicator = null;
        this._enabled = true;
        this._lastStatus = '';
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
                if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT) {
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
            const [success, contents] = this._statusFile.load_contents(null);
            if (!success) return;
            const status = textDecoder.decode(contents).trim().toLowerCase();
            if (status === this._lastStatus) return;
            this._lastStatus = status;

            if (status === 'start') {
                this._showAnimation();
            } else if (status === 'success') {
                this._signalSuccess();
            } else if (status === 'stop' || status === '') {
                this._removeAnimation();
            }
        } catch (e) {
            console.error(`[HowdyFaceID] Read status error: ${e.message}`);
        }
    }

    _showAnimation() {
        if (this._container || !this._enabled) return;

        this._container = new St.Widget({
            style_class: 'faceid-container',
            layout_manager: new Clutter.BinLayout(),
        });
        this._canvas = new FaceIDCanvasEngineFinal();
        this._container.add_child(this._canvas);
        Main.layoutManager.addChrome(this._container);

        const monitor = Main.layoutManager.primaryMonitor;
        this._container.set_position(monitor.x + (monitor.width / 2) - 100, monitor.y + 120);

        this._tickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
            if (this._canvas) this._canvas.updatePhase();
            return GLib.SOURCE_CONTINUE;
        });

        this._container.opacity = 0;
        this._container.ease({ opacity: 255, duration: 300 });

        this._autoHideId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 8000, () => {
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
        if (this._canvas) {
            this._canvas.setSuccess(true);
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
        this._lastStatus = '';

        if (this._container) {
            const containerToDestroy = this._container;
            this._container = null;
            this._canvas = null;

            containerToDestroy.ease({
                opacity: 0,
                duration: 400,
                onComplete: () => {
                    Main.layoutManager.removeChrome(containerToDestroy);
                    containerToDestroy.destroy();
                },
            });
        }
    }

    getAnimationEnabled() {
        return this._enabled;
    }

    setAnimationEnabled(enabled) {
        this._enabled = enabled;
        if (!enabled) this._removeAnimation();
    }
}
