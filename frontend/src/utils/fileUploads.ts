export interface SharedAttachment {
  id: string
  name: string
  size: number
  type: string
  url: string
  uploadedAt: string
}

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('file_read_failed'))
    reader.readAsDataURL(file)
  })

export const createSharedAttachment = async (file: File): Promise<SharedAttachment> => {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('file_too_large')
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    url: await readAsDataUrl(file),
    uploadedAt: new Date().toISOString(),
  }
}

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const isImageAttachment = (attachment: Pick<SharedAttachment, 'type'>) =>
  attachment.type.startsWith('image/')
