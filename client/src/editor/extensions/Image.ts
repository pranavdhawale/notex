import { Image as TiptapImage } from '@tiptap/extension-image'
import type { NodeViewRendererProps } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ImageNodeView } from './ImageNodeView'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      /**
       * Insert an image at the current position or replace selection
       */
      setImage: (options: {
        src: string
        alt?: string
        title?: string
        'data-uploading'?: string
        'data-upload-progress'?: number
      }) => ReturnType
    }
  }
}

export const ImageExtension = TiptapImage.extend({
  name: 'image',

  addAttributes() {
    return {
      ...this.parent?.(),
      'data-uploading': {
        default: null,
        parseHTML: element => element.getAttribute('data-uploading'),
        renderHTML: attributes => {
          if (!attributes['data-uploading']) return {}
          return { 'data-uploading': attributes['data-uploading'] }
        },
      },
      'data-upload-progress': {
        default: null,
        parseHTML: element => {
          const val = element.getAttribute('data-upload-progress')
          return val ? parseInt(val, 10) : null
        },
        renderHTML: attributes => {
          if (attributes['data-upload-progress'] == null) return {}
          return { 'data-upload-progress': attributes['data-upload-progress'] }
        },
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  },
}).configure({
  inline: false,
  allowBase64: true,
})