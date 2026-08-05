/*
 * Static Workspace Background extension for GNOME Shell 48+
 * Copyright 2026 Cleo Menezes Jr.
 *
 * Based on V-Shell
 * Copyright 2022-2025 GdH and JianZcar
 *
 * This software is released under the GNU General Public License v3 or later.
 * See <http://www.gnu.org/licenses/> for details.
 */

import * as WorkspaceAnimation from 'resource:///org/gnome/shell/ui/workspaceAnimation.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from 'gi://Meta';

let _origMonitorInit = null;
let _groupsActive = 0;
let _childAddedId = null;

export default class Extension {
  enable() {
    if (_origMonitorInit) return;

    _origMonitorInit = WorkspaceAnimation.MonitorGroup.prototype._init;

    WorkspaceAnimation.MonitorGroup.prototype._init = function(monitor, workspaceIndices, movingWindow) {
      _origMonitorInit.call(this, monitor, workspaceIndices, movingWindow);

      // Transparent overlay, hidden cloned wallpapers: only the real wallpaper stays.
      this.set_style('background-color: transparent;');
      this._workspaceGroups.forEach(group => {
        if (group._background)
          group._background.opacity = 0;
      });

      // Clutter.Clone paints the source regardless of its own scale, so scaling
      // the originals to zero hides them while their clones keep sliding.
      this._hiddenWindows = [];
      global.get_window_actors().forEach(actor => {
        const mw = actor.metaWindow;
        if (mw?.get_monitor() === monitor.index) {
          actor.scale_x = 0;
          actor.scale_y = 0;
          this._hiddenWindows.push(actor);
        }
      });

      this.connect('destroy', () => {
        _groupsActive--;
        this._hiddenWindows.forEach(actor => {
          actor.scale_x = 1;
          actor.scale_y = 1;
        });
      });

      _groupsActive++;
    };

    // GNOME never puts a wallpaper panel on the uiGroup by itself. When another
    // extension does, we hide it so only the real wallpaper stays visible, without
    // naming or importing that extension.
    _childAddedId = Main.uiGroup.connect('child-added', (_, actor) => {
      if (_groupsActive > 0 && actor instanceof Meta.BackgroundGroup) {
        actor.visible = false;
      }
    });

    console.log(`[static-workspace-background] enabled`);
  }

  disable() {
    if (_childAddedId) {
      Main.uiGroup.disconnect(_childAddedId);
      _childAddedId = null;
    }

    WorkspaceAnimation.MonitorGroup.prototype._init = _origMonitorInit;
    _origMonitorInit = null;

    console.log(`[static-workspace-background] disabled`);
  }
}
