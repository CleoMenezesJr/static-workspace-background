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
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

import { computeBounceParams } from './bounce.js';

let _origMonitorInit = null;
let _origEaseProperty = null;
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
      // Other extensions may pin per-frame transforms on window actors (e.g.
      // Mosaic's MiniatureEnforceEffect), which would undo that scale mid-switch;
      // detach their effects for the duration and restore them on destroy.
      this._hiddenWindows = [];
      global.get_window_actors().forEach(actor => {
        const mw = actor.metaWindow;
        if (mw?.get_monitor() === monitor.index) {
          const effects = actor.get_effects() ?? [];
          effects.forEach(e => actor.remove_effect(e));
          this._hiddenWindows.push({actor, scaleX: actor.scale_x, scaleY: actor.scale_y, effects});
          actor.scale_x = 0;
          actor.scale_y = 0;
        }
      });

      // Non-window children of window_group (e.g. Mosaic's icon overlays) sit
      // on top and ignore the scale trick; fade those by type so the static
      // icon doesn't linger while the real window's clone slides.
      this._hiddenOverlays = global.window_group.get_children()
        .filter(child => child.constructor?.$gtype?.name === 'MosaicMiniatureClickOverlay')
        .map(o => ({actor: o, opacity: o.opacity}));
      this._hiddenOverlays.forEach(({actor}) => { actor.opacity = 0; });

      this.connect('destroy', () => {
        _groupsActive--;
        this._hiddenWindows.forEach(({actor, scaleX, scaleY, effects}) => {
          actor.scale_x = scaleX;
          actor.scale_y = scaleY;
          effects.forEach(e => actor.add_effect(e));
        });
        this._hiddenOverlays.forEach(({actor, opacity}) => { actor.opacity = opacity; });
      });

      _groupsActive++;
    };

    // Fast switches get a brief bounce; slow gestures
    // (duration > BOUNCE_MAX_MS) settle without it.
    _origEaseProperty = WorkspaceAnimation.MonitorGroup.prototype.ease_property;
    WorkspaceAnimation.MonitorGroup.prototype.ease_property = function(property, value, params = {}) {
      const bounce = property === 'progress'
        ? computeBounceParams({
            duration: params.duration,
            target: value,
            current: this.progress,
            baseDistance: this.baseDistance,
          })
        : null;

      if (bounce) {
        console.log(`[static-workspace-background] bounce ${bounce.slideDuration}ms +${bounce.returnDuration}ms`);
        _origEaseProperty.call(this, property, bounce.intermediate, {
          duration: bounce.slideDuration,
          mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
          onComplete: () => {
            if (this.get_stage() === null)
              return;
            _origEaseProperty.call(this, property, bounce.target, {
              duration: bounce.returnDuration,
              mode: Clutter.AnimationMode.EASE_IN_OUT_CUBIC,
              onComplete: params.onComplete,
            });
          },
        });
        return;
      }

      _origEaseProperty.call(this, property, value, params);
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

    if (_origEaseProperty) {
      WorkspaceAnimation.MonitorGroup.prototype.ease_property = _origEaseProperty;
      _origEaseProperty = null;
    }

    console.log(`[static-workspace-background] disabled`);
  }
}
