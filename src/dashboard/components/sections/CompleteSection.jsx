import React, { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'

// Hand-drawn-feeling arrow that sweeps from down near the headline
// up-and-right toward the menu bar that lives above the window.
// Two separate paths (body + chevron) give it that "drawn in strokes"
// vibe; rounded caps soften the ends.
function SweepingArrow({ className = '' }) {
  // A tall, diagonal sweep: the tail starts near the text area (lower-left
  // of the SVG, which lands to the right of the centered paragraph), the
  // body bows OUT to the right as it rises, then pulls up into a near-
  // vertical approach to the tip in the top-right corner of the window.
  // The chevron is two separate strokes so it reads as hand-drawn.
  return (
    <svg
      className={`pointer-events-none absolute top-2 right-2 ${className}`}
      width="300"
      height="210"
      viewBox="0 0 300 210"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* body: same curve as before, with an additional 10% trimmed off the tail via De Casteljau so the tip + approach are identical while the tail clears the headline text */}
      <path d="M 162 178 C 255 148 282 85 282 22" strokeWidth="2.5" />
      {/* chevron opens downward from the tip */}
      <path d="M 260 42 L 281 21" strokeWidth="2.5" />
      <path d="M 282 22 L 298 44" strokeWidth="2.5" />
    </svg>
  )
}

export function CompleteSection({ mc, toDisplayText }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof window === 'undefined') return undefined

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return undefined

    let fire
    try {
      fire = confetti.create(canvas, { resize: true, useWorker: false })
    } catch {
      return undefined
    }

    // Flat 2D owls, comfortable readable size. Render the emoji bitmap
    // at 2× the particle scalar so canvas-confetti downscales into the
    // final draw — downscaling stays crisp, whereas rendering 1:1
    // leaves the bitmap susceptible to fractional-pixel blur on
    // high-DPI displays.
    const OWL_SCALAR = 2.6
    let owlShape
    try {
      owlShape = confetti.shapeFromText({ text: '🦉', scalar: OWL_SCALAR * 2 })
    } catch {
      owlShape = undefined
    }

    const common = {
      scalar: OWL_SCALAR,
      flat: true,          // no 3D tumble — owls stay face-on, just drift in 2D
      gravity: 0.4,        // float down slowly
      startVelocity: 26,   // launch gently
      decay: 0.94,         // hang in the air even longer
      ticks: 900,          // each particle lives ~4x longer than default
      ...(owlShape ? { shapes: [owlShape] } : {})
    }

    let cancelled = false
    const timeouts = []
    const scheduleBurst = (delayMs, options) => {
      const id = setTimeout(() => {
        if (cancelled) return
        try {
          fire(options)
        } catch {
          // ignore render failures
        }
      }, delayMs)
      timeouts.push(id)
    }

    // Three bursts over ~1s — center, left, right — alternating origins
    // so owls fall from all over while staying a brief moment.
    scheduleBurst(0,    { ...common, particleCount: 28, spread: 110, origin: { x: 0.5,  y: 0.48 } })
    scheduleBurst(500,  { ...common, particleCount: 18, spread: 80,  origin: { x: 0.18, y: 0.55 } })
    scheduleBurst(1000, { ...common, particleCount: 18, spread: 80,  origin: { x: 0.82, y: 0.55 } })

    return () => {
      cancelled = true
      for (const id of timeouts) clearTimeout(id)
      try {
        fire.reset()
      } catch {
        // noop
      }
    }
  }, [])

  const htmlCopy = mc?.dashboard?.html || {}
  const headline = toDisplayText(htmlCopy.completeHeadline)
  const closeLink = toDisplayText(htmlCopy.completeCloseLink)
  const tryBody = toDisplayText(htmlCopy.completeTryBody)
  const tryCommand = toDisplayText(htmlCopy.completeTryCommand)
  const notSurePrompt = toDisplayText(htmlCopy.completeNotSurePrompt)
  const ideasLinkLabel = toDisplayText(htmlCopy.completeIdeasLinkLabel)
  const ideasLinkHref = toDisplayText(htmlCopy.completeIdeasLinkHref)

  const closeWindow = () => {
    if (typeof window !== 'undefined' && typeof window.close === 'function') {
      window.close()
    }
  }

  const handleCloseLinkClick = (event) => {
    event.preventDefault()
    closeWindow()
  }

  const handleIdeasLinkClick = (event) => {
    // Let setWindowOpenHandler in main route this to shell.openExternal,
    // then close the settings window right after.
    event.preventDefault()
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(ideasLinkHref, '_blank', 'noopener,noreferrer')
    }
    closeWindow()
  }

  return (
    <section
      id="section-complete"
      role="tabpanel"
      aria-labelledby="section-title"
      className="relative flex-1 flex flex-col items-center justify-center px-12 py-14 overflow-hidden bg-white dark:bg-[#111]"
    >
      <SweepingArrow className="text-indigo-500 dark:text-indigo-300" />

      <div className="relative z-10 max-w-md w-full space-y-5 text-center">
        <h2 className="text-[32px] leading-tight font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {headline}
        </h2>

        <p className="text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          <a
            href="#"
            onClick={handleCloseLinkClick}
            className="text-indigo-600 dark:text-indigo-300 underline-offset-4 hover:underline cursor-pointer"
          >
            {closeLink}
          </a>{' '}
          {tryBody}{' '}
          <code className="font-mono text-[13px] bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-md px-2 py-0.5 border border-zinc-200 dark:border-zinc-700">
            {tryCommand}
          </code>
          .
        </p>

        <p className="text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          {notSurePrompt}{' '}
          <a
            href={ideasLinkHref}
            target="_blank"
            rel="noreferrer noopener"
            onClick={handleIdeasLinkClick}
            className="text-indigo-600 dark:text-indigo-300 underline-offset-4 hover:underline cursor-pointer"
          >
            {ideasLinkLabel}
          </a>
          .
        </p>
      </div>

      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 w-full h-full"
        style={{ zIndex: 9999 }}
        aria-hidden="true"
      />
    </section>
  )
}
