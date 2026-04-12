import { Image as TiptapImage } from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ImageNodeView } from './ImageNodeView'

export const ImageExtension = TiptapImage.extend({
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