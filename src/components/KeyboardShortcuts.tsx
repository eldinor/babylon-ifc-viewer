interface KeyboardShortcutsProps {
  isOpen: boolean;
  onClose: () => void;
  sidebarCollapsed: boolean;
}

interface ShortcutItem {
  keys: string[];
  action: string;
}

const GROUPS: Array<{ title: string; items: ShortcutItem[] }> = [
  {
    title: "General",
    items: [
      { keys: ["?"], action: "Open/close shortcuts" },
      { keys: ["Esc"], action: "Close shortcuts dialog" },
    ],
  },
  {
    title: "Camera",
    items: [
      { keys: ["F"], action: "Fit selected element/subtree" },
      { keys: ["R"], action: "Zoom to parent element" },
    ],
  },
  {
    title: "Tree Navigation",
    items: [
      { keys: ["ArrowUp"], action: "Move to previous item" },
      { keys: ["ArrowDown"], action: "Move to next item" },
      { keys: ["ArrowLeft"], action: "Collapse / move to parent" },
      { keys: ["ArrowRight"], action: "Expand" },
      { keys: ["Enter"], action: "Select focused item" },
      { keys: ["Space"], action: "Select focused item" },
      { keys: ["Ctrl", "Click"], action: "Toggle item in selection" },
      { keys: ["Shift", "Click"], action: "Select range from anchor to item" },
      { keys: ["Ctrl", "Enter"], action: "Toggle focused item in selection" },
      { keys: ["Shift", "Enter"], action: "Select focused range from anchor" },
    ],
  },
  {
    title: "Pick Modes",
    items: [
      { keys: ["Ctrl", "S"], action: "Select mode" },
      { keys: ["Ctrl", "I"], action: "Isolate mode" },
      { keys: ["Ctrl", "M"], action: "Measure mode" },
      { keys: ["Ctrl", "N"], action: "Inspect mode" },
      { keys: ["Ctrl", "C"], action: "Toggle clip" },
    ],
  },
];

function KeyboardShortcuts({ isOpen, onClose, sidebarCollapsed }: KeyboardShortcutsProps) {
  if (!isOpen) return null;

  return (
    <div
      className={`shortcuts-overlay ${sidebarCollapsed ? "sidebar-collapsed" : "sidebar-open"}`}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
    >
      <div className="shortcuts-panel" onClick={(event) => event.stopPropagation()}>
        <div className="shortcuts-header">
          <h3>Keyboard Shortcuts</h3>
          <button type="button" className="shortcuts-close-btn" onClick={onClose} title="Close">
            x
          </button>
        </div>
        <div className="shortcuts-content">
          {GROUPS.map((group) => (
            <div key={group.title} className="shortcuts-group">
              <h4>{group.title}</h4>
              {group.items.map((item) => (
                <div key={`${group.title}-${item.action}`} className="shortcut-row">
                  <div className="shortcut-keys">
                    {item.keys.map((key) => (
                      <kbd key={key} className="shortcut-key">
                        {key}
                      </kbd>
                    ))}
                  </div>
                  <span className="shortcut-action">{item.action}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default KeyboardShortcuts;
