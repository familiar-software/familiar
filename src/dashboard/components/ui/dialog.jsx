import React, { useEffect } from 'react'

import { cn } from '../../lib/utils'

export function Dialog({
  open = false,
  onOpenChange,
  dismissible = true,
  children
}) {
  useEffect(() => {
    if (!open) {
      return undefined
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && dismissible) {
        onOpenChange?.(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [dismissible, onOpenChange, open])

  if (!open) {
    return null
  }

  return (
    <div
      className="react-install-guide-overlay"
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) {
          onOpenChange?.(false)
        }
      }}
    >
      {children}
    </div>
  )
}

export function DialogContent({ className = '', children, ...props }) {
  return (
    <div
      className={cn(
        'w-full rounded-xl border border-zinc-200 bg-white text-zinc-950 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100',
        'max-h-[calc(100vh-48px)] overflow-hidden',
        className
      )}
      role="dialog"
      aria-modal="true"
      {...props}
    >
      {children}
    </div>
  )
}

export function DialogHeader({ className = '', ...props }) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />
}

export function DialogTitle({ className = '', ...props }) {
  return <h2 className={cn('text-[18px] font-semibold', className)} {...props} />
}

export function DialogDescription({ className = '', ...props }) {
  return <p className={cn('text-[14px] text-zinc-500 dark:text-zinc-400', className)} {...props} />
}

export function DialogFooter({ className = '', ...props }) {
  return <div className={cn('flex items-center gap-2', className)} {...props} />
}
