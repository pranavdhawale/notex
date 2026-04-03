import React from "react";
import {
  File,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Code,
} from "lucide-react";

/**
 * File type configuration for icon display
 */
const FILE_TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string }> = {
  // Images
  png: { icon: <ImageIcon size={18} />, label: "PNG Image" },
  jpg: { icon: <ImageIcon size={18} />, label: "JPEG Image" },
  jpeg: { icon: <ImageIcon size={18} />, label: "JPEG Image" },
  gif: { icon: <ImageIcon size={18} />, label: "GIF Image" },
  svg: { icon: <ImageIcon size={18} />, label: "SVG Image" },
  webp: { icon: <ImageIcon size={18} />, label: "WebP Image" },

  // Video
  mp4: { icon: <Film size={18} />, label: "MP4 Video" },
  mov: { icon: <Film size={18} />, label: "MOV Video" },
  avi: { icon: <Film size={18} />, label: "AVI Video" },
  webm: { icon: <Film size={18} />, label: "WebM Video" },

  // Audio
  mp3: { icon: <Music size={18} />, label: "MP3 Audio" },
  wav: { icon: <Music size={18} />, label: "WAV Audio" },
  ogg: { icon: <Music size={18} />, label: "OGG Audio" },
  flac: { icon: <Music size={18} />, label: "FLAC Audio" },

  // Code
  js: { icon: <Code size={18} />, label: "JavaScript" },
  ts: { icon: <Code size={18} />, label: "TypeScript" },
  tsx: { icon: <Code size={18} />, label: "TSX" },
  jsx: { icon: <Code size={18} />, label: "JSX" },
  py: { icon: <Code size={18} />, label: "Python" },
  json: { icon: <Code size={18} />, label: "JSON" },
  html: { icon: <Code size={18} />, label: "HTML" },
  css: { icon: <Code size={18} />, label: "CSS" },
  scss: { icon: <Code size={18} />, label: "SCSS" },
  sql: { icon: <Code size={18} />, label: "SQL" },
  sh: { icon: <Code size={18} />, label: "Shell Script" },

  // Documents
  txt: { icon: <FileText size={18} />, label: "Text File" },
  md: { icon: <FileText size={18} />, label: "Markdown" },
  pdf: { icon: <FileText size={18} />, label: "PDF Document" },
  doc: { icon: <FileText size={18} />, label: "Word Document" },
  docx: { icon: <FileText size={18} />, label: "Word Document" },

  // Archives
  zip: { icon: <File size={18} />, label: "ZIP Archive" },
  tar: { icon: <File size={18} />, label: "TAR Archive" },
  gz: { icon: <File size={18} />, label: "GZIP Archive" },
};

/**
 * Get the appropriate icon component for a file based on its extension
 * @param filename - The filename to get the icon for
 * @returns React node containing the appropriate icon
 */
export function getFileIcon(filename: string): React.ReactNode {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const config = FILE_TYPE_CONFIG[ext];

  if (config) {
    return config.icon;
  }

  return <File size={18} />;
}

/**
 * Get a human-readable label for a file type
 * @param filename - The filename to get the label for
 * @returns A descriptive label for the file type
 */
export function getFileTypeLabel(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const config = FILE_TYPE_CONFIG[ext];

  if (config) {
    return config.label;
  }

  return ext ? `${ext.toUpperCase()} File` : "Unknown File";
}

/**
 * Check if a file type is an image
 * @param filename - The filename to check
 * @returns true if the file is an image
 */
export function isImageFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext);
}

/**
 * Check if a file type is a video
 * @param filename - The filename to check
 * @returns true if the file is a video
 */
export function isVideoFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return ["mp4", "mov", "avi", "webm"].includes(ext);
}

/**
 * Check if a file type is previewable in browser
 * @param filename - The filename to check
 * @returns true if the file can be previewed in browser
 */
export function isPreviewableFile(filename: string): boolean {
  return isImageFile(filename) || isVideoFile(filename);
}