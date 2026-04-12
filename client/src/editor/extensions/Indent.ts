import { Extension } from '@tiptap/core'

export type IndentOptions = {
  types: string[]
  minLevel: number
  maxLevel: number
  indentRange: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      /**
       * Indent the current node
       */
      indent: () => ReturnType
      /**
       * Outdent the current node
       */
      outdent: () => ReturnType
    }
  }
}

export const Indent = Extension.create<IndentOptions>({
  name: 'indent',

  addOptions() {
    return {
      types: ['listItem', 'paragraph', 'heading'],
      minLevel: 0,
      maxLevel: 8,
      indentRange: 24,
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: element => {
              const indent = element.getAttribute('data-indent')
              return indent ? parseInt(indent, 10) : 0
            },
            renderHTML: attributes => {
              if (attributes.indent === 0) {
                return {}
              }
              return {
                'data-indent': attributes.indent,
              }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ editor, commands }) => {
          const { types, maxLevel } = this.options

          // Check if current node type supports indentation
          const isActive = types.some(type => editor.isActive(type))
          if (!isActive) {
            return false
          }

          // Get current indent level
          const currentIndent = editor.getAttributes('paragraph')?.indent ||
                               editor.getAttributes('heading')?.indent || 0

          if (currentIndent >= maxLevel) {
            return false
          }

          // For list items, use sinkListItem
          if (editor.isActive('listItem')) {
            return commands.sinkListItem('listItem')
          }

          // For paragraphs and headings, set indent attribute
          const newIndent = currentIndent + 1
          return types.reduce((acc, type) => {
            if (editor.isActive(type)) {
              return commands.updateAttributes(type, { indent: newIndent })
            }
            return acc
          }, false as boolean)
        },

      outdent:
        () =>
        ({ editor, commands }) => {
          const { types, minLevel } = this.options

          // Check if current node type supports indentation
          const isActive = types.some(type => editor.isActive(type))
          if (!isActive) {
            return false
          }

          // Get current indent level
          const currentIndent = editor.getAttributes('paragraph')?.indent ||
                               editor.getAttributes('heading')?.indent || 0

          if (currentIndent <= minLevel) {
            return false
          }

          // For list items, use liftListItem
          if (editor.isActive('listItem')) {
            return commands.liftListItem('listItem')
          }

          // For paragraphs and headings, set indent attribute
          const newIndent = currentIndent - 1
          return types.reduce((acc, type) => {
            if (editor.isActive(type)) {
              return commands.updateAttributes(type, { indent: newIndent })
            }
            return acc
          }, false as boolean)
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        return this.editor.commands.indent()
      },
      'Shift-Tab': () => {
        return this.editor.commands.outdent()
      },
    }
  },
})