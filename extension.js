/*
 * Static Workspace Background extension for GNOME Shell 48+
 * Copyright 2026 Cleo Menezes Jr.
 *
 * Inspired by V-Shell
 * Copyright 2022-2025 GdH and JianZcar
 *
 * This software is released under the GNU General Public License v3 or later.
 * See <http://www.gnu.org/licenses/> for details.
 */

import * as WorkspaceAnimation from 'resource:///org/gnome/shell/ui/workspaceAnimation.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';

import { computeBounceParams } from './bounce.js';

// Signs follow MonitorGroup's progress setter, so overshoot matches the
// slide direction.
function _bounceTranslation(group, overshoot) {
  if (global.workspace_manager.layout_rows === -1)
    return {x: 0, y: -overshoot};
  if (group.get_text_direction() === Clutter.TextDirection.RTL)
    return {x: overshoot, y: 0};
  return {x: -overshoot, y: 0};
}

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

      // Zero the originals, not the clones: Clutter.Clone paints its source
      // regardless of scale. Mosaic pins per-frame transforms
      // (MiniatureEnforceEffect) on window actors that undo that scale, so
      // detach their effects for the switch.
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

      // Mosaic's icon overlays sit on top and ignore the scale trick; fade
      // them so the static icon doesn't linger while the clone slides.
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

    // St.ReducedMotion only exists on Shell 51+.
    _origEaseProperty = WorkspaceAnimation.MonitorGroup.prototype.ease_property;
    WorkspaceAnimation.MonitorGroup.prototype.ease_property = function(property, value, params = {}) {
      const reducedMotion = St.Settings.get().reducedMotion;
      const reduce = St.ReducedMotion?.REDUCE !== undefined &&
        reducedMotion === St.ReducedMotion.REDUCE;
      const bounce = !reduce && property === 'progress'
        ? computeBounceParams({
            duration: params.duration,
            target: value,
            current: this.progress,
          })
        : null;

      // Overshoot lives in translation_x/y, keeping progress in [0,1]; the
      // adjustment binding turns anything outside into NaN. Clear leftovers
      // before each slide so an interrupted overshoot doesn't offset it.
      if (property === 'progress') {
        this._container.remove_transition('translation_x');
        this._container.remove_transition('translation_y');
        this._container.translation_x = 0;
        this._container.translation_y = 0;
      }

      if (bounce) {
        console.log(`[static-workspace-background] bounce ${bounce.slideDuration}ms +${bounce.returnDuration}ms`);
        _origEaseProperty.call(this, property, bounce.target, {
          duration: bounce.slideDuration,
          mode: Clutter.AnimationMode.EASE_OUT_SINE,
          onComplete: () => {
            if (this.get_stage() === null)
              return;
            const {x, y} = _bounceTranslation(this, bounce.overshootPx);
            this._container.translation_x = x;
            this._container.translation_y = y;
            this._container.ease({
              translation_x: 0,
              translation_y: 0,
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

    // Another extension may put a wallpaper panel on the uiGroup; hide it
    // so only the real wallpaper stays, without naming the extension.
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
