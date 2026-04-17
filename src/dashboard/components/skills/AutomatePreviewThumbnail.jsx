import React from 'react'

// Animated thumbnail of the scheduled-task GIF that sits next to the
// prompt-box in Automate. Hovering enlarges the preview *above* the
// thumbnail so it isn't clipped by the bottom of the window.
export function AutomatePreviewThumbnail() {
  return (
    <div className="group relative h-full w-full">
      <img
        src="./assets/cowork-scheduled.gif"
        alt="Familiar used in a scheduled task"
        loading="lazy"
        className="block h-full w-full rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm object-cover cursor-zoom-in"
      />
      <span className="pointer-events-none absolute right-2 bottom-2 rounded-md bg-white/90 dark:bg-zinc-900/90 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-300 shadow-sm">
        Hover to preview
      </span>
      <img
        src="./assets/cowork-scheduled.gif"
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="pointer-events-none absolute right-0 bottom-full mb-2 w-[480px] max-w-none h-auto rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xl opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100 z-50"
      />
    </div>
  )
}
