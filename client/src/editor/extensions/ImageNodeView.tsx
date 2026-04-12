import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useEffect, useRef, useState, useCallback } from 'react'
import api from '../../utils/api'
import './ImageNodeView.css'

export function ImageNodeView({ node, updateAttributes }: NodeViewProps) {
  const src = node.attrs.src as string
  const uploading = node.attrs['data-uploading'] as string | null
  const uploadProgress = node.attrs['data-upload-progress'] as number | null

  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const revokedRef = useRef<string | null>(null)

  // Determine if this is a server URL that needs authenticated fetching
  const isServerUrl = src && src.startsWith('/api/')

  // Fetch image via authenticated request and create blob URL
  const fetchImage = useCallback(async () => {
    if (!isServerUrl || blobUrl) return

    setLoading(true)
    setError(null)

    try {
      const response = await api.get(src, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      // Revoke previous blob URL if it exists
      if (revokedRef.current) {
        URL.revokeObjectURL(revokedRef.current)
      }
      revokedRef.current = url
      setBlobUrl(url)
    } catch {
      setError('Failed to load image')
    } finally {
      setLoading(false)
    }
  }, [src, isServerUrl, blobUrl])

  useEffect(() => {
    if (isServerUrl && !blobUrl && !error) {
      fetchImage()
    }
  }, [isServerUrl, blobUrl, error, fetchImage])

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (revokedRef.current) {
        URL.revokeObjectURL(revokedRef.current)
      }
    }
  }, [])

  // Determine what to display
  const displayUrl = isServerUrl ? (blobUrl || '') : src

  // Upload progress overlay
  const showUploadProgress = uploading === 'true' && uploadProgress !== null && uploadProgress < 100

  // Error state with retry (for authenticated fetch failures)
  const handleRetry = () => {
    setError(null)
    setBlobUrl(null)
    fetchImage()
  }

  return (
    <NodeViewWrapper className="image-node-wrapper">
      <div className="image-node-container">
        {displayUrl && !error && (
          <img
            src={displayUrl}
            alt={node.attrs.alt as string || ''}
            className={`image-node-img${uploading === 'true' ? ' image-uploading' : ''}`}
            data-uploading={uploading}
            data-upload-progress={uploadProgress}
          />
        )}
        {showUploadProgress && (
          <div className="image-upload-overlay">
            <div className="image-upload-spinner" />
            <div className="image-upload-progress-bar">
              <div
                className="image-upload-progress-fill"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="image-upload-percent">{uploadProgress}%</span>
          </div>
        )}
        {loading && !blobUrl && (
          <div className="image-loading-placeholder">
            <div className="image-loading-spinner" />
          </div>
        )}
        {error && (
          <div className="image-error-overlay">
            <span className="image-error-text">{error}</span>
            <button className="image-error-retry" onClick={handleRetry}>
              Retry
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}