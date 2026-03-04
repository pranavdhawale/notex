import React, { useEffect, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { 
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Trash2,
  XSquare
} from 'lucide-react';

interface TableContextMenuProps {
  editor: Editor | null;
  isOpen: boolean;
  x: number;
  y: number;
  onClose: () => void;
}

export const TableContextMenu: React.FC<TableContextMenuProps> = ({ editor, isOpen, x, y, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      setTimeout(() => window.addEventListener('click', handleClickOutside), 0);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleScroll = () => {
      if (isOpen) onClose();
    };
    if (isOpen) {
      window.addEventListener('scroll', handleScroll, true);
    }
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen, onClose]);

  if (!editor || !isOpen) {
    return null;
  }

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  // Ensure menu doesn't go off screen (approximate dimensions)
  const menuWidth = 320; 
  const menuHeight = 50;
  
  const safeX = Math.min(x, window.innerWidth - menuWidth - 20);
  const safeY = Math.min(y, window.innerHeight - menuHeight - 20);

  return (
    <div
      ref={menuRef}
      className="editor-toolbar-simple table-context-menu"
      style={{
        position: 'fixed',
        left: safeX,
        top: safeY,
        zIndex: 9999,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid var(--glass-border)',
        borderRadius: '16px',
        padding: '6px',
        display: 'flex',
        gap: '8px',
        boxShadow: 'var(--glass-shadow)',
      }}
    >
      <button
        onClick={() => handleAction(() => editor.chain().focus().addColumnBefore().run())}
        className="toolbar-btn-circle"
        title="Add Column Before"
      >
        <BetweenVerticalStart size={16} />
      </button>
      <button
        onClick={() => handleAction(() => editor.chain().focus().addColumnAfter().run())}
        className="toolbar-btn-circle"
        title="Add Column After"
      >
        <BetweenVerticalEnd size={16} />
      </button>
      <button
        onClick={() => handleAction(() => editor.chain().focus().deleteColumn().run())}
        className="toolbar-btn-circle"
        style={{ color: '#ff4d4f' }}
        title="Delete Column"
      >
        <Trash2 size={14} />
      </button>
      
      <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.2)", margin: "0 2px" }}></div>

      <button
        onClick={() => handleAction(() => editor.chain().focus().addRowBefore().run())}
        className="toolbar-btn-circle"
        title="Add Row Before"
      >
        <BetweenHorizontalStart size={16} />
      </button>
      <button
        onClick={() => handleAction(() => editor.chain().focus().addRowAfter().run())}
        className="toolbar-btn-circle"
        title="Add Row After"
      >
        <BetweenHorizontalEnd size={16} />
      </button>
      <button
        onClick={() => handleAction(() => editor.chain().focus().deleteRow().run())}
        className="toolbar-btn-circle"
        style={{ color: '#ff4d4f' }}
        title="Delete Row"
      >
        <Trash2 size={14} />
      </button>

      <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.2)", margin: "0 2px" }}></div>

      <button
        onClick={() => handleAction(() => editor.chain().focus().deleteTable().run())}
        className="toolbar-btn-circle"
        style={{ color: '#ff4d4f' }}
        title="Delete Table"
      >
        <XSquare size={16} />
      </button>
    </div>
  );
};
