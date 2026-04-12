import React, { memo, useState, useRef, useEffect } from "react";
import { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Strikethrough,
  Underline as UnderlineIcon,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  TerminalSquare,
  Minus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link,
  Table as TableIcon,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Palette,
  Type,
  IndentIncrease,
  IndentDecrease,
} from "lucide-react";

// Color palette for text color
const TEXT_COLORS = [
  { name: "Default", color: "inherit" },
  { name: "Gray", color: "#6b7280" },
  { name: "Brown", color: "#92400e" },
  { name: "Orange", color: "#ea580c" },
  { name: "Yellow", color: "#ca8a04" },
  { name: "Green", color: "#16a34a" },
  { name: "Blue", color: "#2563eb" },
  { name: "Purple", color: "#9333ea" },
  { name: "Pink", color: "#db2777" },
  { name: "Red", color: "#dc2626" },
];

// Font size options
const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "36px", "48px"];

interface ToolbarProps {
  editor: Editor | null;
}

const ToolbarComponent: React.FC<ToolbarProps> = ({ editor }) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontSizePicker, setShowFontSizePicker] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const fontSizePickerRef = useRef<HTMLDivElement>(null);

  // Close pickers when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
      if (fontSizePickerRef.current && !fontSizePickerRef.current.contains(e.target as Node)) {
        setShowFontSizePicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!editor) {
    return null;
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);

    if (url === null) {
      return;
    }

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const setCurrentColor = (color: string) => {
    if (color === "inherit") {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(color).run();
    }
    setShowColorPicker(false);
  };

  const setCurrentFontSize = (size: string) => {
    editor.chain().focus().setFontSize(size).run();
    setShowFontSizePicker(false);
  };

  return (
    <div className="editor-toolbar-simple">
      {/* Button Content */}
      <div style={{ display: 'contents', zIndex: 10 }}>
        {/* Text Formatting */}
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`toolbar-btn-circle ${editor.isActive("bold") ? "is-active" : ""}`}
          title="Bold (Cmd+B)"
        >
          <Bold size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`toolbar-btn-circle ${editor.isActive("italic") ? "is-active" : ""}`}
          title="Italic (Cmd+I)"
        >
          <Italic size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`toolbar-btn-circle ${editor.isActive("strike") ? "is-active" : ""}`}
          title="Strikethrough"
        >
          <Strikethrough size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`toolbar-btn-circle ${editor.isActive("underline") ? "is-active" : ""}`}
          title="Underline"
        >
          <UnderlineIcon size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          className={`toolbar-btn-circle ${editor.isActive("highlight") ? "is-active" : ""}`}
          title="Highlight"
        >
          <Highlighter size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleSubscript().run()}
          className={`toolbar-btn-circle ${editor.isActive("subscript") ? "is-active" : ""}`}
          title="Subscript (Cmd+,)"
        >
          <SubscriptIcon size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
          className={`toolbar-btn-circle ${editor.isActive("superscript") ? "is-active" : ""}`}
          title="Superscript (Cmd+.)"
        >
          <SuperscriptIcon size={16} />
        </button>

        <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)", margin: "0 4px" }}></div>

        {/* Color Picker */}
        <div ref={colorPickerRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className={`toolbar-btn-circle ${editor.isActive("textStyle") ? "is-active" : ""}`}
            title="Text Color"
          >
            <Palette size={16} />
          </button>
          {showColorPicker && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: "50%",
                transform: "translateX(-50%)",
                marginTop: "8px",
                background: "rgba(30, 30, 35, 0.95)",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "12px",
                padding: "8px",
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: "4px",
                zIndex: 100,
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
              }}
            >
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.color}
                  onClick={() => setCurrentColor(c.color)}
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "6px",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    background: c.color === "inherit" ? "transparent" : c.color,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "10px",
                    color: c.color === "inherit" ? "rgba(255,255,255,0.6)" : "#fff",
                  }}
                  title={c.name}
                >
                  {c.color === "inherit" ? "A" : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Font Size Picker */}
        <div ref={fontSizePickerRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowFontSizePicker(!showFontSizePicker)}
            className="toolbar-btn-circle"
            title="Font Size"
          >
            <Type size={16} />
          </button>
          {showFontSizePicker && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: "50%",
                transform: "translateX(-50%)",
                marginTop: "8px",
                background: "rgba(30, 30, 35, 0.95)",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "12px",
                padding: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                zIndex: 100,
                maxHeight: "200px",
                overflowY: "auto",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
              }}
            >
              {FONT_SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => setCurrentFontSize(size)}
                  style={{
                    padding: "6px 12px",
                    background: "transparent",
                    border: "none",
                    color: "rgba(255, 255, 255, 0.8)",
                    cursor: "pointer",
                    fontSize: "12px",
                    borderRadius: "6px",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {size}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)", margin: "0 4px" }}></div>

        {/* Headings */}
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`toolbar-btn-circle ${editor.isActive("heading", { level: 1 }) ? "is-active" : ""}`}
          title="Heading 1"
        >
          <Heading1 size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`toolbar-btn-circle ${editor.isActive("heading", { level: 2 }) ? "is-active" : ""}`}
          title="Heading 2"
        >
          <Heading2 size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`toolbar-btn-circle ${editor.isActive("heading", { level: 3 }) ? "is-active" : ""}`}
          title="Heading 3"
        >
          <Heading3 size={18} />
        </button>

        <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)", margin: "0 4px" }}></div>

        {/* Lists */}
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`toolbar-btn-circle ${editor.isActive("bulletList") ? "is-active" : ""}`}
          title="Bullet List"
        >
          <List size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`toolbar-btn-circle ${editor.isActive("orderedList") ? "is-active" : ""}`}
          title="Ordered List"
        >
          <ListOrdered size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={`toolbar-btn-circle ${editor.isActive("taskList") ? "is-active" : ""}`}
          title="Task List"
        >
          <CheckSquare size={16} />
        </button>

        <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)", margin: "0 4px" }}></div>

        {/* Blocks */}
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`toolbar-btn-circle ${editor.isActive("blockquote") ? "is-active" : ""}`}
          title="Quote"
        >
          <Quote size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={`toolbar-btn-circle ${editor.isActive("codeBlock") ? "is-active" : ""}`}
          title="Code Block"
        >
          <TerminalSquare size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className="toolbar-btn-circle"
          title="Horizontal Rule"
        >
          <Minus size={16} />
        </button>

        <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)", margin: "0 4px" }}></div>

        {/* Alignment */}
        <button
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          className={`toolbar-btn-circle ${editor.isActive({ textAlign: "left" }) ? "is-active" : ""}`}
          title="Align Left"
        >
          <AlignLeft size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          className={`toolbar-btn-circle ${editor.isActive({ textAlign: "center" }) ? "is-active" : ""}`}
          title="Align Center"
        >
          <AlignCenter size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          className={`toolbar-btn-circle ${editor.isActive({ textAlign: "right" }) ? "is-active" : ""}`}
          title="Align Right"
        >
          <AlignRight size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          className={`toolbar-btn-circle ${editor.isActive({ textAlign: "justify" }) ? "is-active" : ""}`}
          title="Justify"
        >
          <AlignJustify size={16} />
        </button>

        <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)", margin: "0 4px" }}></div>

        {/* Indent/Outdent */}
        <button
          onClick={() => editor.chain().focus().outdent().run()}
          className="toolbar-btn-circle"
          title="Outdent (Shift+Tab)"
        >
          <IndentDecrease size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().indent().run()}
          className="toolbar-btn-circle"
          title="Indent (Tab)"
        >
          <IndentIncrease size={16} />
        </button>

        <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)", margin: "0 4px" }}></div>

        {/* Links & Tables */}
        <button
          onClick={setLink}
          className={`toolbar-btn-circle ${editor.isActive("link") ? "is-active" : ""}`}
          title="Link"
        >
          <Link size={16} />
        </button>
        <button
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
          className="toolbar-btn-circle"
          title="Insert Table"
        >
          <TableIcon size={16} />
        </button>
      </div>
    </div>
  );
};

// Memoize to prevent re-renders on every keystroke in the editor
export const Toolbar = memo(ToolbarComponent);
