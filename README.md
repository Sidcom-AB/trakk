# Timeline Editor - Vanilla JS

A vanilla JavaScript web component version of the [React Timeline Editor](https://github.com/xzdarcy/react-timeline-editor), converted to work without any framework dependencies.

## Features

- **Web Component** - Uses native Custom Elements API
- **Timeline Playback Engine** - Powerful animation timeline with effects system
- **Interactive UI** - Drag & drop, resize items, movable cursor
- **Click to Create** - Click on empty row space to create new timeline items
- **2-Way Data Binding** - All changes immediately reflected in data
- **Import/Export** - Save and load timeline data as JSON
- **LocalStorage** - Persist timelines in browser storage
- **Responsive** - Works with any container size
- **No Dependencies** - Pure vanilla JavaScript, no React or other frameworks
- **Event System** - Custom event emitter for animation callbacks
- **Lightweight** - Minimal footprint compared to the React version

## Quick Start

1. Open `demo.html` in a modern browser
2. Play with the timeline controls
3. Drag actions, resize them, or add new ones

## Usage

### Basic Setup

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="src/timeline.css">
</head>
<body>
  <timeline-editor id="timeline"></timeline-editor>

  <script type="module">
    import { TimelineEditor } from './src/timeline-editor.js';

    const timeline = document.getElementById('timeline');

    // Define effects
    const effects = {
      'fade': {
        id: 'fade',
        name: 'Fade',
        source: {
          enter: ({ action, time }) => console.log('Enter', action.id),
          update: ({ action, time }) => {
            const progress = (time - action.start) / (action.end - action.start);
            // Do something with progress
          },
          leave: ({ action, time }) => console.log('Leave', action.id)
        }
      }
    };

    // Define timeline data
    const editorData = [
      {
        id: 'row-1',
        actions: [
          {
            id: 'action-1',
            start: 0,
            end: 5,
            effectId: 'fade'
          }
        ]
      }
    ];

    // Initialize
    timeline.setData(editorData, effects);
  </script>
</body>
</html>
```

### API

#### Timeline Element Methods

```javascript
// Set timeline data
timeline.setData(editorData, effects);

// Get timeline data (2-way bound - reflects all changes)
const data = timeline.getData(); // { editorData, effects }

// Playback controls
timeline.play({ autoEnd: true }); // Play with auto-end
timeline.play({ toTime: 10 });    // Play to specific time
timeline.pause();

// Time controls
timeline.setTime(5.0);  // Set current time
const time = timeline.getTime();  // Get current time

// Access engine directly
timeline.engine.setPlayRate(2.0);  // 2x speed

// Export/Import
const json = timeline.exportJSON();  // Export as JSON string
timeline.importJSON(json);           // Import from JSON string

// LocalStorage persistence
timeline.saveToLocalStorage();       // Save to browser storage
timeline.loadFromLocalStorage();     // Load from browser storage
timeline.saveToLocalStorage('my-timeline'); // Custom key
```

#### Effect Source Callbacks

Each effect can define these callbacks:

```javascript
const effect = {
  id: 'myEffect',
  name: 'My Effect',
  source: {
    // Called when action enters timeline (time reaches action.start)
    enter: ({ action, effect, time, isPlaying, engine }) => {},

    // Called every frame while action is active
    update: ({ action, effect, time, isPlaying, engine }) => {},

    // Called when action leaves timeline (time passes action.end)
    leave: ({ action, effect, time, isPlaying, engine }) => {},

    // Called when playback starts (if action is active)
    start: ({ action, effect, time, isPlaying, engine }) => {},

    // Called when playback stops (if action is active)
    stop: ({ action, effect, time, isPlaying, engine }) => {}
  }
};
```

#### Events

```javascript
// Listen for time changes during playback
timeline.engine.on('setTimeByTick', ({ time }) => {
  console.log('Current time:', time);
});

// Listen for play/pause
timeline.engine.on('play', () => console.log('Playing'));
timeline.engine.on('paused', () => console.log('Paused'));

// Listen for data changes (drag, resize, etc.)
timeline.addEventListener('change', (e) => {
  console.log('Data changed:', e.detail.editorData);
  // Auto-save example
  timeline.saveToLocalStorage();
});

// Listen for new items created by clicking on rows
timeline.addEventListener('itemcreated', (e) => {
  console.log('New item:', e.detail.item);
  console.log('In row:', e.detail.row);
});
```

#### Callbacks

The timeline supports comprehensive callbacks for user interaction events:

```javascript
timeline.setCallbacks({
  // Action move callbacks
  onActionMoveStart: ({ action, row }) => {
    console.log('Started moving', action.id);
  },
  onActionMoving: ({ action, row, start, end }) => {
    console.log('Moving to', start, '-', end);
    return false; // Return false to cancel the move
  },
  onActionMoveEnd: ({ action, row }) => {
    console.log('Finished moving', action.id);
  },

  // Action resize callbacks
  onActionResizeStart: ({ action, row, direction }) => {
    console.log('Started resizing', action.id, direction);
  },
  onActionResizing: ({ action, row, start, end }) => {
    console.log('Resizing to', start, '-', end);
    return false; // Return false to cancel the resize
  },
  onActionResizeEnd: ({ action, row }) => {
    console.log('Finished resizing', action.id);
  },

  // Action interaction callbacks
  onClickAction: (e, { action, row, time }) => {
    console.log('Clicked action', action.id);
  },
  onDoubleClickAction: (e, { action, row, time }) => {
    console.log('Double-clicked action', action.id);
  },
  onContextMenuAction: (e, { action, row, time }) => {
    console.log('Right-clicked action', action.id);
  },

  // Row interaction callbacks
  onClickRow: (e, { row, time }) => {
    console.log('Clicked row', row.id);
  },
  onDoubleClickRow: (e, { row, time }) => {
    console.log('Double-clicked row', row.id);
  },
  onContextMenuRow: (e, { row, time }) => {
    console.log('Right-clicked row', row.id);
  },

  // Cursor callbacks
  onCursorDragStart: (e, { time }) => {
    console.log('Started dragging cursor');
    return false; // Return false to cancel cursor drag
  },
  onCursorDrag: (e, { time }) => {
    console.log('Dragging cursor to', time);
    return false; // Return false to cancel cursor move
  },
  onCursorDragEnd: (e, { time }) => {
    console.log('Finished dragging cursor');
  },

  // Time area callback
  onClickTimeArea: (e, { time }) => {
    console.log('Clicked time area at', time);
    return false; // Return false to prevent cursor move
  },

  // Custom renderers
  getActionRender: (action, row) => {
    // Return HTML string or HTMLElement
    return `<strong>${action.id}</strong>`;
  },
  getScaleRender: (scale) => {
    // Return HTML string or HTMLElement
    return scale.toFixed(1) + 's';
  }
});

// Or set individual callbacks
timeline.on('onClickAction', (e, { action }) => {
  console.log('Action clicked:', action.id);
});
```

### Data Structure

#### EditorData (Array of Rows)
```javascript
[
  {
    id: 'row-1',           // Unique row ID
    name: 'Track 1',       // Optional row label (displayed in left area)
    actions: [...],        // Array of actions
    rowHeight: 32          // Optional custom height
  }
]
```

#### Action
```javascript
{
  id: 'action-1',          // Unique action ID
  start: 0,                // Start time
  end: 5,                  // End time
  effectId: 'effect1',     // Effect to use
  flexible: true,          // Can resize (default: true)
  movable: true,           // Can move (default: true)
  disable: false,          // Disabled (default: false)
  selected: false          // Selected state
}
```

## File Structure

```
timeline/
├── src/
│   ├── timeline-engine.js   # Core playback engine
│   ├── timeline-editor.js   # Web component
│   └── timeline.css         # Styles
├── demo.html                # Demo page
└── README.md
```

## Configuration

The timeline can be configured by modifying the `config` object in the TimelineEditor constructor:

```javascript
config: {
  scale: 1,              // Time per scale unit
  scaleWidth: 160,       // Width of each scale unit (px)
  scaleCount: 20,        // Number of scale units
  scaleSplitCount: 10,   // Sub-divisions per scale
  startLeft: 20,         // Left padding (px)
  minScaleCount: 20,     // Minimum scale units
  maxScaleCount: Infinity, // Maximum scale units
  rowHeight: 32,         // Default row height (px)
  autoScroll: false,     // Auto-scroll during drag
  hideCursor: false,     // Hide the cursor
  disableDrag: false,    // Disable all dragging
  gridSnap: false        // Snap to grid (not implemented)
}
```

## Browser Support

Requires a modern browser with support for:
- Custom Elements (Web Components)
- ES6 Modules
- ES6 Classes
- RequestAnimationFrame

## Differences from React Version

This vanilla JS version:
- ✅ No React or framework dependencies
- ✅ Simpler, more direct DOM manipulation
- ✅ Smaller bundle size
- ✅ Same core timeline engine
- ⚠️ No virtualization (all rows rendered)
- ⚠️ Simpler drag & drop (no interact.js)
- ⚠️ No advanced features like control panels

## License

MIT (same as original React Timeline Editor)

## Credits

Based on [xzdarcy/react-timeline-editor](https://github.com/xzdarcy/react-timeline-editor)
