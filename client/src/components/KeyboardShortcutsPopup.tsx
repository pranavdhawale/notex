import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { isMacOS } from "../utils/platform";
import "./KeyboardShortcutsPopup.css";

interface KeyboardShortcutsPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

const isMac = isMacOS();
const modKey = isMac ? "Cmd" : "Ctrl";
const altKey = isMac ? "Opt" : "Alt";

const shortcutGroups = [
  {
    title: "Document & Room",
    shortcuts: [
      { action: "Save Snapshot", key: `${modKey}+S` },
      { action: "Lock/Unlock Room", key: `${modKey}+L` },
      { action: "Show Shortcuts", key: `${modKey}+/` },
    ],
  },
  {
    title: "Text Formatting",
    shortcuts: [
      { action: "Bold", key: `${modKey}+B` },
      { action: "Italic", key: `${modKey}+I` },
      { action: "Underline", key: `${modKey}+U` },
      { action: "Strikethrough", key: "—", noShortcut: true },
      { action: "Highlight", key: `${modKey}+Shift+H` },
    ],
  },
  {
    title: "Text Style",
    shortcuts: [
      { action: "Subscript", key: `${modKey}+,` },
      { action: "Superscript", key: `${modKey}+.` },
      { action: "Text Color", key: "—", noShortcut: true },
    ],
  },
  {
    title: "Headings",
    shortcuts: [
      { action: "Heading 1", key: `${modKey}+${altKey}+1` },
      { action: "Heading 2", key: `${modKey}+${altKey}+2` },
      { action: "Heading 3", key: `${modKey}+${altKey}+3` },
      { action: "Paragraph", key: `${modKey}+${altKey}+0` },
    ],
  },
  {
    title: "Lists",
    shortcuts: [
      { action: "Ordered List", key: `${modKey}+Shift+7` },
      { action: "Bullet List", key: `${modKey}+Shift+8` },
      { action: "Task List", key: `${modKey}+Shift+9` },
    ],
  },
  {
    title: "Blocks",
    shortcuts: [
      { action: "Blockquote", key: `${modKey}+Shift+B` },
      { action: "Code Block", key: `${modKey}+Shift+C` },
      { action: "Horizontal Rule", key: "—", noShortcut: true },
    ],
  },
  {
    title: "Insert",
    shortcuts: [
      { action: "Link", key: "—", noShortcut: true },
      { action: "Image Gallery", key: `${modKey}+Shift+P` },
      { action: "Insert Table", key: "—", noShortcut: true },
    ],
  },
  {
    title: "Indentation",
    shortcuts: [
      { action: "Indent", key: "Tab" },
      { action: "Outdent", key: "Shift+Tab" },
    ],
  },
  {
    title: "Line Breaks",
    shortcuts: [
      { action: "Hard Break", key: "Shift+Enter" },
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