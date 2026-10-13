import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const textDecoder = new TextDecoder();

// Quick Settings Toggle for Howdy Face ID Animation
const HowdyAnimationToggle = GObject.registerClass(
class HowdyAnimationToggle extends QuickSettings.QuickToggle {
    _init(extension) {
        super._init({
            title: 'Howdy Face ID',
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

const HowdyIndicator = GObject.registerClass(
class HowdyIndicator extends QuickSettings.SystemIndicator {
    _init(extension) {
        super._init();
        this._toggle = new HowdyAnimationToggle(extension);
        this.quickSettingsItems.push(this._toggle);
    }
});

export default class HowdyFaceIDExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._animation = null;
        this._ring = null;
        this._innerGlow = null;
        this._scanLine1 = null;
        this._scanLine2 = null;

        this._isAnimating = false;
        this._indicator = null;
        this._enabled = true;

        this._monitor = null;
        this._pollId = null;
        this._scanTimeoutId = null;
        this._autoHideId = null;
        this._successTimeoutId = null;

        const runtimeDir = GLib.get_user_runtime_dir();
        this._statusPath = GLib.build_filenamev([runtimeDir, 'howdy_status']);
        this._statusFile = Gio.File.new_for_path(this._statusPath);

        this._settingsFile = GLib.build_filenamev([
            GLib.get_user_config_dir(),
            'howdy-faceid-animation-settings.json'
        ]);
    }

    enable() {
        this._loadSettings();

        if (!this._indicator) {
            this._indicator = new HowdyIndicator(this);
            Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
        }

        if (this._enabled) {
            this._startMonitoring();
        }
    }

    disable() {
        this._stopMonitoring();
        this._removeAnimation();

        if (this._indicator) {
            this._indicator.quickSettingsItems.forEach(item => item.destroy());
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    getAnimationEnabled() {
        return this._enabled;
    }

    setAnimationEnabled(enabled) {
        this._enabled = enabled;
        this._saveSettings();

        if (enabled) {
            this._startMonitoring();
        } else {
            this._stopMonitoring();
            this._removeAnimation();
        }
    }

    _loadSettings() {
        try {
            if (GLib.file_test(this._settingsFile, GLib.FileTest.EXISTS)) {
                const [success, contents] = GLib.file_get_contents(this._settingsFile);
                if (success) {
                    const settings = JSON.parse(textDecoder.decode(contents));
                    this._enabled = settings.enabled !== undefined ? settings.enabled : true;
                }
            }
        } catch (_) {
            this._enabled = true;
        }
    }

    _saveSettings() {
        try {
            const settings = { enabled: this._enabled };
            GLib.file_set_contents(this._settingsFile, JSON.stringify(settings));
        } catch (_) {}
    }

    _startMonitoring() {
        this._setupFileMonitor();

        if (!this._pollId) {
            this._pollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
                this._checkHowdyProcess();
                return GLib.SOURCE_CONTINUE;
            });
        }
    }

    _stopMonitoring() {
        if (this._monitor) {
            this._monitor.cancel();
            this._monitor = null;
        }
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = null;
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

    _checkHowdyProcess() {
        try {
            const commands = [
                'pgrep -f "python.*howdy"',
                'pgrep -x howdy',
                'pgrep -f "/lib/security/howdy"',
                'pgrep -f "/usr/lib/howdy/compare.py"'
            ];

            let processFound = false;
            for (const cmd of commands) {
                try {
                    const [success, stdout] = GLib.spawn_command_line_sync(cmd);
                    if (success && stdout.length > 0) {
                        processFound = true;
                        break;
                    }
                } catch (_) {}
            }

            if (processFound && !this._isAnimating) {
                this._showAnimation();
            } else if (!processFound && this._isAnimating && !this._successTimeoutId) {
                this._removeAnimation();
            }
        } catch (_) {}
    }

    _showAnimation() {
        if (this._animation || !this._enabled) return;

        this._isAnimating = true;

        // Container widget
        this._animation = new St.Widget({
            style_class: 'howdy-faceid-container',
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
            opacity: 0,
        });

        // Animated Ring
        this._ring = new St.Widget({
            style_class: 'howdy-faceid-ring',
            width: 120,
            height: 120,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._ring.set_pivot_point(0.5, 0.5);

        // Inner Glow
        this._innerGlow = new St.Widget({
            style_class: 'howdy-faceid-glow',
            width: 100,
            height: 100,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._innerGlow.set_pivot_point(0.5, 0.5);

        // Rotating Scan Lines
        this._scanLine1 = new St.Widget({
            style_class: 'howdy-faceid-scanline',
            width: 2,
            height: 120,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            opacity: 0,
        });
        this._scanLine1.set_pivot_point(0.5, 0.5);

        this._scanLine2 = new St.Widget({
            style_class: 'howdy-faceid-scanline',
            width: 120,
            height: 2,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            opacity: 0,
        });
        this._scanLine2.set_pivot_point(0.5, 0.5);

        this._animation.add_child(this._ring);
        this._animation.add_child(this._innerGlow);
        this._animation.add_child(this._scanLine1);
        this._animation.add_child(this._scanLine2);

        Main.layoutManager.addChrome(this._animation, {
            affectsStruts: false,
            trackFullscreen: true,
        });

        // Position at top center
        const monitor = Main.layoutManager.primaryMonitor;
        this._animation.set_position(
            monitor.x + Math.round((monitor.width - 120) / 2),
            monitor.y + Main.panel.height + 24
        );

        this._animation.ease({
            opacity: 255,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        this._startPulseAnimation(this._ring, this._innerGlow);
        this._startScanAnimation(this._scanLine1, this._scanLine2);

        if (this._autoHideId) {
            GLib.source_remove(this._autoHideId);
        }
        this._autoHideId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 7500, () => {
            this._autoHideId = null;
            this._removeAnimation();
            return GLib.SOURCE_REMOVE;
        });
    }

    _startPulseAnimation(ring, glow) {
        const animateRing = () => {
            if (!this._isAnimating || !ring) return;
            ring.ease({
                scale_x: 1.15,
                scale_y: 1.15,
                opacity: 180,
                duration: 800,
                mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
                onComplete: () => {
                    if (!this._isAnimating || !ring) return;
                    ring.ease({
                        scale_x: 1.0,
                        scale_y: 1.0,
                        opacity: 255,
                        duration: 800,
                        mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
                        onComplete: () => {
                            if (this._isAnimating) {
                                animateRing();
                            }
                        }
                    });
                }
            });
        };

        const animateGlow = () => {
            if (!this._isAnimating || !glow) return;
            glow.ease({
                opacity: 255,
                duration: 600,
                mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
                onComplete: () => {
                    if (!this._isAnimating || !glow) return;
                    glow.ease({
                        opacity: 100,
                        duration: 600,
                        mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
                        onComplete: () => {
                            if (this._isAnimating) {
                                animateGlow();
                            }
                        }
                    });
                }
            });
        };

        animateRing();
        animateGlow();
    }

    _startScanAnimation(line1, line2) {
        const animateScan = () => {
            if (!this._isAnimating || !line1 || !line2) return;
            line1.opacity = 255;
            line2.opacity = 255;

            line1.ease({
                rotation_angle_z: 180,
                opacity: 0,
                duration: 1200,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                onComplete: () => {
                    if (!this._isAnimating || !line1) return;
                    line1.rotation_angle_z = 0;
                    if (this._isAnimating) {
                        this._scanTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                            this._scanTimeoutId = null;
                            animateScan();
                            return GLib.SOURCE_REMOVE;
                        });
                    }
                }
            });

            line2.ease({
                rotation_angle_z: 180,
                opacity: 0,
                duration: 1200,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                onComplete: () => {
                    if (!this._isAnimating || !line2) return;
                    line2.rotation_angle_z = 0;
                }
            });
        };

        animateScan();
    }

    _signalSuccess() {
        if (!this._animation) {
            this._showAnimation();
        }

        if (this._ring) {
            this._ring.add_style_class_name('success');
            this._ring.ease({
                scale_x: 1.18,
                scale_y: 1.18,
                duration: 250,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._ring?.ease({
                        scale_x: 1.0,
                        scale_y: 1.0,
                        duration: 200,
                        mode: Clutter.AnimationMode.EASE_IN_QUAD,
                    });
                }
            });
        }

        if (this._successTimeoutId) {
            GLib.source_remove(this._successTimeoutId);
        }
        this._successTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._successTimeoutId = null;
            this._removeAnimation();
            return GLib.SOURCE_REMOVE;
        });
    }

    _removeAnimation() {
        if (!this._animation) return;

        this._isAnimating = false;

        if (this._scanTimeoutId) {
            GLib.source_remove(this._scanTimeoutId);
            this._scanTimeoutId = null;
        }
        if (this._autoHideId) {
            GLib.source_remove(this._autoHideId);
            this._autoHideId = null;
        }
        if (this._successTimeoutId) {
            GLib.source_remove(this._successTimeoutId);
            this._successTimeoutId = null;
        }

        const animToDestroy = this._animation;
        this._animation = null;
        this._ring = null;
        this._innerGlow = null;
        this._scanLine1 = null;
        this._scanLine2 = null;

        animToDestroy.ease({
            opacity: 0,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                Main.layoutManager.removeChrome(animToDestroy);
                animToDestroy.destroy();
            }
        });

        try {
            if (this._statusFile.query_exists(null)) {
                this._statusFile.replace_contents('', null, false, Gio.FileCreateFlags.NONE, null);
            }
        } catch (_) {}
    }
}
