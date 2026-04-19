import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Upload,
  Loader2,
  Trash2,
  Image as ImageIcon,
  Check,
  FolderX,
  FileDown,
  Plus,
} from "lucide-react";
import * as Y from "yjs";
import type { Editor } from "@tiptap/react";
import api from "../utils/api";
import { toast } from "./Toaster";
import { ConfirmationModal } from "./ConfirmationModal";
import { IMAGE_UPLOAD } from "../utils/constants";
import "./ImageGalleryPopup.css";

/**
 * Image data returned from the server
 */
interface ImageData {
  id: string;
  roomId: string;
  name: string;
  size: number;
  width: number;
  height: number;
  url: string;
  thumbnailUrl: string;
  refCount: number;
  createdAt: string;
}

/**
 * Props for the ImageGalleryPopup component
 */
interface ImageGalleryPopupProps {
  isOpen: boolean;
  onClose: () => void;
  roomSlug: string;
  ydoc: Y.Doc | null;
  userId: string;
  isRoomOwner: boolean;
  editor: Editor | null;
}

/**
 * Custom hook to fetch images via authenticated requests with concurrency limiting.
 * Returns a map of imageId -> blob URL. Fetches at most MAX_CONCURRENT_FETCHES
 * images in parallel to avoid overwhelming the browser and server.
 * Retries failed thumbnail fetches once with the full image URL as fallback.
 */
const MAX_CONCURRENT_FETCHES = 6;
const FETCH_RETRY_DELAY = 500; // ms before retrying with fallback URL

function useAuthenticatedImageUrls(images: ImageData[], isOpen: boolean) {
  const [blobUrls, setBlobUrls] = useState<Map<string, string>>(new Map());
  const revokedUrlsRef = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  // Track fetched image IDs and their thumbnail URLs so we can re-fetch if the URL changes
  const fetchedRef = useRef<Map<string, string>>(new Map());

  // Revoke a blob URL and track it
  const revokeUrl = useCallback((url: string) => {
    if (!revokedUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      revokedUrlsRef.current.add(url);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      // Cleanup all blob URLs when popup closes
      blobUrls.forEach((url) => revokeUrl(url));
      setBlobUrls(new Map());
      fetchedRef.current.clear();
      // Cancel in-progress fetches when popup closes
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      return;
    }

    // Reset fetchedRef when popup opens to ensure fresh fetches
    // (in case component wasn't fully unmounted)
    fetchedRef.current.clear();

    // Create new AbortController for this popup session
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const fetchWithRetry = async (image: ImageData, displayUrl: string): Promise<void> => {
      const thumbUrl = image.thumbnailUrl || image.url;
      const isServerUrl = thumbUrl && thumbUrl.startsWith("/api/");
      if (!isServerUrl) return;

      // Try thumbnail first, then fall back to full image URL
      const urlsToTry = [thumbUrl];
      if (image.thumbnailUrl && image.url && image.url !== thumbUrl) {
        urlsToTry.push(image.url);
      }

      for (const url of urlsToTry) {
        try {
          const response = await api.get(url, {
            responseType: "blob",
            signal,
          });
          const blobUrl = URL.createObjectURL(response.data);
          // Mark as successfully fetched ONLY after successful download
          fetchedRef.current.set(image.id, displayUrl);
          setBlobUrls((prev) => {
            const next = new Map(prev);
            const oldUrl = next.get(image.id);
            if (oldUrl) revokeUrl(oldUrl);
            next.set(image.id, blobUrl);
            return next;
          });
          return; // Success
        } catch (err: any) {
          if (err.name === "CanceledError" || err.code === "ERR_CANCELED") return;
          // If this was the last URL to try, clear fetchedRef so we can retry later
          if (url === urlsToTry[urlsToTry.length - 1]) {
            fetchedRef.current.delete(image.id);
            console.error(`Failed to fetch image ${image.id}:`, err);
            return;
          }
          // Brief delay before retrying with fallback URL
          await new Promise((r) => setTimeout(r, FETCH_RETRY_DELAY));
          if (signal.aborted) return;
        }
      }
    };

    // Determine which images need fetching: new images or images whose URL changed
    const imagesToFetch: ImageData[] = [];
    for (const image of images) {
      const displayUrl = image.thumbnailUrl || image.url;
      const isServerUrl = displayUrl && displayUrl.startsWith("/api/");
      if (!isServerUrl) continue;

      const previousUrl = fetchedRef.current.get(image.id);
      if (previousUrl === undefined || previousUrl !== displayUrl) {
        imagesToFetch.push(image);
      }
    }

    // Concurrent fetch with limit
    let index = 0;
    const next = (): Promise<void> | undefined => {
      if (index >= imagesToFetch.length || signal.aborted) return undefined;
      const image = imagesToFetch[index++];
      const displayUrl = image.thumbnailUrl || image.url;
      return fetchWithRetry(image, displayUrl).then(() => next() ?? undefined);
    };

    // Start up to MAX_CONCURRENT_FETCHES parallel fetches
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(MAX_CONCURRENT_FETCHES, imagesToFetch.length); i++) {
      const promise = next();
      if (promise) workers.push(promise);
    }

    // Remove blob URLs for images no longer in the list
    const currentIds = new Set(images.map((img) => img.id));
    setBlobUrls((prev) => {
      const next = new Map(prev);
      for (const [id, url] of next) {
        if (!currentIds.has(id)) {
          revokeUrl(url);
          next.delete(id);
          fetchedRef.current.delete(id);
        }
      }
      return next;
    });
  }, [images, isOpen, revokeUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      blobUrls.forEach((url) => revokeUrl(url));
    };
  }, [blobUrls, revokeUrl]);

  return blobUrls;
}

/**
 * Image Gallery Popup Component
 *
 * Features:
 * - Display uploaded images in a grid
 * - Upload new images with progress
 * - Insert single or multiple images into the document
 * - Delete single or multiple images
 * - Save images to Files
 * - Cleanup unused images (owner only)
 */
export const ImageGalleryPopup: React.FC<ImageGalleryPopupProps> = ({
  isOpen,
  onClose,
  roomSlug,
  ydoc,
  userId: _userId,
  isRoomOwner,
  editor,
}) => {
  // State
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showCleanupConfirmation, setShowCleanupConfirmation] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [refCountsVersion, setRefCountsVersion] = useState(0); // Triggers re-render when Y.Map changes

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fetchObserverRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Fetch images via authenticated requests and get blob URLs
  const blobUrls = useAuthenticatedImageUrls(images, isOpen);

  // Track mounted state for async operations
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Helper to get display URL for an image (thumbnail for gallery)
  const getDisplayUrl = useCallback(
    (image: ImageData): string => {
      const displayUrl = image.thumbnailUrl || image.url;
      const isServerUrl = displayUrl && displayUrl.startsWith("/api/");
      if (isServerUrl) {
        // Return blob URL if available, otherwise fall back to server URL
        return blobUrls.get(image.id) || displayUrl;
      }
      return displayUrl;
    },
    [blobUrls]
  );

  /**
   * Get the effective reference count for an image.
   * Uses live count from Y.Map if available, otherwise falls back to server count.
   * Returns 0 if the image is not in the document.
   */
  const getEffectiveRefCount = useCallback(
    (imageId: string, serverRefCount: number): number => {
      if (ydoc) {
        const imageRefs = ydoc.getMap<number>('imageRefs');
        const count = imageRefs.get(imageId);
        if (count !== undefined) {
          return count;
        }
        return 0; // Image not in Y.Map means not referenced in document
      }
      return serverRefCount;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ydoc, refCountsVersion] // Include version to trigger re-render on Y.Map changes
  );

  /**
   * Fetch images from the server
   */
  const fetchImages = useCallback(async () => {
    if (!isOpen) return;

    setLoading(true);
    try {
      const res = await api.get(`/api/rooms/${roomSlug}/images`);
      // Backend returns { images: ImageData[], pagination: {...} }
      const imageData = res.data.images || res.data;
      setImages(Array.isArray(imageData) ? imageData : []);
    } catch (err) {
      console.error("Failed to fetch images:", err);
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [roomSlug, isOpen]);

  /**
   * Fetch images on mount and when ydoc meta changes
   */
  useEffect(() => {
    if (!isOpen || !ydoc) return;

    // Initial fetch
    fetchImages();

    // Observe ydoc meta changes to refetch
    const yMeta = ydoc.getMap("meta");
    const observer = () => {
      fetchImages();
    };
    yMeta.observe(observer);
    fetchObserverRef.current = observer;

    return () => {
      if (fetchObserverRef.current) {
        yMeta.unobserve(fetchObserverRef.current);
        fetchObserverRef.current = null;
      }
    };
  }, [ydoc, fetchImages, isOpen]);

  /**
   * Observe imageRefs Y.Map to trigger re-render when ref counts change
   */
  useEffect(() => {
    if (!isOpen || !ydoc) return;

    const imageRefs = ydoc.getMap<number>('imageRefs');
    const observer = () => {
      setRefCountsVersion(v => v + 1);
    };
    imageRefs.observe(observer);

    return () => {
      imageRefs.unobserve(observer);
    };
  }, [ydoc, isOpen]);

  /**
   * Handle escape key to close popup
   */
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showDeleteConfirmation) {
          setShowDeleteConfirmation(false);
        } else if (showCleanupConfirmation) {
          setShowCleanupConfirmation(false);
        } else if (selectionMode) {
          setSelectionMode(false);
          setSelectedIds(new Set());
        } else {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose, selectionMode, showDeleteConfirmation, showCleanupConfirmation]);

  /**
   * Reset state when popup closes
   */
  useEffect(() => {
    if (!isOpen) {
      setSelectedIds(new Set());
      setSelectionMode(false);
      setShowDeleteConfirmation(false);
      setShowCleanupConfirmation(false);
    }
  }, [isOpen]);

  /**
   * Handle file selection for upload
   */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      await uploadImage(file);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  /**
   * Upload a single image
   */
  const uploadImage = async (file: File) => {
    // Validate MIME type
    if (!(IMAGE_UPLOAD.ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.error(`Invalid file type: ${file.name}`);
      return;
    }

    // Validate file size
    if (file.size > IMAGE_UPLOAD.MAX_SIZE) {
      toast.error(`Image "${file.name}" exceeds 10MB limit.`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadSpeed("0 KB/s");

    const formData = new FormData();
    formData.append("file", file);

    let lastLoaded = 0;
    let lastTime = Date.now();

    try {
      const res = await api.post(`/api/rooms/${roomSlug}/images`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 10 * 60 * 1000,
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || file.size;
          const current = progressEvent.loaded;
          const percentCompleted = Math.round((current * 100) / total);
          setUploadProgress(percentCompleted);

          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000;
          if (timeDiff >= 0.5) {
            const loadedDiff = current - lastLoaded;
            const speed = loadedDiff / timeDiff;
            if (speed > 1024 * 1024) {
              setUploadSpeed(`${(speed / (1024 * 1024)).toFixed(1)} MB/s`);
            } else {
              setUploadSpeed(`${(speed / 1024).toFixed(1)} KB/s`);
            }
            lastLoaded = current;
            lastTime = now;
          }
        },
      });

      const newImage: ImageData = res.data;

      // Check if component is still mounted before state updates
      if (!isMountedRef.current) return;

      // Signal other clients via Yjs metadata
      if (ydoc) {
        const yMeta = ydoc.getMap("meta");
        yMeta.set("lastImageUpload", Date.now());
      }

      setImages((prev) => [newImage, ...prev]);
      toast.success(`Uploaded "${file.name}"`);
    } catch (err: any) {
      // Check if component is still mounted before state updates
      if (!isMountedRef.current) return;

      if (err.response?.data?.error) {
        toast.error(err.response.data.error);
      } else {
        toast.error(`Failed to upload "${file.name}"`);
      }
    } finally {
      // Check if component is still mounted before state updates
      if (!isMountedRef.current) return;

      setUploading(false);
      setUploadProgress(0);
      setUploadSpeed("");
    }
  };

  /**
   * Handle drag over event
   */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  /**
   * Handle drag leave event
   */
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the drop zone (not entering a child)
    if (e.currentTarget === dropZoneRef.current) {
      setIsDragging(false);
    }
  };

  /**
   * Handle drop event for image files
   */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    // Filter to only image files
    const imageFiles = droppedFiles.filter((file) =>
      (IMAGE_UPLOAD.ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)
    );

    if (imageFiles.length === 0) {
      toast.error("Only image files (JPEG, PNG, GIF, WebP) are allowed");
      return;
    }

    // Upload each image file
    imageFiles.forEach((file) => {
      uploadImage(file);
    });
  };

  /**
   * Insert an image into the editor at cursor position
   */
  const insertImage = (image: ImageData) => {
    if (!editor) return;

    editor
      .chain()
      .focus()
      .insertContent({
        type: "image",
        attrs: {
          src: image.url,
          alt: image.name,
        },
      })
      .run();

    // Track image reference in Y.Map — increment to preserve existing count
    if (ydoc) {
      const imageRefs = ydoc.getMap<number>("imageRefs");
      imageRefs.set(image.id, (imageRefs.get(image.id) || 0) + 1);
    }

    toast.success("Image inserted");
    onClose();
  };

  /**
   * Insert multiple selected images
   */
  const insertSelected = () => {
    if (!editor || selectedIds.size === 0) return;

    const selectedImages = images.filter((img) => selectedIds.has(img.id));
    if (selectedImages.length === 0) return;

    // Insert all selected images
    const content = selectedImages.map((img) => ({
      type: "image",
      attrs: {
        src: img.url,
        alt: img.name,
      },
    }));

    editor.chain().focus().insertContent(content).run();

    // Track image references — increment each to preserve existing counts
    if (ydoc) {
      const imageRefs = ydoc.getMap<number>("imageRefs");
      selectedImages.forEach((img) => {
        imageRefs.set(img.id, (imageRefs.get(img.id) || 0) + 1);
      });
    }

    toast.success(`Inserted ${selectedImages.length} images`);
    setSelectedIds(new Set());
    setSelectionMode(false);
    onClose();
  };

  /**
   * Toggle selection for an image
   */
  const toggleSelection = (imageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      return next;
    });
  };

  /**
   * Handle thumbnail click - insert if not in selection mode, otherwise toggle
   */
  const handleThumbnailClick = (image: ImageData) => {
    if (selectionMode) {
      toggleSelection(image.id);
    } else {
      insertImage(image);
    }
  };

  /**
   * Handle checkbox click - enter selection mode and toggle
   */
  const handleCheckboxClick = (e: React.MouseEvent, imageId: string) => {
    e.stopPropagation();
    if (!selectionMode) {
      setSelectionMode(true);
    }
    toggleSelection(imageId);
  };

  /**
   * Select all images
   */
  const selectAll = () => {
    setSelectedIds(new Set(images.map((img) => img.id)));
  };

  /**
   * Deselect all images
   */
  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  /**
   * Delete a single image
   */
  const deleteImage = async (imageId: string) => {
    try {
      await api.delete(`/api/rooms/${roomSlug}/images/${imageId}`);

      // Remove image from editor if it exists
      if (editor) {
        const image = images.find((img) => img.id === imageId);
        if (image) {
          // Find and remove all image nodes with matching URL
          const { state } = editor;
          const { tr } = state;
          let modified = false;

          state.doc.descendants((node, pos) => {
            if (node.type.name === "image") {
              const src = node.attrs.src;
              // Check if this image node references the deleted image
              if (src && (src === image.url || src === image.thumbnailUrl || src.includes(imageId))) {
                tr.delete(pos, pos + node.nodeSize);
                modified = true;
              }
            }
          });

          if (modified) {
            editor.view.dispatch(tr);
          }
        }
      }

      // Remove from Y.Map imageRefs
      if (ydoc) {
        const imageRefs = ydoc.getMap<number>("imageRefs");
        imageRefs.delete(imageId);
        const yMeta = ydoc.getMap("meta");
        yMeta.set("lastImageDelete", Date.now());
      }

      setImages((prev) => prev.filter((img) => img.id !== imageId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(imageId);
        return next;
      });

      toast.success("Image deleted");
    } catch (err) {
      console.error("Failed to delete image:", err);
      toast.error("Failed to delete image");
    }
  };

  /**
   * Delete selected images using the batch delete endpoint.
   * Tracks which deletions succeeded and only removes those from local state.
   */
  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;

    setDeleting(true);
    try {
      const imageIds = Array.from(selectedIds);
      const imagesToDelete = images.filter((img) => selectedIds.has(img.id));

      // Use batch delete endpoint for efficiency
      try {
        const res = await api.post(`/api/rooms/${roomSlug}/images/batch-delete`, {
          imageIds,
        });
        const deletedIds = new Set<string>(res.data?.deleted || imageIds);
        const failedIds: string[] = res.data?.failed || [];

        // Remove successfully deleted images from editor
        const deletedImages = imagesToDelete.filter((img) => deletedIds.has(img.id));
        if (editor && deletedImages.length > 0) {
          const { state } = editor;
          const { tr } = state;
          let modified = false;

          state.doc.descendants((node, pos) => {
            if (node.type.name === "image") {
              const src = node.attrs.src as string;
              const isDeleted = deletedImages.some(
                (img) => src === img.url || src === img.thumbnailUrl || (src && src.includes(img.id))
              );
              if (isDeleted) {
                tr.delete(pos, pos + node.nodeSize);
                modified = true;
              }
            }
          });

          if (modified) {
            editor.view.dispatch(tr);
          }
        }

        // Remove from Y.Map imageRefs
        if (ydoc) {
          const imageRefs = ydoc.getMap<number>("imageRefs");
          deletedIds.forEach((id) => {
            imageRefs.delete(id);
          });
          const yMeta = ydoc.getMap("meta");
          yMeta.set("lastImageDelete", Date.now());
        }

        setImages((prev) => prev.filter((img) => !deletedIds.has(img.id)));
        setSelectedIds(new Set());
        setSelectionMode(false);

        if (failedIds.length > 0) {
          toast.warning(`Deleted ${deletedIds.size - failedIds.length} images, ${failedIds.length} failed`);
        } else {
          toast.success(`Deleted ${deletedIds.size} image${deletedIds.size > 1 ? 's' : ''}`);
        }
      } catch (err: any) {
        // Fallback: if batch endpoint is unavailable, try sequential deletes
        console.warn("Batch delete failed, falling back to sequential:", err);

        const succeededIds: string[] = [];
        const failedIds: string[] = [];

        for (const imageId of imageIds) {
          try {
            await api.delete(`/api/rooms/${roomSlug}/images/${imageId}`);
            succeededIds.push(imageId);
          } catch {
            failedIds.push(imageId);
          }
        }

        const succeededImages = imagesToDelete.filter((img) => succeededIds.includes(img.id));

        // Remove from editor
        if (editor && succeededImages.length > 0) {
          const { state } = editor;
          const { tr } = state;
          let modified = false;

          state.doc.descendants((node, pos) => {
            if (node.type.name === "image") {
              const src = node.attrs.src as string;
              const isDeleted = succeededImages.some(
                (img) => src === img.url || src === img.thumbnailUrl || (src && src.includes(img.id))
              );
              if (isDeleted) {
                tr.delete(pos, pos + node.nodeSize);
                modified = true;
              }
            }
          });

          if (modified) {
            editor.view.dispatch(tr);
          }
        }

        // Remove from Y.Map
        if (ydoc) {
          const imageRefs = ydoc.getMap<number>("imageRefs");
          succeededIds.forEach((id) => imageRefs.delete(id));
          const yMeta = ydoc.getMap("meta");
          yMeta.set("lastImageDelete", Date.now());
        }

        setImages((prev) => prev.filter((img) => !succeededIds.includes(img.id)));
        setSelectedIds(new Set());
        setSelectionMode(false);

        if (failedIds.length > 0) {
          toast.warning(`Deleted ${succeededIds.length} images, ${failedIds.length} failed`);
        } else {
          toast.success(`Deleted ${succeededIds.length} image${succeededIds.length > 1 ? 's' : ''}`);
        }
      }
    } catch (err) {
      console.error("Failed to delete images:", err);
      toast.error("Failed to delete some images");
    } finally {
      setDeleting(false);
      setShowDeleteConfirmation(false);
    }
  };

  /**
   * Save an image to Files
   */
  const saveToFiles = async (imageId: string) => {
    try {
      const res = await api.post(`/api/rooms/${roomSlug}/images/${imageId}/save-to-files`);

      if (ydoc) {
        const yMeta = ydoc.getMap("meta");
        yMeta.set("lastFileUpload", Date.now());
      }

      // Check if it was a duplicate (already exists in files)
      if (res.data?.isDuplicate) {
        toast.info("Image already exists in Files");
      } else {
        toast.success("Saved to Files");
      }
    } catch (err) {
      console.error("Failed to save to files:", err);
      toast.error("Failed to save to files");
    }
  };

  /**
   * Save selected images to Files
   */
  const saveSelectedToFiles = async () => {
    if (selectedIds.size === 0) return;

    let savedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    try {
      for (const imageId of selectedIds) {
        try {
          const res = await api.post(`/api/rooms/${roomSlug}/images/${imageId}/save-to-files`);
          if (res.data?.isDuplicate) {
            duplicateCount++;
          } else {
            savedCount++;
          }
        } catch {
          errorCount++;
        }
      }

      if (ydoc) {
        const yMeta = ydoc.getMap("meta");
        yMeta.set("lastFileUpload", Date.now());
      }

      // Show appropriate toast message
      if (errorCount > 0) {
        toast.error(`Failed to save ${errorCount} image${errorCount > 1 ? 's' : ''}`);
      } else if (duplicateCount > 0 && savedCount === 0) {
        toast.info(`${duplicateCount} image${duplicateCount > 1 ? 's' : ''} already exist${duplicateCount === 1 ? 's' : ''} in Files`);
      } else if (duplicateCount > 0 && savedCount > 0) {
        toast.success(`Saved ${savedCount} image${savedCount > 1 ? 's' : ''}, ${duplicateCount} already existed`);
      } else {
        toast.success(`Saved ${savedCount} image${savedCount > 1 ? 's' : ''} to Files`);
      }

      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (err) {
      console.error("Failed to save images to files:", err);
      toast.error("Failed to save images to files");
    }
  };

  /**
   * Cleanup unused images (owner only)
   */
  const cleanupUnused = async () => {
    setDeleting(true);
    try {
      const res = await api.post(`/api/rooms/${roomSlug}/images/cleanup`);
      const deletedCount = res.data.deletedCount || 0;

      if (ydoc) {
        const yMeta = ydoc.getMap("meta");
        yMeta.set("lastImageDelete", Date.now());
      }

      // Refetch images
      await fetchImages();

      toast.success(`Cleaned up ${deletedCount} unused images`);
    } catch (err) {
      console.error("Failed to cleanup images:", err);
      toast.error("Failed to cleanup images");
    } finally {
      setDeleting(false);
      setShowCleanupConfirmation(false);
    }
  };

  /**
   * Format file size for display
   */
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  /**
   * Format dimensions for display
   */
  const formatDimensions = (width: number, height: number): string => {
    return `${width}x${height}`;
  };

  if (!isOpen) return null;

  const unusedCount = images.filter(
    (img) => getEffectiveRefCount(img.id, img.refCount) === 0
  ).length;
  const hasSelection = selectedIds.size > 0;

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="image-gallery-backdrop" onClick={onClose} />

      {/* Popup */}
      <div
        className="image-gallery-popup"
        role="dialog"
        aria-label="Image Gallery"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="image-gallery-header">
          <div className="image-gallery-header-left">
            <h3>Image Gallery</h3>
            {images.length > 0 && (
              <span className="image-count">{images.length} images</span>
            )}
          </div>
          <div className="image-gallery-header-actions">
            {isRoomOwner && unusedCount > 0 && !selectionMode && (
              <button
                className="btn-icon cleanup-btn"
                onClick={() => setShowCleanupConfirmation(true)}
                title={`Cleanup ${unusedCount} unused images`}
              >
                <FolderX size={18} />
              </button>
            )}
            <button className="btn-icon" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          ref={dropZoneRef}
          className={`image-gallery-content ${isDragging ? "dragging" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging ? (
            <div className="image-gallery-empty drag-overlay">
              <Upload size={48} opacity={0.8} />
              <p>Drop images here</p>
              <p className="hint">JPEG, PNG, GIF, WebP up to 10MB</p>
            </div>
          ) : loading ? (
            <div className="image-gallery-empty">
              <Loader2 size={32} className="animate-spin" />
              <p>Loading images...</p>
            </div>
          ) : images.length === 0 ? (
            <div className="image-gallery-empty">
              <ImageIcon size={32} opacity={0.5} />
              <p>No images yet</p>
              <p className="hint">Drag & drop images or click Upload</p>
            </div>
          ) : (
            <>
              {/* Selection controls */}
              {selectionMode && (
                <div className="image-gallery-selection-controls">
                  <span>{selectedIds.size} selected</span>
                  <div className="selection-buttons">
                    <button className="btn-text" onClick={selectAll}>
                      Select all
                    </button>
                    <button className="btn-text" onClick={deselectAll}>
                      Deselect all
                    </button>
                    <button
                      className="btn-text"
                      onClick={() => {
                        setSelectionMode(false);
                        setSelectedIds(new Set());
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Image Grid */}
              <div className="image-gallery-grid">
                {images.map((image) => {
                  const isSelected = selectedIds.has(image.id);
                  const displayUrl = getDisplayUrl(image);
                  const isLoading = !displayUrl && image.url?.startsWith("/api/");

                  return (
                    <div
                      key={image.id}
                      className={`image-thumbnail ${isSelected ? "selected" : ""}`}
                      onClick={() => handleThumbnailClick(image)}
                    >
                      {/* Image Preview */}
                      <div className="image-thumbnail-preview">
                        {isLoading ? (
                          <div className="image-loading-thumb">
                            <Loader2 size={16} className="animate-spin" />
                          </div>
                        ) : displayUrl ? (
                          <>
                            <img
                              src={displayUrl}
                              alt={image.name}
                              loading="lazy"
                              onError={(e) => {
                                const img = e.target as HTMLImageElement;
                                // If thumbnail blob URL failed, fall back to full image URL
                                const fallback = image.url;
                                if (fallback && img.src !== fallback && !img.dataset.retried) {
                                  img.dataset.retried = "1";
                                  img.src = fallback;
                                } else {
                                  // Full image also failed — show placeholder
                                  img.style.display = "none";
                                  const placeholder = img.nextElementSibling as HTMLElement;
                                  if (placeholder) placeholder.style.display = "flex";
                                }
                              }}
                            />
                            <div className="image-error-placeholder" style={{ display: "none", position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.3)", fontSize: "12px" }}>
                              <ImageIcon size={20} />
                            </div>
                          </>
                        ) : null}
                      </div>

                      {/* Checkbox overlay (top-left, visible on hover) */}
                      <div
                        className={`image-checkbox ${selectionMode ? "always-visible" : ""}`}
                        onClick={(e) => handleCheckboxClick(e, image.id)}
                      >
                        <div className={`checkbox-box ${isSelected ? "checked" : ""}`}>
                          {isSelected && <Check size={12} />}
                        </div>
                      </div>

                      {/* Actions overlay (bottom, visible on hover) */}
                      {!selectionMode && (
                        <div className="image-actions-overlay">
                          <button
                            className="image-action-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              saveToFiles(image.id);
                            }}
                            title="Save to Files"
                          >
                            <span style={{ fontSize: "14px", lineHeight: 1 }}>💾</span>
                          </button>
                          <button
                            className="image-action-btn delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteImage(image.id);
                            }}
                            title="Delete"
                          >
                            <span style={{ fontSize: "14px", lineHeight: 1 }}>🗑️</span>
                          </button>
                        </div>
                      )}

                      {/* Info overlay */}
                      <div className="image-info-overlay">
                        <span className="image-name" title={image.name}>
                          {image.name}
                        </span>
                        <span className="image-meta">
                          {formatDimensions(image.width, image.height)} | {formatSize(image.size)}
                        </span>
                      </div>

                      {/* Reference count indicator */}
                      {(() => {
                        const effectiveCount = getEffectiveRefCount(
                          image.id,
                          image.refCount
                        );
                        if (effectiveCount === 0) {
                          return (
                            <div
                              className="image-unused-badge"
                              title="Not used in document"
                            >
                              0
                            </div>
                          );
                        }
                        if (effectiveCount === 1) {
                          return (
                            <div
                              className="image-used-badge"
                              style={{ background: "rgba(100, 100, 100, 0.7)" }}
                              title="Used 1 time in document"
                            >
                              1
                            </div>
                          );
                        }
                        return (
                          <div
                            className="image-used-badge"
                            title={`Used ${effectiveCount} times in document`}
                          >
                            {effectiveCount}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer with upload */}
        <div className="image-gallery-footer">
          {/* Upload progress */}
          {uploading && (
            <div className="upload-progress-container">
              <div className="upload-progress-info">
                <span>Uploading...</span>
                <span>
                  {uploadSpeed} | {uploadProgress}%
                </span>
              </div>
              <div className="upload-progress-bar">
                <div
                  className="upload-progress-fill"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Batch actions (selection mode) */}
          {selectionMode ? (
            <div className="batch-actions">
              <button
                className="batch-action-btn primary"
                onClick={insertSelected}
                disabled={!hasSelection || deleting}
              >
                <Plus size={16} />
                Insert ({selectedIds.size})
              </button>
              <button
                className="batch-action-btn"
                onClick={saveSelectedToFiles}
                disabled={!hasSelection || deleting}
              >
                <FileDown size={16} />
                Save to Files
              </button>
              <button
                className="batch-action-btn danger"
                onClick={() => setShowDeleteConfirmation(true)}
                disabled={!hasSelection || deleting}
              >
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          ) : (
            /* Upload button */
            <div className="upload-section">
              <input
                ref={fileInputRef}
                type="file"
                accept={IMAGE_UPLOAD.ALLOWED_MIME_TYPES.join(",")}
                multiple
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
              <button
                className="upload-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Upload size={18} />
                )}
                {uploading ? "Uploading..." : "Upload Images"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={deleteSelected}
        title={`Delete ${selectedIds.size} Image${selectedIds.size > 1 ? "s" : ""}?`}
        message="Are you sure you want to delete the selected images? This action cannot be undone."
        confirmText="Delete"
        isDangerous
      />

      {/* Cleanup Confirmation Modal */}
      <ConfirmationModal
        isOpen={showCleanupConfirmation}
        onClose={() => setShowCleanupConfirmation(false)}
        onConfirm={cleanupUnused}
        title="Cleanup Unused Images?"
        message={`There are ${unusedCount} images not used in the document. Delete them to save space?`}
        confirmText="Cleanup"
        isDangerous
      />
    </>,
    document.body
  );
};