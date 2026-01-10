import React from "react";
import { Editor } from "@tiptap/react";
import { 
  Bold, 
  Italic, 
  Strikethrough, 
  Underline as UnderlineIcon, 
  Code, 
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
  XSquare 
} from "lucide-react";

interface ToolbarProps {
  editor: Editor | null;
}

export const Toolbar: React.FC<ToolbarProps> = ({ editor }) => {
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

  return (
    <div className="editor-toolbar-glass">
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
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`toolbar-btn-circle ${editor.isActive("code") ? "is-active" : ""}`}
        title="Inline Code"
      >
        <Code size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        className={`toolbar-btn-circle ${editor.isActive("highlight") ? "is-active" : ""}`}
        title="Highlight"
      >
        <Highlighter size={16} />
      </button>

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
      <button
        onClick={() => editor.chain().focus().deleteTable().run()}
        disabled={!editor.can().deleteTable()}
        className="toolbar-btn-circle"
        title="Delete Table"
      >
        <XSquare size={16} />
      </button>
    </div>
  );
};
