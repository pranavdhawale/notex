import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion } from '@tiptap/suggestion';
import tippy from 'tippy.js';

export interface SlashCommandOptions {
  onOpenImageGallery: () => void;
}

interface CommandItem {
  title: string;
  action: 'openImageGallery';
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      onOpenImageGallery: () => {},
    };
  },

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey('slashCommand');
    const options = this.options;

    // Store current items and editor for use in onKeyDown
    let currentItems: CommandItem[] = [];
    let currentEditor: any = null;

    const suggestionOptions: any = {
      editor: this.editor,
      char: '/',
      pluginKey: pluginKey,
      items: ({ query }: { query: string }) => {
        if (query.toLowerCase().includes('image')) {
          return [{ title: 'Image Gallery', action: 'openImageGallery' as const }];
        }
        return [];
      },
      render: () => {
        let popup: any = null;

        return {
          onStart: (props: any) => {
            currentItems = props.items;
            currentEditor = props.editor;

            const container = document.createElement('div');
            container.className = 'slash-command-menu';

            if (props.items.length > 0) {
              const item = props.items[0];
              container.innerHTML = `
                <button class="slash-command-item" data-action="${item.action}">
                  <span class="slash-command-title">${item.title}</span>
                </button>
              `;
            }

            popup = tippy(document.body, {
              getReferenceClientRect: props.clientRect as () => DOMRect,
              appendTo: () => document.body,
              content: container,
              showOnCreate: true,
              interactive: true,
              trigger: 'manual',
              placement: 'bottom-start',
            });
          },

          onUpdate: (props: any) => {
            currentItems = props.items;
          },

          onKeyDown: (props: any) => {
            if (props.event.key === 'Escape') {
              if (popup && popup[0]) {
                popup[0].hide();
              }
              return true;
            }

            if (props.event.key === 'Enter' && currentItems.length > 0) {
              const item = currentItems[0];
              if (item.action === 'openImageGallery') {
                options.onOpenImageGallery();
              }
              if (currentEditor) {
                currentEditor.chain().focus().deleteRange(props.range).run();
              }
              if (popup && popup[0]) {
                popup[0].hide();
              }
              return true;
            }

            return false;
          },

          onExit: () => {
            if (popup && popup[0]) {
              popup[0].destroy();
            }
          },
        };
      },

      command: ({ editor, range, props }: any) => {
        const item = props as CommandItem;
        if (item.action === 'openImageGallery') {
          options.onOpenImageGallery();
        }
        editor.chain().focus().deleteRange(range).run();
      },
    };

    return [Suggestion(suggestionOptions)];
  },
});