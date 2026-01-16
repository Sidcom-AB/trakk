import { TimelineEngine } from './timeline-engine.js';

/**
 * Utility functions
 */
const parserTimeToPixel = (time, { startLeft, scale, scaleWidth }) => {
  return (time / scale) * scaleWidth + startLeft;
};

const parserPixelToTime = (pixel, { startLeft, scale, scaleWidth }) => {
  return ((pixel - startLeft) / scaleWidth) * scale;
};

/**
 * Timeline Editor Web Component
 */
export class TimelineEditor extends HTMLElement {
  constructor() {
    super();

    // Default configuration
    this.config = {
      scale: 1,
      scaleWidth: 160,
      scaleCount: 20,
      scaleSplitCount: 10,
      startLeft: 120,
      contentPadding: 0,
      minScaleCount: 10,
      maxScaleCount: Infinity,
      rowHeight: 32,
      autoScroll: true,
      hideCursor: false,
      disableDrag: false,
      gridSnap: true,
      grid: 1
    };

    // Callback functions
    this.callbacks = {
      onActionMoveStart: null,
      onActionMoving: null,
      onActionMoveEnd: null,
      onActionResizeStart: null,
      onActionResizing: null,
      onActionResizeEnd: null,
      onClickRow: null,
      onClickAction: null,
      onDoubleClickRow: null,
      onDoubleClickAction: null,
      onContextMenuRow: null,
      onContextMenuAction: null,
      onCursorDragStart: null,
      onCursorDrag: null,
      onCursorDragEnd: null,
      onClickTimeArea: null,
      getActionRender: null,
      getScaleRender: null
    };

    // State
    this.tracks = [];
    this.cursorTime = 0;
    this.isPlaying = false;
    this._scrollX = 0;
    this._scrollY = 0;

    // DOM refs
    this.timeAreaEl = null;
    this.timeAreaWrapperEl = null;
    this.editAreaEl = null;
    this.labelColumnEl = null;
    this.labelInnerEl = null;
    this.cursorEl = null;

    // Engine
    this.engine = new TimelineEngine();

    // Drag state
    this.dragState = {
      isDragging: false,
      isActuallyDragging: false, // Only true after threshold
      type: null,
      action: null,
      row: null,
      rowIndex: null,
      startX: 0,
      startY: 0,
      currentLeft: 0,
      currentWidth: 0,
      deltaX: 0,
      totalDeltaX: 0 // Track total movement
    };

  }

  connectedCallback() {
    this.className = 'timeline-editor';
    this.render();
    this._setupEngineListeners();
    this._setupResizeObserver();
  }

  disconnectedCallback() {
    this.engine.pause();
    this._cleanup();
  }

  _cleanup() {
    document.removeEventListener('mousemove', this._boundHandleMouseMove);
    document.removeEventListener('mouseup', this._boundHandleMouseUp);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
  }

  _setupResizeObserver() {
    // Watch for container size changes
    this._resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        // Re-render on resize to update layout
        if (this.editAreaEl) {
          this._updateCursorPosition();
        }
      }
    });
    this._resizeObserver.observe(this);
  }

  /**
   * Set timeline data
   */
  setData(tracks) {
    this.tracks = tracks || [];
    this.engine.data = this.tracks;
    this.render();
  }

  /**
   * Update configuration
   */
  setConfig(newConfig) {
    Object.assign(this.config, newConfig);
    this.render();
  }

  /**
   * Set callback functions
   */
  setCallbacks(callbacks) {
    Object.assign(this.callbacks, callbacks);
  }

  /**
   * Set a single callback
   */
  on(event, callback) {
    if (this.callbacks.hasOwnProperty(event)) {
      this.callbacks[event] = callback;
    }
  }

  /**
   * Get current timeline data (for export)
   */
  getData() {
    return {
      tracks: this.tracks
    };
  }

  /**
   * Export timeline to JSON string
   */
  exportJSON() {
    return JSON.stringify(this.getData(), null, 2);
  }

  /**
   * Import timeline from JSON string
   */
  importJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      // Support both old (editorData) and new (tracks) formats
      const tracks = data.tracks || data.editorData || [];
      this.setData(tracks);
      return true;
    } catch (e) {
      console.error('Failed to import timeline data:', e);
      return false;
    }
  }

  /**
   * Save to localStorage
   */
  saveToLocalStorage(key = 'timeline-data') {
    try {
      localStorage.setItem(key, this.exportJSON());
      return true;
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
      return false;
    }
  }

  /**
   * Load from localStorage
   */
  loadFromLocalStorage(key = 'timeline-data') {
    try {
      const data = localStorage.getItem(key);
      if (data) {
        return this.importJSON(data);
      }
      return false;
    } catch (e) {
      console.error('Failed to load from localStorage:', e);
      return false;
    }
  }

  /**
   * Set current time
   */
  setTime(time) {
    this.cursorTime = Math.max(0, time);
    this.engine.setTime(this.cursorTime);
    this._updateCursorPosition();
  }

  /**
   * Get current time
   */
  getTime() {
    return this.engine.getTime();
  }

  /**
   * Get total time (end time of the last block across all tracks)
   */
  getTotalTime() {
    let maxEnd = 0;
    for (const track of this.tracks) {
      const blocks = track.blocks || track.items || track.actions || [];
      for (const block of blocks) {
        if (block.end > maxEnd) {
          maxEnd = block.end;
        }
      }
    }
    return maxEnd;
  }

  /**
   * Play timeline
   */
  play(options = {}) {
    return this.engine.play(options);
  }

  /**
   * Pause timeline
   */
  pause() {
    this.engine.pause();
  }

  /**
   * Sync engine data with current tracks (call after modifying tracks)
   */
  _syncEngineData() {
    this.engine.data = this.tracks;
  }

  /**
   * Emit change event and sync engine
   */
  _emitChange() {
    this._syncEngineData();
    this.dispatchEvent(new CustomEvent('change', {
      detail: { tracks: this.tracks }
    }));
  }

  /**
   * Setup engine event listeners
   */
  _setupEngineListeners() {
    this.engine.on('play', () => {
      this.isPlaying = true;
      this.classList.add('timeline-editor-playing');
    });

    this.engine.on('paused', () => {
      this.isPlaying = false;
      this.classList.remove('timeline-editor-playing');
    });

    this.engine.on('setTimeByTick', ({ time }) => {
      this.cursorTime = time;
      this._updateCursorPosition(true); // Auto-scroll during playback
    });

    this.engine.on('afterSetTime', ({ time }) => {
      this.cursorTime = time;
      this._updateCursorPosition(false); // No auto-scroll for manual time set
    });
  }

  /**
   * Render the timeline editor
   */
  render() {
    this.innerHTML = '';

    // Time area (header row with ruler)
    this.timeAreaEl = this._createTimeArea();
    this.appendChild(this.timeAreaEl);

    // Cursor (created before content wrapper so it's behind label column)
    if (!this.config.hideCursor) {
      this.cursorEl = this._createCursor();
      this.appendChild(this.cursorEl);
    }

    // Set CSS custom properties for dynamic values
    this.style.setProperty('--timeline-start-left', `${this.config.startLeft}px`);
    this.style.setProperty('--timeline-content-padding', `${this.config.contentPadding}px`);
    this.style.setProperty('--timeline-scale-width', `${this.config.scaleWidth}px`);

    // Spacer div to cover cursor line between time area and content
    const spacer = document.createElement('div');
    spacer.className = 'timeline-editor-spacer';
    spacer.style.cssText = `
      height: 10px;
      width: calc(var(--timeline-start-left) - 4px);
      background-color: #191b1d;
      flex-shrink: 0;
      position: relative;
      z-index: 101;
    `;
    this.appendChild(spacer);

    // Main content wrapper (labels + edit area side by side)
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'timeline-editor-content';
    contentWrapper.style.cssText = `
      display: flex;
      flex: 1 1 0;
      overflow: hidden;
      position: relative;
      min-height: 0;
      min-width: 0;
      height: 0;
    `;

    // Frozen label column
    this.labelColumnEl = this._createLabelColumn();
    contentWrapper.appendChild(this.labelColumnEl);

    // Edit area (scrollable)
    this.editAreaEl = this._createEditArea();
    contentWrapper.appendChild(this.editAreaEl);

    this.appendChild(contentWrapper);

    // Restore scroll position and sync
    if (this._scrollX > 0) {
      this.editAreaEl.scrollLeft = this._scrollX;
      this._syncTimeAreaScroll();
    }
    if (this._scrollY > 0) {
      this.editAreaEl.scrollTop = this._scrollY;
      this._syncLabelColumnScroll();
    }
    this._updateCursorPosition();
  }

  /**
   * Create time area (ruler)
   */
  _createTimeArea() {
    const timeArea = document.createElement('div');
    timeArea.className = 'timeline-editor-time-area';

    // Content padding to push content away from label column edge
    const contentPadding = this.config.contentPadding;

    // Create a wrapper that will be scrolled
    const wrapper = document.createElement('div');
    wrapper.className = 'timeline-editor-time-area-wrapper';
    const totalWidth = this.config.scaleCount * this.config.scaleWidth + this.config.startLeft + contentPadding;
    wrapper.style.width = `${totalWidth}px`;
    wrapper.style.height = '100%';
    wrapper.style.position = 'relative';

    const interact = document.createElement('div');
    interact.className = 'timeline-editor-time-area-interact';
    interact.style.width = `${totalWidth}px`;

    // Calculate total number of tick marks including subdivisions
    const totalTicks = this.config.scaleCount * this.config.scaleSplitCount;
    const tickWidth = this.config.scaleWidth / this.config.scaleSplitCount;

    for (let i = 0; i <= totalTicks; i++) {
      const unit = document.createElement('div');
      const isBig = i % this.config.scaleSplitCount === 0;
      unit.className = `timeline-editor-time-unit ${isBig ? 'timeline-editor-time-unit-big' : ''}`;
      unit.style.width = `${tickWidth}px`;

      // Position first tick at startLeft + contentPadding to clear the blocker
      // The blocker covers the full startLeft area, so we add contentPadding to push "0.0s" label into view
      if (i === 0) {
        unit.style.marginLeft = `${this.config.startLeft + contentPadding - tickWidth + 1}px`;
      }

      if (isBig) {
        const scale = document.createElement('div');
        scale.className = 'timeline-editor-time-unit-scale';
        const scaleValue = (i / this.config.scaleSplitCount) * this.config.scale;

        // Use custom render if provided
        if (this.callbacks.getScaleRender) {
          const customContent = this.callbacks.getScaleRender(scaleValue);
          if (typeof customContent === 'string') {
            scale.innerHTML = customContent;
          } else if (customContent instanceof HTMLElement) {
            scale.innerHTML = '';
            scale.appendChild(customContent);
          }
        } else {
          // First tick shows "0s", others show decimal like "1.0s"
          scale.textContent = i === 0 ? '0s' : `${scaleValue.toFixed(1)}s`;
        }

        unit.appendChild(scale);
      }

      interact.appendChild(unit);
    }

    wrapper.appendChild(interact);
    timeArea.appendChild(wrapper);

    // Store wrapper reference for scroll sync
    this.timeAreaWrapperEl = wrapper;

    // Click handler for time area
    timeArea.addEventListener('click', (e) => {
      if (this.isPlaying) return;
      const rect = timeArea.getBoundingClientRect();
      // Account for contentPadding in time conversion
      const x = e.clientX - rect.left + this._scrollX - contentPadding;
      const time = parserPixelToTime(x, this.config);

      // Callback
      if (this.callbacks.onClickTimeArea) {
        const result = this.callbacks.onClickTimeArea(e, { time });
        if (result === false) return;
      }

      this.setTime(Math.max(0, time));
    });

    return timeArea;
  }

  /**
   * Create frozen label column
   */
  _createLabelColumn() {
    const labelColumn = document.createElement('div');
    labelColumn.className = 'timeline-editor-label-column';
    labelColumn.style.cssText = `
      width: ${this.config.startLeft}px;
      flex-shrink: 0;
      overflow: hidden;
      background-color: #191b1d;
      border-right: 1px solid rgba(255, 255, 255, 0.1);
      z-index: 200;
      position: relative;
    `;

    // Inner container that will be transformed for scroll sync
    const labelInner = document.createElement('div');
    labelInner.className = 'timeline-editor-label-inner';
    this.labelInnerEl = labelInner;

    this.tracks.forEach((row, rowIndex) => {
      const labelRow = this._createLabelRow(row, rowIndex);
      labelInner.appendChild(labelRow);
    });

    labelColumn.appendChild(labelInner);
    return labelColumn;
  }

  /**
   * Create a label row (for frozen column)
   */
  _createLabelRow(row, rowIndex) {
    const labelRow = document.createElement('div');
    labelRow.className = 'timeline-editor-label-row';
    labelRow.style.cssText = `
      height: ${row.rowHeight || this.config.rowHeight}px;
      display: flex;
      align-items: center;
      padding: 0 8px;
      color: rgba(255, 255, 255, 0.7);
      font-size: 12px;
      font-weight: 500;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      box-sizing: border-box;
      position: relative;
    `;

    if (rowIndex === 0) {
      labelRow.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';
    }

    labelRow.dataset.rowId = row.id;
    labelRow.dataset.rowIndex = rowIndex;

    // Label text
    const labelText = document.createElement('span');
    labelText.className = 'timeline-editor-label-text';
    labelText.textContent = row.name || '';
    labelText.style.cssText = `
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    labelRow.appendChild(labelText);

    // Make label editable on dblclick (unless locked)
    if (!row.locked) {
      labelRow.style.cursor = 'text';
      labelRow.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this._startLabelEdit(labelRow, labelText, row);
      });
    }

    // Show locked indicator
    if (row.locked) {
      const lockIcon = document.createElement('span');
      lockIcon.className = 'timeline-editor-lock-icon';
      lockIcon.style.cssText = `
        width: 10px;
        height: 10px;
        margin-left: 6px;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='rgba(255,255,255,0.4)'%3E%3Cpath d='M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z'/%3E%3C/svg%3E");
        background-size: contain;
        background-repeat: no-repeat;
        flex-shrink: 0;
      `;
      labelRow.appendChild(lockIcon);
    }

    // Add delete button (unless noDelete is set)
    if (!row.noDelete) {
      const deleteBtn = document.createElement('div');
      deleteBtn.className = 'timeline-editor-row-delete';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteTrack(row);
      });
      labelRow.appendChild(deleteBtn);
    }

    return labelRow;
  }

  /**
   * Create edit area (rows and actions)
   */
  _createEditArea() {
    const editArea = document.createElement('div');
    editArea.className = 'timeline-editor-edit-area';

    // Extra padding to match the time area tick offset (content pushed away from label edge)
    const contentPadding = this.config.contentPadding;
    const totalWidth = this.config.scaleCount * this.config.scaleWidth + contentPadding;

    // Create rows container
    const rowsContainer = document.createElement('div');
    rowsContainer.className = 'timeline-editor-rows';
    rowsContainer.style.position = 'relative';
    rowsContainer.style.width = `${totalWidth}px`;
    rowsContainer.style.minWidth = `${totalWidth}px`;

    this.tracks.forEach((row, rowIndex) => {
      const rowEl = this._createRow(row, rowIndex, totalWidth, contentPadding);
      rowsContainer.appendChild(rowEl);
    });

    editArea.appendChild(rowsContainer);

    // Sync scroll with time area and label column
    editArea.addEventListener('scroll', () => {
      this._scrollX = editArea.scrollLeft;
      this._scrollY = editArea.scrollTop;
      this._syncTimeAreaScroll();
      this._syncLabelColumnScroll();
      this._updateCursorPosition();
    });

    return editArea;
  }

  /**
   * Sync label column scroll with edit area (vertical only)
   */
  _syncLabelColumnScroll() {
    if (!this.labelInnerEl) return;
    this.labelInnerEl.style.transform = `translateY(-${this._scrollY}px)`;
  }

  /**
   * Create a row (edit area only, no label - labels are in frozen column)
   */
  _createRow(row, rowIndex, totalWidth, contentPadding) {
    const rowEl = document.createElement('div');
    rowEl.className = 'timeline-editor-edit-row';
    rowEl.style.height = `${row.rowHeight || this.config.rowHeight}px`;
    rowEl.style.width = `${totalWidth}px`;

    // Offset background grid by contentPadding to align with time ruler (size comes from CSS variable)
    rowEl.style.backgroundPosition = `${contentPadding}px 0`;

    rowEl.dataset.rowId = row.id;
    rowEl.dataset.rowIndex = rowIndex;

    // Click handler
    rowEl.addEventListener('click', (e) => {
      // Only if clicking directly on the row (not on an action)
      if (e.target === rowEl) {
        // Cancel any active editing when clicking empty track area
        this._cancelActiveEditing();

        if (this.callbacks.onClickRow) {
          const rect = e.currentTarget.getBoundingClientRect();
          // Edit area starts at 0, account for contentPadding, add startLeft for correct time conversion
          const x = e.clientX - rect.left + this._scrollX - contentPadding + this.config.startLeft;
          const time = parserPixelToTime(x, this.config);
          this.callbacks.onClickRow(e, { row, time });
        }
      }
    });

    // Double-click handler
    rowEl.addEventListener('dblclick', (e) => {
      if (e.target === rowEl && this.callbacks.onDoubleClickRow) {
        const rect = e.currentTarget.getBoundingClientRect();
        // Edit area starts at 0, account for contentPadding, add startLeft for correct time conversion
        const x = e.clientX - rect.left + this._scrollX - contentPadding + this.config.startLeft;
        const time = parserPixelToTime(x, this.config);
        this.callbacks.onDoubleClickRow(e, { row, time });
      }
    });

    // Context menu handler
    rowEl.addEventListener('contextmenu', (e) => {
      if (e.target === rowEl && this.callbacks.onContextMenuRow) {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        // Edit area starts at 0, account for contentPadding, add startLeft for correct time conversion
        const x = e.clientX - rect.left + this._scrollX - contentPadding + this.config.startLeft;
        const time = parserPixelToTime(x, this.config);
        this.callbacks.onContextMenuRow(e, { row, time });
      }
    });

    // Add mousedown handler for creating new items via drag on empty space
    rowEl.addEventListener('mousedown', (e) => {
      // Only if clicking directly on the row (not on an action)
      if (e.target === rowEl || e.target === rowEl.querySelector('.timeline-editor-row-label')) {
        this._handleRowDragStart(e, row, rowIndex);
      }
    });

    // Create items for this row (fallback to actions for backward compatibility)
    const items = row.blocks || row.items || row.actions || [];
    items.forEach((item) => {
      const actionEl = this._createAction(item, row, rowIndex);
      rowEl.appendChild(actionEl);
    });

    return rowEl;
  }

  /**
   * Start editing a track label
   */
  _startLabelEdit(labelRow, labelText, row) {
    if (labelRow.querySelector('input')) return; // Already editing

    const currentName = row.name || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'timeline-editor-row-label-input';
    input.style.cssText = `
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(255,255,255,0.3);
      color: inherit;
      font: inherit;
      outline: none;
      padding: 0;
      margin: 0;
      user-select: text;
      box-sizing: border-box;
    `;

    const finishEdit = () => {
      const newName = input.value.trim();
      row.name = newName;
      labelText.textContent = newName;
      labelText.style.display = '';
      input.remove();

      // Emit change event
      this._emitChange();
      this.dispatchEvent(new CustomEvent('trackrenamed', {
        detail: { track: row, name: newName }
      }));
    };

    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        input.value = currentName;
        input.blur();
      }
    });

    labelText.style.display = 'none';
    labelRow.insertBefore(input, labelText);
    input.focus();
    input.select();
  }

  /**
   * Delete a track
   */
  _deleteTrack(row) {
    // Remove from tracks array
    const idx = this.tracks.indexOf(row);
    if (idx > -1) {
      this.tracks.splice(idx, 1);
    }

    // Re-render
    this.render();

    // Emit events
    this._emitChange();
    this.dispatchEvent(new CustomEvent('trackdeleted', {
      detail: { track: row }
    }));
  }

  /**
   * Delete a block from a track
   */
  _deleteBlock(block, row) {
    const blocks = row.blocks || row.items || row.actions || [];
    const idx = blocks.indexOf(block);
    if (idx > -1) {
      blocks.splice(idx, 1);
    }

    // Re-render
    this.render();

    // Emit events
    this._emitChange();
    this.dispatchEvent(new CustomEvent('blockdeleted', {
      detail: { block, track: row }
    }));
  }

  /**
   * Start editing a block name
   */
  _startBlockNameEdit(actionEl, block, row) {
    const content = actionEl.querySelector('.timeline-editor-action-content');
    if (!content || content.querySelector('input')) return; // Already editing

    const currentName = block.name || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'timeline-editor-block-name-input';
    input.style.cssText = `
      width: 100%;
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(255,255,255,0.3);
      color: inherit;
      font: inherit;
      outline: none;
      padding: 0;
      text-align: center;
      user-select: text;
    `;

    const finishEdit = () => {
      const newName = input.value.trim();
      block.name = newName;

      // Update content display
      if (this.callbacks.getActionRender) {
        const customContent = this.callbacks.getActionRender(block, row);
        if (typeof customContent === 'string') {
          content.innerHTML = customContent;
        }
      } else {
        content.textContent = newName;
      }

      // Emit change event
      this._emitChange();
      this.dispatchEvent(new CustomEvent('blockrenamed', {
        detail: { block, track: row, name: newName }
      }));
    };

    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        input.value = currentName;
        input.blur();
      }
      e.stopPropagation();
    });
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());

    content.innerHTML = '';
    content.appendChild(input);
    input.focus();
    input.select();
  }

  /**
   * Cancel any active block name editing by blurring input fields
   */
  _cancelActiveEditing() {
    const activeInput = this.querySelector('.timeline-editor-block-name-input');
    if (activeInput) {
      activeInput.blur();
    }
    const activeLabelInput = this.querySelector('.timeline-editor-row-label-input');
    if (activeLabelInput) {
      activeLabelInput.blur();
    }
  }

  /**
   * Handle drag start on empty row space to create new item
   */
  _handleRowDragStart(e, row, rowIndex) {
    if (this.isPlaying || this.config.disableDrag || row.locked) return;

    // Only left mouse button
    if (e.button !== 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + this._scrollX;

    e.preventDefault();

    // Content padding offset
    const contentPadding = this.config.contentPadding;
    // Convert pixel to time (edit area starts at 0, account for contentPadding, add startLeft for conversion)
    const startTime = parserPixelToTime(x - contentPadding + this.config.startLeft, this.config);

    // Setup drag state for item creation
    this.dragState.isDragging = true;
    this.dragState.isActuallyDragging = false;
    this.dragState.type = 'item-create';
    this.dragState.row = row;
    this.dragState.rowIndex = rowIndex;
    this.dragState.startX = e.clientX;
    this.dragState.startTime = startTime;
    this.dragState.totalDeltaX = 0;
    this.dragState.newItem = null;
    this.dragState.newItemEl = null;

    this._boundHandleMouseMove = this._handleMouseMove.bind(this);
    this._boundHandleMouseUp = this._handleMouseUp.bind(this);

    document.addEventListener('mousemove', this._boundHandleMouseMove);
    document.addEventListener('mouseup', this._boundHandleMouseUp);
  }

  /**
   * Create an action element
   */
  _createAction(action, row, rowIndex) {
    const actionEl = document.createElement('div');
    actionEl.className = 'timeline-editor-action';
    if (action.selected) {
      actionEl.classList.add('selected');
    }

    // Content padding to match time ruler offset
    const contentPadding = this.config.contentPadding;
    // Edit area starts at 0 (label column is separate), so subtract startLeft, then add contentPadding
    const left = parserTimeToPixel(action.start, this.config) - this.config.startLeft + contentPadding;
    const width = parserTimeToPixel(action.end, this.config) - this.config.startLeft + contentPadding - left;

    actionEl.style.left = `${left}px`;
    actionEl.style.width = `${width}px`;
    actionEl.dataset.actionId = action.id;
    actionEl.dataset.rowIndex = rowIndex;

    // Content
    const content = document.createElement('div');
    content.className = 'timeline-editor-action-content';

    // Use custom render if provided
    if (this.callbacks.getActionRender) {
      const customContent = this.callbacks.getActionRender(action, row);
      if (typeof customContent === 'string') {
        content.innerHTML = customContent;
      } else if (customContent instanceof HTMLElement) {
        content.innerHTML = '';
        content.appendChild(customContent);
      }
    } else {
      // Display block name - only show if explicitly set (non-empty string)
      // Don't fall back to id as that creates ugly display
      content.textContent = action.name || '';
    }
    actionEl.appendChild(content);

    // Resize handles (only if not locked)
    if (action.flexible !== false && !row.locked) {
      const leftStretch = document.createElement('div');
      leftStretch.className = 'timeline-editor-action-left-stretch';
      actionEl.appendChild(leftStretch);

      const rightStretch = document.createElement('div');
      rightStretch.className = 'timeline-editor-action-right-stretch';
      actionEl.appendChild(rightStretch);

      leftStretch.addEventListener('mousedown', (e) => this._handleResizeStart(e, action, row, rowIndex, 'left'));
      rightStretch.addEventListener('mousedown', (e) => this._handleResizeStart(e, action, row, rowIndex, 'right'));
    }

    // Add drag listener for moving (only if not locked)
    if (action.movable !== false && !row.locked) {
      actionEl.addEventListener('mousedown', (e) => {
        // Ignore if clicking on resize handles
        if (e.target.classList.contains('timeline-editor-action-left-stretch') ||
            e.target.classList.contains('timeline-editor-action-right-stretch')) {
          return;
        }
        this._handleMoveStart(e, action, row, rowIndex);
      });
    }

    // Visual indicator for locked track
    if (row.locked) {
      actionEl.classList.add('timeline-editor-action-locked');
      actionEl.style.cursor = 'default';
    }

    // Add delete button for block (unless noDelete is set on block or track is locked)
    if (!action.noDelete && !row.locked) {
      const deleteBtn = document.createElement('div');
      deleteBtn.className = 'timeline-editor-action-delete';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteBlock(action, row);
      });
      deleteBtn.addEventListener('mousedown', (e) => {
        e.stopPropagation(); // Prevent drag start
      });
      actionEl.appendChild(deleteBtn);
    }

    // Click event
    actionEl.addEventListener('click', (e) => {
      if (this.callbacks.onClickAction) {
        const rect = this.editAreaEl.getBoundingClientRect();
        // Edit area starts at 0, account for contentPadding, add startLeft for correct time conversion
        const x = e.clientX - rect.left + this._scrollX - contentPadding + this.config.startLeft;
        const time = parserPixelToTime(x, this.config);
        this.callbacks.onClickAction(e, { action, row, time });
      }
    });

    // Double-click event - edit block name (unless locked)
    actionEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();

      // Allow callback to handle or prevent
      if (this.callbacks.onDoubleClickAction) {
        const rect = this.editAreaEl.getBoundingClientRect();
        // Edit area starts at 0, account for contentPadding, add startLeft for correct time conversion
        const x = e.clientX - rect.left + this._scrollX - contentPadding + this.config.startLeft;
        const time = parserPixelToTime(x, this.config);
        const result = this.callbacks.onDoubleClickAction(e, { action, row, time });
        if (result === false) return;
      }

      // Start editing block name (unless track is locked)
      if (!row.locked) {
        this._startBlockNameEdit(actionEl, action, row);
      }
    });

    // Context menu event
    actionEl.addEventListener('contextmenu', (e) => {
      if (this.callbacks.onContextMenuAction) {
        e.preventDefault();
        const rect = this.editAreaEl.getBoundingClientRect();
        // Edit area starts at 0, account for contentPadding, add startLeft for correct time conversion
        const x = e.clientX - rect.left + this._scrollX - contentPadding + this.config.startLeft;
        const time = parserPixelToTime(x, this.config);
        this.callbacks.onContextMenuAction(e, { action, row, time });
      }
    });

    return actionEl;
  }

  /**
   * Create cursor
   */
  _createCursor() {
    const cursor = document.createElement('div');
    cursor.className = 'timeline-editor-cursor';

    const cursorTop = document.createElement('div');
    cursorTop.className = 'timeline-editor-cursor-top';
    cursor.appendChild(cursorTop);

    const cursorArea = document.createElement('div');
    cursorArea.className = 'timeline-editor-cursor-area';
    cursor.appendChild(cursorArea);

    // Cursor drag
    cursorArea.addEventListener('mousedown', (e) => this._handleCursorDragStart(e));

    return cursor;
  }

  /**
   * Update cursor position
   * @param {boolean} shouldAutoScroll - Whether to auto-scroll to keep cursor visible (only during playback/drag)
   */
  _updateCursorPosition(shouldAutoScroll = false) {
    if (!this.cursorEl) return;
    const contentPadding = this.config.contentPadding;
    // parserTimeToPixel includes startLeft, which now represents the label column width
    // The cursor is positioned relative to the whole timeline including label column
    // Add contentPadding to align with the offset content
    const left = parserTimeToPixel(this.cursorTime, this.config) + contentPadding;
    // Cursor position relative to viewport, accounting for scroll
    this.cursorEl.style.left = `${left - this._scrollX}px`;

    // Auto-scroll to keep cursor visible (only when explicitly requested, e.g. during playback)
    if (shouldAutoScroll && this.config.autoScroll && this.editAreaEl) {
      this._autoScrollToCursor(left);
    }
  }

  /**
   * Auto-scroll edit area to keep cursor visible
   */
  _autoScrollToCursor(cursorLeft) {
    const editAreaWidth = this.editAreaEl.clientWidth;
    // Cursor position in edit area coordinates (subtract startLeft since edit area doesn't include label column)
    const cursorInEditArea = cursorLeft - this.config.startLeft;

    // Define margin - scroll when cursor is within this distance from edge
    const scrollMargin = 50;
    // Maximum scroll step per update for smooth scrolling
    const maxScrollStep = 8;

    // Check if cursor is outside visible area
    const visibleLeft = this._scrollX;
    const visibleRight = this._scrollX + editAreaWidth;

    let targetScrollX = null;

    if (cursorInEditArea < visibleLeft + scrollMargin) {
      // Cursor is too far left - scroll left
      targetScrollX = Math.max(0, cursorInEditArea - scrollMargin);
    } else if (cursorInEditArea > visibleRight - scrollMargin) {
      // Cursor is too far right - scroll right
      targetScrollX = cursorInEditArea - editAreaWidth + scrollMargin;
    }

    if (targetScrollX !== null) {
      // Smooth scroll: move gradually towards target instead of jumping
      const delta = targetScrollX - this._scrollX;
      const step = Math.sign(delta) * Math.min(Math.abs(delta), maxScrollStep);
      this.editAreaEl.scrollLeft = this._scrollX + step;
    }
  }

  /**
   * Sync time area scroll with edit area
   */
  _syncTimeAreaScroll() {
    if (!this.timeAreaWrapperEl) {
      // Fallback: try to find wrapper if reference is lost
      this.timeAreaWrapperEl = this.timeAreaEl?.querySelector('.timeline-editor-time-area-wrapper');
    }
    if (!this.timeAreaWrapperEl) return;
    this.timeAreaWrapperEl.style.transform = `translateX(-${this._scrollX}px)`;
  }

  /**
   * Handle cursor drag start
   */
  _handleCursorDragStart(e) {
    if (this.isPlaying || this.config.disableDrag) return;
    e.preventDefault();
    e.stopPropagation();

    // Callback
    if (this.callbacks.onCursorDragStart) {
      const result = this.callbacks.onCursorDragStart(e, { time: this.cursorTime });
      if (result === false) return;
    }

    this.dragState.isDragging = true;
    this.dragState.type = 'cursor';
    this.dragState.startX = e.clientX;

    this._boundHandleMouseMove = this._handleMouseMove.bind(this);
    this._boundHandleMouseUp = this._handleMouseUp.bind(this);

    document.addEventListener('mousemove', this._boundHandleMouseMove);
    document.addEventListener('mouseup', this._boundHandleMouseUp);
  }

  /**
   * Handle action move start
   */
  _handleMoveStart(e, action, row, rowIndex) {
    if (this.isPlaying || this.config.disableDrag) return;
    e.preventDefault();
    e.stopPropagation();

    // Cancel any active editing before starting drag
    this._cancelActiveEditing();

    this.dragState.isDragging = true;
    this.dragState.isActuallyDragging = false;
    this.dragState.type = 'action-move';
    this.dragState.action = action;
    this.dragState.row = row;
    this.dragState.rowIndex = rowIndex;
    this.dragState.startX = e.clientX;
    this.dragState.deltaX = 0;
    this.dragState.totalDeltaX = 0;
    this.dragState.currentLeft = parserTimeToPixel(action.start, this.config);
    this.dragState.currentWidth = parserTimeToPixel(action.end, this.config) - this.dragState.currentLeft;

    this._boundHandleMouseMove = this._handleMouseMove.bind(this);
    this._boundHandleMouseUp = this._handleMouseUp.bind(this);

    document.addEventListener('mousemove', this._boundHandleMouseMove);
    document.addEventListener('mouseup', this._boundHandleMouseUp);
  }

  /**
   * Handle action resize start
   */
  _handleResizeStart(e, action, row, rowIndex, direction) {
    if (this.isPlaying || this.config.disableDrag) return;
    e.preventDefault();
    e.stopPropagation();

    // Cancel any active editing before starting resize
    this._cancelActiveEditing();

    this.dragState.isDragging = true;
    this.dragState.isActuallyDragging = false;
    this.dragState.type = `action-resize-${direction}`;
    this.dragState.action = action;
    this.dragState.row = row;
    this.dragState.rowIndex = rowIndex;
    this.dragState.startX = e.clientX;
    this.dragState.deltaX = 0;
    this.dragState.totalDeltaX = 0;
    this.dragState.currentLeft = parserTimeToPixel(action.start, this.config);
    this.dragState.currentWidth = parserTimeToPixel(action.end, this.config) - this.dragState.currentLeft;

    this._boundHandleMouseMove = this._handleMouseMove.bind(this);
    this._boundHandleMouseUp = this._handleMouseUp.bind(this);

    document.addEventListener('mousemove', this._boundHandleMouseMove);
    document.addEventListener('mouseup', this._boundHandleMouseUp);
  }

  /**
   * Handle mouse move (unified for all drag types)
   */
  _handleMouseMove(e) {
    if (!this.dragState.isDragging) return;

    if (this.dragState.type === 'cursor') {
      this._handleCursorDrag(e);
    } else if (this.dragState.type === 'action-move') {
      const dx = e.clientX - this.dragState.startX;
      this.dragState.startX = e.clientX;
      this.dragState.deltaX += dx;
      this.dragState.totalDeltaX += Math.abs(dx);

      // Only trigger callback after moving 3px (threshold)
      if (!this.dragState.isActuallyDragging && this.dragState.totalDeltaX > 3) {
        this.dragState.isActuallyDragging = true;

        // Trigger callback now that we're actually dragging
        if (this.callbacks.onActionMoveStart) {
          const result = this.callbacks.onActionMoveStart({
            action: this.dragState.action,
            row: this.dragState.row
          });
          if (result === false) {
            this._cancelDrag();
            return;
          }
        }
      }

      if (this.dragState.isActuallyDragging) {
        this._handleActionMove();
      }
    } else if (this.dragState.type === 'action-resize-left') {
      const dx = e.clientX - this.dragState.startX;
      this.dragState.startX = e.clientX;
      this.dragState.deltaX += dx;
      this.dragState.totalDeltaX += Math.abs(dx);

      // Only trigger callback after moving 3px
      if (!this.dragState.isActuallyDragging && this.dragState.totalDeltaX > 3) {
        this.dragState.isActuallyDragging = true;

        if (this.callbacks.onActionResizeStart) {
          const result = this.callbacks.onActionResizeStart({
            action: this.dragState.action,
            row: this.dragState.row,
            direction: 'left'
          });
          if (result === false) {
            this._cancelDrag();
            return;
          }
        }
      }

      if (this.dragState.isActuallyDragging) {
        this._handleActionResizeLeft();
      }
    } else if (this.dragState.type === 'action-resize-right') {
      const dx = e.clientX - this.dragState.startX;
      this.dragState.startX = e.clientX;
      this.dragState.deltaX += dx;
      this.dragState.totalDeltaX += Math.abs(dx);

      // Only trigger callback after moving 3px
      if (!this.dragState.isActuallyDragging && this.dragState.totalDeltaX > 3) {
        this.dragState.isActuallyDragging = true;

        if (this.callbacks.onActionResizeStart) {
          const result = this.callbacks.onActionResizeStart({
            action: this.dragState.action,
            row: this.dragState.row,
            direction: 'right'
          });
          if (result === false) {
            this._cancelDrag();
            return;
          }
        }
      }

      if (this.dragState.isActuallyDragging) {
        this._handleActionResizeRight();
      }
    } else if (this.dragState.type === 'item-create') {
      const dx = e.clientX - this.dragState.startX;
      this.dragState.totalDeltaX += Math.abs(dx - (this.dragState.lastDx || 0));
      this.dragState.lastDx = dx;

      // Only create item after moving 3px (threshold)
      if (!this.dragState.isActuallyDragging && this.dragState.totalDeltaX > 3) {
        this.dragState.isActuallyDragging = true;
        this._createNewItemFromDrag();
      }

      if (this.dragState.isActuallyDragging && this.dragState.newItem) {
        this._updateNewItemFromDrag(e);
      }
    }
  }

  /**
   * Create new block when drag threshold is reached
   */
  _createNewItemFromDrag() {
    const row = this.dragState.row;
    const rowIndex = this.dragState.rowIndex;
    const startTime = Math.max(0, this.dragState.startTime);

    // Create new block with minimal duration (will expand as user drags)
    const newBlock = {
      id: `block-${Date.now()}`,
      name: '',
      start: startTime,
      end: startTime + 0.1, // Minimal initial duration
      flexible: true,
      movable: true,
      metadata: {}
    };

    // Add to row data (ensure blocks array exists)
    if (!row.blocks) row.blocks = [];
    row.blocks.push(newBlock);
    this.dragState.newItem = newBlock;

    // Create and append the visual element
    const rowEl = this.editAreaEl.querySelector(`[data-row-index="${rowIndex}"]`);
    if (rowEl) {
      const actionEl = this._createAction(newBlock, row, rowIndex);
      actionEl.classList.add('creating');
      rowEl.appendChild(actionEl);
      this.dragState.newItemEl = actionEl;
    }
  }

  /**
   * Update new item size as user drags
   */
  _updateNewItemFromDrag(e) {
    const newItem = this.dragState.newItem;
    if (!newItem) return;

    const rect = this.editAreaEl.getBoundingClientRect();
    const contentPadding = this.config.contentPadding;
    // Edit area starts at 0, account for contentPadding, add startLeft for correct time conversion
    const x = e.clientX - rect.left + this._scrollX - contentPadding + this.config.startLeft;
    const currentTime = parserPixelToTime(x, this.config);

    // Determine start and end based on drag direction
    const startTime = this.dragState.startTime;
    if (currentTime > startTime) {
      newItem.start = Math.max(0, startTime);
      newItem.end = currentTime;
    } else {
      newItem.start = Math.max(0, currentTime);
      newItem.end = startTime;
    }

    // Update visual element (subtract startLeft since edit area starts at 0, add contentPadding)
    if (this.dragState.newItemEl) {
      const contentPadding = this.config.contentPadding;
      const left = parserTimeToPixel(newItem.start, this.config) - this.config.startLeft + contentPadding;
      const width = parserTimeToPixel(newItem.end, this.config) - this.config.startLeft + contentPadding - left;
      this.dragState.newItemEl.style.left = `${left}px`;
      this.dragState.newItemEl.style.width = `${Math.max(10, width)}px`;
    }
  }

  /**
   * Handle mouse up (unified)
   */
  _handleMouseUp(e) {
    if (!this.dragState.isDragging) return;

    const dragType = this.dragState.type;
    const action = this.dragState.action;
    const row = this.dragState.row;
    const wasActuallyDragging = this.dragState.isActuallyDragging;

    // Only trigger end callbacks if we actually dragged (past threshold)
    if (wasActuallyDragging) {
      // End callbacks
      if (dragType === 'cursor' && this.callbacks.onCursorDragEnd) {
        this.callbacks.onCursorDragEnd(e, { time: this.cursorTime });
      } else if (dragType === 'action-move' && this.callbacks.onActionMoveEnd) {
        this.callbacks.onActionMoveEnd({ action, row });
      } else if ((dragType === 'action-resize-left' || dragType === 'action-resize-right') && this.callbacks.onActionResizeEnd) {
        this.callbacks.onActionResizeEnd({ action, row });
      } else if (dragType === 'item-create' && this.dragState.newItem) {
        // Finalize item creation
        const newItem = this.dragState.newItem;
        if (this.dragState.newItemEl) {
          this.dragState.newItemEl.classList.remove('creating');
        }

        // Emit events
        this._emitChange();
        this.dispatchEvent(new CustomEvent('itemcreated', {
          detail: { item: newItem, row: row }
        }));
      }

      if (dragType && dragType.startsWith('action-')) {
        // Emit change event only if we actually moved/resized
        this._emitChange();
      }
    } else if (dragType === 'item-create' && this.dragState.newItem) {
      // User didn't drag enough - remove the item
      const row = this.dragState.row;
      const newItem = this.dragState.newItem;
      const items = row.blocks || row.items || row.actions || [];
      const idx = items.indexOf(newItem);
      if (idx > -1) {
        items.splice(idx, 1);
      }
      if (this.dragState.newItemEl) {
        this.dragState.newItemEl.remove();
      }
    }

    this.dragState.isDragging = false;
    this.dragState.isActuallyDragging = false;
    this.dragState.type = null;
    this.dragState.action = null;
    this.dragState.row = null;
    this.dragState.totalDeltaX = 0;
    this.dragState.newItem = null;
    this.dragState.newItemEl = null;
    this.dragState.lastDx = 0;

    document.removeEventListener('mousemove', this._boundHandleMouseMove);
    document.removeEventListener('mouseup', this._boundHandleMouseUp);
  }

  /**
   * Cancel drag operation
   */
  _cancelDrag() {
    this.dragState.isDragging = false;
    this.dragState.isActuallyDragging = false;
    this.dragState.type = null;
    this.dragState.action = null;
    this.dragState.row = null;
    this.dragState.totalDeltaX = 0;
    this.dragState.newItem = null;
    this.dragState.newItemEl = null;
    this.dragState.lastDx = 0;

    document.removeEventListener('mousemove', this._boundHandleMouseMove);
    document.removeEventListener('mouseup', this._boundHandleMouseUp);
  }

  /**
   * Handle cursor drag
   */
  _handleCursorDrag(e) {
    if (!this.editAreaEl) return;
    const rect = this.editAreaEl.getBoundingClientRect();
    const contentPadding = this.config.contentPadding;
    // Edit area starts at 0, account for contentPadding, add startLeft for correct time conversion
    const x = e.clientX - rect.left + this._scrollX - contentPadding + this.config.startLeft;
    const time = Math.max(0, parserPixelToTime(x, this.config));

    // Callback
    if (this.callbacks.onCursorDrag) {
      const result = this.callbacks.onCursorDrag(e, { time });
      if (result === false) return;
    }

    // Update time and cursor with auto-scroll during drag
    this.cursorTime = time;
    this.engine.setTime(time);
    this._updateCursorPosition(true);
  }

  /**
   * Handle action move
   */
  _handleActionMove() {
    const action = this.dragState.action;
    const row = this.dragState.row;
    const grid = this.config.gridSnap ? this.config.scaleWidth / 10 : 1;

    // Only apply when accumulated delta exceeds grid
    if (Math.abs(this.dragState.deltaX) >= grid) {
      const count = parseInt(this.dragState.deltaX / grid);
      let newLeft = this.dragState.currentLeft + count * grid;

      // Apply grid snapping
      if (this.config.gridSnap) {
        const gridOffset = (newLeft - this.config.startLeft) % grid;
        if (gridOffset !== 0) {
          newLeft = this.config.startLeft + grid * Math.round((newLeft - this.config.startLeft) / grid);
        }
      }

      // Bounds check
      newLeft = Math.max(this.config.startLeft, newLeft);

      // Update current position
      this.dragState.currentLeft = newLeft;
      this.dragState.deltaX = this.dragState.deltaX % grid;

      const startTime = parserPixelToTime(newLeft, this.config);
      const duration = action.end - action.start;

      // Callback
      if (this.callbacks.onActionMoving) {
        const result = this.callbacks.onActionMoving({
          action,
          row,
          start: startTime,
          end: startTime + duration
        });
        if (result === false) return;
      }

      action.start = startTime;
      action.end = startTime + duration;

      this._updateActionElement(action, this.dragState.rowIndex);
    }
  }

  /**
   * Handle action resize left
   */
  _handleActionResizeLeft() {
    const action = this.dragState.action;
    const row = this.dragState.row;
    const grid = this.config.gridSnap ? this.config.scaleWidth / 10 : 1;

    // Only apply when accumulated delta exceeds grid
    if (Math.abs(this.dragState.deltaX) >= grid) {
      const count = parseInt(this.dragState.deltaX / grid);
      let newLeft = this.dragState.currentLeft + count * grid;

      // Apply grid snapping
      if (this.config.gridSnap) {
        const gridOffset = (newLeft - this.config.startLeft) % grid;
        if (gridOffset !== 0) {
          newLeft = this.config.startLeft + grid * Math.round((newLeft - this.config.startLeft) / grid);
        }
      }

      // Keep right edge fixed
      const rightEdge = this.dragState.currentLeft + this.dragState.currentWidth;

      // Minimum width and bounds
      newLeft = Math.max(this.config.startLeft, newLeft);
      const minWidth = 10;
      newLeft = Math.min(newLeft, rightEdge - minWidth);

      const newWidth = rightEdge - newLeft;

      // Update state
      this.dragState.currentLeft = newLeft;
      this.dragState.currentWidth = newWidth;
      this.dragState.deltaX = this.dragState.deltaX % grid;

      const startTime = parserPixelToTime(newLeft, this.config);

      // Callback
      if (this.callbacks.onActionResizing) {
        const result = this.callbacks.onActionResizing({
          action,
          row,
          start: Math.max(0, startTime),
          end: action.end
        });
        if (result === false) return;
      }

      action.start = Math.max(0, startTime);

      this._updateActionElement(action, this.dragState.rowIndex);
    }
  }

  /**
   * Handle action resize right
   */
  _handleActionResizeRight() {
    const action = this.dragState.action;
    const row = this.dragState.row;
    const grid = this.config.gridSnap ? this.config.scaleWidth / 10 : 1;

    // Only apply when accumulated delta exceeds grid
    if (Math.abs(this.dragState.deltaX) >= grid) {
      const count = parseInt(this.dragState.deltaX / grid);
      let newWidth = this.dragState.currentWidth + count * grid;

      // Apply grid snapping to right edge
      const rightPos = this.dragState.currentLeft + newWidth;
      if (this.config.gridSnap) {
        const gridOffset = (rightPos - this.config.startLeft) % grid;
        if (gridOffset !== 0) {
          const snappedRight = this.config.startLeft + grid * Math.round((rightPos - this.config.startLeft) / grid);
          newWidth = snappedRight - this.dragState.currentLeft;
        }
      }

      // Minimum width
      const minWidth = 10;
      newWidth = Math.max(minWidth, newWidth);

      // Update state
      this.dragState.currentWidth = newWidth;
      this.dragState.deltaX = this.dragState.deltaX % grid;

      const endPixel = this.dragState.currentLeft + newWidth;
      const endTime = parserPixelToTime(endPixel, this.config);

      // Callback
      if (this.callbacks.onActionResizing) {
        const result = this.callbacks.onActionResizing({
          action,
          row,
          start: action.start,
          end: Math.max(action.start + 0.1, endTime)
        });
        if (result === false) return;
      }

      action.end = Math.max(action.start + 0.1, endTime);

      this._updateActionElement(action, this.dragState.rowIndex);
    }
  }

  /**
   * Update action element visually
   */
  _updateActionElement(action, rowIndex) {
    const rowEl = this.editAreaEl.querySelector(`[data-row-index="${rowIndex}"]`);
    if (!rowEl) return;

    const actionEl = rowEl.querySelector(`[data-action-id="${action.id}"]`);
    if (!actionEl) return;

    // Content padding to match time ruler offset
    const contentPadding = this.config.contentPadding;
    // Edit area starts at 0 (label column is separate), so subtract startLeft, then add contentPadding
    const left = parserTimeToPixel(action.start, this.config) - this.config.startLeft + contentPadding;
    const width = parserTimeToPixel(action.end, this.config) - this.config.startLeft + contentPadding - left;

    actionEl.style.left = `${left}px`;
    actionEl.style.width = `${width}px`;
  }
}

// Register the custom element
if (!customElements.get('timeline-editor')) {
  customElements.define('timeline-editor', TimelineEditor);
}
