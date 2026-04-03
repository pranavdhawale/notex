import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "./KeyboardShortcutsPopup.css";

interface KeyboardShortcutsPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC");
const modKey = isMac ? "Cmd" : "Ctrl";

const shortcutGroups = [
  {
    title: "Text Formatting",
    shortcuts: [
      { action: "Bold", key: `${modKey}+B` },
      { action: "Italic", key: `${modKey}+I` },
      { action: "Strikethrough", key: `${modKey}+Shift+X` },
      { action: "Underline", key: `${modKey}+U` },
      { action: "Highlight", key: "—", noShortcut: true },
    ],
  },
  {
    title: "Headings",
    shortcuts: [
      { action: "Heading 1", key: `${modKey}+Alt+1` },
      { action: "Heading 2", key: `${modKey}+Alt+2` },
      { action: "Heading 3", key: `${modKey}+Alt+3` },
    ],
  },
  {
    title: "Lists",
    shortcuts: [
      { action: "Bullet List", key: `${modKey}+Shift+8` },
      { action: "Ordered List", key: `${modKey}+Shift+7` },
      { action: "Task List", key: "—", noShortcut: true },
    ],
  },
  {
    title: "Blocks",
    shortcuts: [
      { action: "Blockquote", key: `${modKey}+Shift+B` },
      { action: "Code Block", key: `${modKey}+Alt+C` },
      { action: "Horizontal Rule", key: "—", noShortcut: true },
    ],
  },
  {
    title: "Alignment",
    shortcuts: [
      { action: "Align Left", key: "—", noShortcut: true },
      { action: "Align Center", key: "—", noShortcut: true },
      { action: "Align Right", key: "—", noShortcut: true },
      { action: "Justify", key: "—", noShortcut: true },
    ],
  },
  {
    title: "Other",
    shortcuts: [
      { action: "Save", key: `${modKey}+S` },
      { action: "Link", key: "—", noShortcut: true },
      { action: "Insert Table", key: "—", noShortcut: true },
      { action: "Shortcuts", key: `${modKey}+/` },
    ],
  },
];

export const KeyboardShortcutsPopup: React.FC<KeyboardShortcutsPopupProps> = ({
  isOpen,
  onClose,
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="shortcuts-backdrop" onClick={onClose} />

      {/* Popup */}
      <div
        className="shortcuts-popup"
        role="dialog"
        aria-label="Keyboard shortcuts"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-header">
          <h3>Keyboard Shortcuts</h3>
          <button
            type="button"
            className="shortcuts-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="shortcuts-content">
          {shortcutGroups.map((group) => (
            <div key={group.title} className="shortcuts-group">
              <h4 className="shortcuts-group-title">{group.title}</h4>
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.action} className="shortcuts-row">
                  <span className="shortcuts-action">{shortcut.action}</span>
                  <span className={`shortcuts-key ${shortcut.noShortcut ? "no-shortcut" : ""}`}>
                    {shortcut.key}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
};