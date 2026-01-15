/**
 * Event Emitter for Timeline Engine
 */
class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }

  off(event, callback) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (!this.events[event]) return true;
    this.events[event].forEach(callback => callback(data));
    return true;
  }
}

/**
 * Timeline Engine - Core animation timeline player
 * Can run independently from the editor
 */
export class TimelineEngine extends EventEmitter {
  constructor() {
    super();

    this._timerId = null;
    this._playRate = 1;
    this._currentTime = 0;
    this._playState = 'paused';
    this._prev = 0;

    this._effectMap = {};
    this._actionMap = {};
    this._actionSortIds = [];

    this._next = 0;
    this._activeActionIds = [];
  }

  get isPlaying() {
    return this._playState === 'playing';
  }

  get isPaused() {
    return this._playState === 'paused';
  }

  set effects(effects) {
    this._effectMap = effects;
  }

  set data(data) {
    if (this.isPlaying) this.pause();
    this._dealData(data);
    this._dealClear();
    this._dealEnter(this._currentTime);
  }

  /**
   * Set playback rate
   */
  setPlayRate(rate) {
    if (rate <= 0) {
      console.error('Error: rate cannot be less than 0!');
      return false;
    }
    this._playRate = rate;
    this.emit('afterSetPlayRate', { rate, engine: this });
    return true;
  }

  getPlayRate() {
    return this._playRate;
  }

  /**
   * Re-render current time
   */
  reRender() {
    if (this.isPlaying) return;
    this._tickAction(this._currentTime);
  }

  /**
   * Set playback time
   */
  setTime(time, isTick = false) {
    this._currentTime = time;
    this._next = 0;
    this._dealLeave(time);
    this._dealEnter(time);

    if (isTick) {
      this.emit('setTimeByTick', { time, engine: this });
    } else {
      this.emit('afterSetTime', { time, engine: this });
    }
    return true;
  }

  getTime() {
    return this._currentTime;
  }

  /**
   * Play timeline
   */
  play({ toTime, autoEnd } = {}) {
    const currentTime = this.getTime();
    if (this.isPlaying || (toTime && toTime <= currentTime)) return false;

    this._playState = 'playing';
    this._startOrStop('start');
    this.emit('play', { engine: this });

    this._timerId = requestAnimationFrame((time) => {
      this._prev = time;
      this._tick({ now: time, autoEnd, to: toTime });
    });
    return true;
  }

  /**
   * Pause playback
   */
  pause() {
    if (this.isPlaying) {
      this._playState = 'paused';
      this._startOrStop('stop');
      this.emit('paused', { engine: this });
    }
    if (this._timerId) {
      cancelAnimationFrame(this._timerId);
    }
  }

  _end() {
    this.pause();
    this.emit('ended', { engine: this });
  }

  _startOrStop(type) {
    for (let i = 0; i < this._activeActionIds.length; i++) {
      const actionId = this._activeActionIds[i];
      const action = this._actionMap[actionId];
      const effect = this._effectMap[action?.effectId];

      if (type === 'start') {
        effect?.source?.start?.({ action, effect, engine: this, isPlaying: this.isPlaying, time: this.getTime() });
      } else if (type === 'stop') {
        effect?.source?.stop?.({ action, effect, engine: this, isPlaying: this.isPlaying, time: this.getTime() });
      }
    }
  }

  _tick(data) {
    if (this.isPaused) return;
    const { now, autoEnd, to } = data;

    let currentTime = this.getTime() + (Math.min(1000, now - this._prev) / 1000) * this._playRate;
    this._prev = now;

    if (to && to <= currentTime) currentTime = to;
    this.setTime(currentTime, true);

    this._tickAction(currentTime);

    if (!to && autoEnd && this._next >= this._actionSortIds.length && this._activeActionIds.length === 0) {
      this._end();
      return;
    }

    if (to && to <= currentTime) {
      this._end();
      return;
    }

    if (this.isPaused) return;
    this._timerId = requestAnimationFrame((time) => {
      this._tick({ now: time, autoEnd, to });
    });
  }

  _tickAction(time) {
    this._dealEnter(time);
    this._dealLeave(time);

    const length = this._activeActionIds.length;
    for (let i = 0; i < length; i++) {
      const actionId = this._activeActionIds[i];
      const action = this._actionMap[actionId];
      const effect = this._effectMap[action.effectId];
      if (effect?.source?.update) {
        effect.source.update({ time, action, isPlaying: this.isPlaying, effect, engine: this });
      }
    }
  }

  _dealClear() {
    while (this._activeActionIds.length) {
      const actionId = this._activeActionIds.shift();
      const action = this._actionMap[actionId];
      const effect = this._effectMap[action?.effectId];
      if (effect?.source?.leave) {
        effect.source.leave({ action, effect, engine: this, isPlaying: this.isPlaying, time: this.getTime() });
      }
    }
    this._next = 0;
  }

  _dealEnter(time) {
    while (this._actionSortIds[this._next]) {
      const actionId = this._actionSortIds[this._next];
      const action = this._actionMap[actionId];

      if (!action.disable) {
        if (action.start > time) break;
        if (action.end > time && !this._activeActionIds.includes(actionId)) {
          const effect = this._effectMap[action.effectId];
          if (effect?.source?.enter) {
            effect.source.enter({ action, effect, isPlaying: this.isPlaying, time, engine: this });
          }
          this._activeActionIds.push(actionId);
        }
      }
      this._next++;
    }
  }

  _dealLeave(time) {
    let i = 0;
    while (this._activeActionIds[i]) {
      const actionId = this._activeActionIds[i];
      const action = this._actionMap[actionId];

      if (action.start > time || action.end < time) {
        const effect = this._effectMap[action.effectId];
        if (effect?.source?.leave) {
          effect.source.leave({ action, effect, isPlaying: this.isPlaying, time, engine: this });
        }
        this._activeActionIds.splice(i, 1);
        continue;
      }
      i++;
    }
  }

  _dealData(data) {
    const actions = [];
    data.forEach(row => {
      // Support both new schema (blocks) and old schema (actions/items)
      const items = row.blocks || row.items || row.actions || [];
      actions.push(...items);
    });
    const sortActions = actions.sort((a, b) => a.start - b.start);
    const actionMap = {};
    const actionSortIds = [];

    sortActions.forEach(action => {
      actionSortIds.push(action.id);
      actionMap[action.id] = { ...action };
    });
    this._actionMap = actionMap;
    this._actionSortIds = actionSortIds;
  }
}
