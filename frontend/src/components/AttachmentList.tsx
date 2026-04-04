import React from 'react'
import { Download, FileText, Image as ImageIcon, Paperclip } from 'lucide-react'

import { formatFileSize, isImageAttachment, type SharedAttachment } from '../utils/fileUploads'

interface AttachmentListProps {
  attachments?: SharedAttachment[]
  compact?: boolean
}

const AttachmentList: React.FC<AttachmentListProps> = ({ attachments = [], compact = false }) => {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className={`space-y-2 ${compact ? 'mt-2' : 'mt-3'}`}>
      {attachments.map(attachment => (
        <a
          key={attachment.id}
          href={attachment.url}
          download={attachment.name}
          target="_blank"
          rel="noreferrer"
          className="block rounded-2xl border border-white/50 bg-white/70 p-2.5 text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50/60 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-brand-700 dark:hover:bg-brand-900/20"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
              {isImageAttachment(attachment) ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{attachment.name}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Paperclip className="h-3 w-3" />
                  {formatFileSize(attachment.size)}
                </span>
              </p>
            </div>
            <Download className="h-4 w-4 flex-shrink-0 text-slate-400" />
          </div>
          {isImageAttachment(attachment) && (
            <img
              src={attachment.url}
              alt={attachment.name}
              className="mt-2 max-h-40 w-full rounded-xl object-cover"
            />
          )}
        </a>
      ))}
    </div>
  )
}

export default AttachmentList
