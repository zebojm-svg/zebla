/** Kuratierte öffentliche Dialoge / Slideshows (nur Admin pflegt). */

export interface PublicCatalogFolder {
  id: string
  name: string
  parentId: string | null
  /** Sprachpaar (bei Root-Ordnern gesetzt, sonst von Vorfahren geerbt) */
  sourceLanguage?: string
  targetLanguage?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface PublicCatalogItem {
  id: string
  folderId: string
  title: string
  description?: string
  thumbnailUrl?: string
  /** Hochgeladene Diashow / Slideshow (MP4) */
  videoUrl?: string
  /** Optional hochgeladenes PDF */
  pdfUrl?: string
  /** Dialog zum Kopieren in die Bibliothek */
  shareToken?: string
  dialogId?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type PublicCatalogMediaKind = 'thumbnail' | 'video' | 'pdf'
