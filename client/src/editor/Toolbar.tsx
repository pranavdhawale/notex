import React, { memo, useState, useRef, useEffect } from "react";
import { Editor, useEditorState } from "@tiptap/react";
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
  IndentIncrease,
  IndentDecrease,
  ChevronDown,
  Pilcrow,
  Image as ImageIcon,
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

// Heading options
const HEADINGS = [
  { level: 1, label: "Heading 1", icon: Heading1 },
  { level: 2, label: "Heading 2", icon: Heading2 },
  { level: 3, label: "Heading 3", icon: Heading3 },
];

// Alignment options
const ALIGNMENTS = [
  { value: "left", label: "Left", icon: AlignLeft },
  { value: "center", label: "Center", icon: AlignCenter },
  { value: "right", label: "Right", icon: AlignRight },
  { value: "justify", label: "Justify", icon: AlignJustify },
];

// Dropdown menu style
const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: "50%",
  transform: "translateX(-50%)",
  marginTop: "8px",
  background: "rgba(30, 30, 35, 0.98)",
  backdropFilter: "blur(10px)",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  borderRadius: "12px",
  padding: "6px",
  zIndex: 1000,
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
  minWidth: "120px",
};

const dropdownItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  width: "100%",
  padding: "8px 10px",
  background: "transparent",
  border: "none",
  borderRadius: "8px",
  color: "rgba(255, 255, 255, 0.85)",
  cursor: "pointer",
  fontSize: "13px",
  textAlign: "left",
  whiteSpace: "nowrap",
  transition: "background 0.15s ease",
};

interface ToolbarProps {
  editor: Editor | null;
  onOpenImageGallery?: () => void;
}

const ToolbarComponent: React.FC<ToolbarProps> = ({ editor, onOpenImageGallery }) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHeadingPicker, setShowHeadingPicker] = useState(false);
  const [showAlignmentPicker, setShowAlignmentPicker] = useState(false);

  const colorPickerRef = useRef<HTMLDivElement>(null);
  const headingPickerRef = useRef<HTMLDivElement>(null);
  const alignmentPickerRef = useRef<HTMLDivElement>(null);

  // Get current formatting state reactively based on cursor position
  const editorState = useEditorState({
    editor,
    selector: ({ editor }) => ({
      currentColor: editor!.getAttributes("textStyle").color || null,
      activeHeading: HEADINGS.find(h => editor!.isActive("heading", { level: h.level })) || null,
      activeAlignments: ALIGNMENTS.filter(a => editor!.isActive({ textAlign: a.value })),
      isBold: editor!.isActive("bold"),
      isItalic: editor!.isActive("italic"),
      isStrike: editor!.isActive("strike"),
      isUnderline: editor!.isActive("underline"),
      isHighlight: editor!.isActive("highlight"),
      isSubscript: editor!.isActive("subscript"),
      isSuperscript: editor!.isActive("superscript"),
      isLink: editor!.isActive("link"),
      isBulletList: editor!.isActive("bulletList"),
      isOrderedList: editor!.isActive("orderedList"),
      isTaskList: editor!.isActive("taskList"),
      isBlockquote: editor!.isActive("blockquote"),
      isCodeBlock: editor!.isActive("codeBlock"),
    }),
  });

  // Destructure with defaults for when editor is null
  const {
    currentColor = null,
    activeHeading = null,
    activeAlignments = [],
    isBold = false,
    isItalic = false,
    isStrike = false,
    isUnderline = false,
    isHighlight = false,
    isSubscript = false,
    isSuperscript = false,
    isLink = false,
    isBulletList = false,
    isOrderedList = false,
    isTaskList = false,
    isBlockquote = false,
    isCodeBlock = false,
  } = editorState || {};

  // Close pickers when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
      if (headingPickerRef.current && !headingPickerRef.current.contains(e.target as Node)) {
        setShowHeadingPicker(false);
      }
      if (alignmentPickerRef.current && !alignmentPickerRef.current.contains(e.target as Node)) {
        setShowAlignmentPicker(false);
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

    if (url === null) return;

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

  const setHeading = (level: number) => {
    editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run();
    setShowHeadingPicker(false);
  };

  const setAlignment = (alignment: string) => {
    editor.chain().focus().setTextAlign(alignment).run();
    setShowAlignmentPicker(false);
  };

  return (
    <div className="editor-toolbar-simple">
      <div style={{ display: 'contents', zIndex: 10 }}>
        {/* Text Formatting */}
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`toolbar-btn-circle ${isBold ? "is-active" : ""}`}
          title="Bold (Cmd+B)"
        >
          <Bold size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`toolbar-btn-circle ${isItalic ? "is-active" : ""}`}
          title="Italic (Cmd+I)"
        >
          <Italic size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`toolbar-btn-circle ${isStrike ? "is-active" : ""}`}
          title="Strikethrough"
        >
          <Strikethrough size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`toolbar-btn-circle ${isUnderline ? "is-active" : ""}`}
          title="Underline"
        >
          <UnderlineIcon size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          className={`toolbar-btn-circle ${isHighlight ? "is-active" : ""}`}
          title="Highlight"
        >
          <Highlighter size={16} />
        </button>
        <button
          onClick={() => {
            if (isSubscript) {
              editor.chain().focus().unsetSubscript().run();
            } else {
              editor.chain().focus().unsetSuperscript().setSubscript().run();
            }
          }}
          className={`toolbar-btn-circle ${isSubscript ? "is-active" : ""}`}
          title="Subscript (Cmd+,)"
        >
          <SubscriptIcon size={16} />
        </button>
        <button
          onClick={() => {
            if (isSuperscript) {
              editor.chain().focus().unsetSuperscript().run();
            } else {
              editor.chain().focus().unsetSubscript().setSuperscript().run();
            }
          }}
          className={`toolbar-btn-circle ${isSuperscript ? "is-active" : ""}`}
          title="Superscript (Cmd+.)"
        >
          <SuperscriptIcon size={16} />
        </button>
        <button
          onClick={setLink}
          className={`toolbar-btn-circle ${isLink ? "is-active" : ""}`}
          title="Link"
        >
          <Link size={16} />
        </button>

        {/* Color Picker */}
        <div ref={colorPickerRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className={`toolbar-btn-circle ${currentColor ? "is-active" : ""}`}
            title="Text Color"
            style={{
              background: currentColor || undefined,
              borderColor: currentColor || undefined,
            }}
          >
            <Palette size={16} style={{ color: currentColor ? "#fff" : undefined }} />
          </button>
          {showColorPicker && (
            <div style={dropdownStyle}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "4px", padding: "4px" }}>
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.color}
                    onClick={() => setCurrentColor(c.color)}
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "8px",
                      border: c.color === "inherit" ? "1px dashed rgba(255,255,255,0.3)" : "none",
                      background: c.color === "inherit" ? "transparent" : c.color,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "11px",
                      fontWeight: 500,
                      color: c.color === "inherit" ? "rgba(255,255,255,0.5)" : "#fff",
                    }}
                    title={c.name}
                  >
                    {c.color === "inherit" ? "A" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Heading Picker */}
        <div ref={headingPickerRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowHeadingPicker(!showHeadingPicker)}
            className={`toolbar-btn-circle ${activeHeading ? "is-active" : ""}`}
            title="Headings"
            style={{ width: "46px", aspectRatio: "auto", borderRadius: "23px", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}
          >
            {(() => {
              const Icon = activeHeading?.icon || Pilcrow;
              return <Icon size={16} />;
            })()}
            <ChevronDown size={12} style={{ opacity: 0.6 }} />
          </button>
          {showHeadingPicker && (
            <div style={dropdownStyle}>
              {HEADINGS.map((h) => (
                <div
                  key={h.level}
                  onClick={() => setHeading(h.level)}
                  style={dropdownItemStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <h.icon size={16} />
                  {h.label}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)", margin: "0 4px" }}></div>

        {/* Lists */}
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`toolbar-btn-circle ${isBulletList ? "is-active" : ""}`}
          title="Bullet List"
        >
          <List size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`toolbar-btn-circle ${isOrderedList ? "is-active" : ""}`}
          title="Ordered List"
        >
          <ListOrdered size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={`toolbar-btn-circle ${isTaskList ? "is-active" : ""}`}
          title="Task List"
        >
          <CheckSquare size={16} />
        </button>

        <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)", margin: "0 4px" }}></div>

        {/* Blocks */}
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`toolbar-btn-circle ${isBlockquote ? "is-active" : ""}`}
          title="Quote"
        >
          <Quote size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={`toolbar-btn-circle ${isCodeBlock ? "is-active" : ""}`}
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

        {/* Alignment Picker */}
        <div ref={alignmentPickerRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowAlignmentPicker(!showAlignmentPicker)}
            className="toolbar-btn-circle"
            title="Text Alignment"
            style={{ width: "46px", aspectRatio: "auto", borderRadius: "23px", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}
          >
            {(() => {
              const Icon = activeAlignments[0]?.icon || AlignLeft;
              return <Icon size={16} />;
            })()}
            <ChevronDown size={12} style={{ opacity: 0.6 }} />
          </button>
          {showAlignmentPicker && (
            <div style={dropdownStyle}>
              {ALIGNMENTS.map((a) => (
                <div
                  key={a.value}
                  onClick={() => setAlignment(a.value)}
                  style={dropdownItemStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <a.icon size={16} />
                  {a.label}
                </div>
              ))}
            </div>
          )}
        </div>

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

        {/* Tables & Images */}
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
        <button
          onClick={onOpenImageGallery}
          className="toolbar-btn-circle"
          title="Insert Image (Mod+Shift+/)"
        >
          <ImageIcon size={16} />
        </button>
      </div>
    </div>
  );
};

export const Toolbar = memo(ToolbarComponent);