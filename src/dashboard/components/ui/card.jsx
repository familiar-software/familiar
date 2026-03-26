import React from 'react'

import { cn } from '../../lib/utils'

export function Card({ className = '', ...props }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-100',
        className
      )}
      {...props}
    />
  )
}

export function CardHeader({ className = '', ...props }) {
  return <div className={cn('space-y-1 p-4', className)} {...props} />
}

export function CardTitle({ className = '', ...props }) {
  return (
    <h3
      className={cn('text-[16px] font-semibold leading-none tracking-tight text-zinc-900 dark:text-zinc-100', className)}
      {...props}
    />
  )
}

export function CardDescription({ className = '', ...props }) {
  return (
    <p
      className={cn('text-[14px] text-zinc-500 dark:text-zinc-400', className)}
      {...props}
    />
  )
}

export function CardContent({ className = '', ...props }) {
  return <div className={cn('p-4 pt-0', className)} {...props} />
}

export function CardFooter({ className = '', ...props }) {
  return <div className={cn('p-4 pt-0', className)} {...props} />
}
