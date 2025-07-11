'use strict';

/**
 * static-bg@yourname
 * GNOME Shell 48 Extension
 * Keeps the wallpaper static during workspace switching
 */

import * as WorkspaceAnimation from 'resource:///org/gnome/shell/ui/workspaceAnimation.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let _origMonitorInit = null;
let childAddedSignal = null;

export default class Extension {
  enable() {
    // Don’t double‑patch
    if (_origMonitorInit) return;

    // Save original
    _origMonitorInit = WorkspaceAnimation.MonitorGroup.prototype._init;

    // Patch in our version
    WorkspaceAnimation.MonitorGroup.prototype._init = function(monitor, workspaceIndices, movingWindow) {
      // First call the stock initializer
      _origMonitorInit.call(this, monitor, workspaceIndices, movingWindow);

      // === Start static‑bg tweaks ===

      // 1) Make the overlay transparent so the real wallpaper stays
      this.set_style('background-color: transparent;');

      // 2) Hide all the cloned wallpaper actors
      this._workspaceGroups.forEach(group => {
        if (group._background)
          group._background.opacity = 0;
      });

      // 3) Scale down the originals so only clones animate
      this._hiddenWindows = [];
      global.get_window_actors().forEach(actor => {
        const mw = actor.metaWindow;
        if (mw?.get_monitor() === monitor.index) {
          actor.scale_x = 0;
          actor.scale_y = 0;
          this._hiddenWindows.push(actor);
        }
      });

      // 4) When the animation finishes (MonitorGroup is destroyed), restore scales
      this.connect('destroy', () => {
        this._hiddenWindows.forEach(actor => {
          actor.scale_x = 1;
          actor.scale_y = 1;
        });
      });

      // === End static‑bg tweaks ===
    };

    childAddedSignal = Main.uiGroup.connect('child-added', (_, actor) => {
      if (actor?.name === 'bms-animation-backgroundgroup') {
        actor.visible = false;
        log('[static-bg] Hiding Blur My Shell workspace transition blur');
      }
    });

    log(`[static-bg] enabled`);
  }

  disable() {
    if (!_origMonitorInit) return;

    if (childAddedSignal) {
      Main.uiGroup.disconnect(childAddedSignal);
      childAddedSignal = null;
    }

    // Restore original
    WorkspaceAnimation.MonitorGroup.prototype._init = _origMonitorInit;
    _origMonitorInit = null;

    log(`[static-bg] disabled`);
  }
}
