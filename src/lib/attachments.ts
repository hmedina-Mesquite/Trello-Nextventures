import type { Attachment } from '../types'

const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i

/** Only uploaded files (storage_path) count -- a plain link attachment is never a thumbnail/cover candidate, even if its URL happens to point at an image. */
export function isImageAttachment(attachment: Pick<Attachment, 'storage_path' | 'file_type' | 'file_name'>): boolean {
  if (!attachment.storage_path) return false
  if (attachment.file_type) return attachment.file_type.startsWith('image/')
  return IMAGE_EXTENSION_RE.test(attachment.file_name)
}
