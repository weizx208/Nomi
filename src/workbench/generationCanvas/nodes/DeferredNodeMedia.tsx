import React from 'react'
import { NomiImage, type NomiImageProps } from '../../../design/media'
import { cn } from '../../../utils/cn'

export type DeferredNodeMediaKind = 'image' | 'video'

const DEFAULT_MEDIA_LIMITS: Record<DeferredNodeMediaKind, number> = {
  image: 4,
  video: 1,
}
const MEDIA_SLOT_AUTO_RELEASE_MS = 8000
const MEDIA_INTERSECTION_ROOT_MARGIN = '0px'

type DeferredMediaQueueEntry = {
  id: number
  kind: DeferredNodeMediaKind
  activate: (release: () => void) => void
  activated: boolean
  cancelled: boolean
  release: (() => void) | null
  autoReleaseTimer: ReturnType<typeof setTimeout> | null
}

let nextMediaQueueId = 1
const mediaLimits: Record<DeferredNodeMediaKind, number> = { ...DEFAULT_MEDIA_LIMITS }
const activeMediaCounts: Record<DeferredNodeMediaKind, number> = { image: 0, video: 0 }
const mediaQueues: Record<DeferredNodeMediaKind, DeferredMediaQueueEntry[]> = { image: [], video: [] }
const activeMediaEntries = new Set<DeferredMediaQueueEntry>()

function removeQueuedEntry(entry: DeferredMediaQueueEntry): void {
  const queue = mediaQueues[entry.kind]
  const index = queue.indexOf(entry)
  if (index >= 0) queue.splice(index, 1)
}

function drainDeferredMediaQueue(kind: DeferredNodeMediaKind): void {
  const queue = mediaQueues[kind]
  while (activeMediaCounts[kind] < mediaLimits[kind] && queue.length > 0) {
    const entry = queue.shift()
    if (!entry || entry.cancelled) continue
    entry.activated = true
    activeMediaEntries.add(entry)
    activeMediaCounts[kind] += 1

    let released = false
    const release = () => {
      if (released) return
      released = true
      if (entry.autoReleaseTimer) {
        clearTimeout(entry.autoReleaseTimer)
        entry.autoReleaseTimer = null
      }
      activeMediaEntries.delete(entry)
      activeMediaCounts[kind] = Math.max(0, activeMediaCounts[kind] - 1)
      drainDeferredMediaQueue(kind)
    }
    entry.release = release
    entry.autoReleaseTimer = setTimeout(release, MEDIA_SLOT_AUTO_RELEASE_MS)
    entry.activate(release)
  }
}

export function requestDeferredNodeMediaSlot(
  kind: DeferredNodeMediaKind,
  activate: (release: () => void) => void,
  priority = false,
): () => void {
  const entry: DeferredMediaQueueEntry = {
    id: nextMediaQueueId,
    kind,
    activate,
    activated: false,
    cancelled: false,
    release: null,
    autoReleaseTimer: null,
  }
  nextMediaQueueId += 1
  if (priority) mediaQueues[kind].unshift(entry)
  else mediaQueues[kind].push(entry)
  drainDeferredMediaQueue(kind)
  return () => {
    entry.cancelled = true
    if (!entry.activated) removeQueuedEntry(entry)
    entry.release?.()
  }
}

type IdleCapableWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

export function scheduleAfterCanvasShellPaint(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    const timer = setTimeout(callback, 0)
    return () => clearTimeout(timer)
  }

  const idleWindow = window as IdleCapableWindow
  let cancelled = false
  let firstFrame = 0
  let secondFrame = 0
  let idleHandle: number | null = null
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null

  const run = () => {
    if (cancelled) return
    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleHandle = idleWindow.requestIdleCallback(() => {
        if (!cancelled) callback()
      }, { timeout: 350 })
      return
    }
    fallbackTimer = setTimeout(() => {
      if (!cancelled) callback()
    }, 32)
  }

  firstFrame = window.requestAnimationFrame(() => {
    secondFrame = window.requestAnimationFrame(run)
  })

  return () => {
    cancelled = true
    window.cancelAnimationFrame(firstFrame)
    window.cancelAnimationFrame(secondFrame)
    if (idleHandle !== null && typeof idleWindow.cancelIdleCallback === 'function') {
      idleWindow.cancelIdleCallback(idleHandle)
    }
    if (fallbackTimer) clearTimeout(fallbackTimer)
  }
}

type IntersectionObserverCapableWindow = Window & {
  IntersectionObserver?: typeof IntersectionObserver
}

export function observeDeferredNodeMediaVisibility(
  element: Element | null,
  onVisible: () => void,
): () => void {
  const win = typeof window === 'undefined' ? null : (window as IntersectionObserverCapableWindow)
  if (!element || !win?.IntersectionObserver) {
    onVisible()
    return () => {}
  }

  let done = false
  const observer = new win.IntersectionObserver(
    (entries) => {
      if (done) return
      if (!entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) return
      done = true
      observer.disconnect()
      onVisible()
    },
    {
      root: null,
      rootMargin: MEDIA_INTERSECTION_ROOT_MARGIN,
      threshold: 0,
    },
  )
  observer.observe(element)
  return () => {
    done = true
    observer.disconnect()
  }
}

export function useDeferredNodeMediaSrc({
  src,
  kind,
  priority = false,
}: {
  src?: string
  kind: DeferredNodeMediaKind
  priority?: boolean
}): {
  deferredSrc: string | null
  loading: boolean
  placeholderRef: React.RefCallback<HTMLDivElement>
  markLoaded: () => void
  markFailed: () => void
} {
  const [deferredSrc, setDeferredSrc] = React.useState<string | null>(null)
  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null)
  const [visibleSrc, setVisibleSrc] = React.useState<string | null>(null)
  const [placeholderElement, setPlaceholderElement] = React.useState<HTMLDivElement | null>(null)
  const releaseRef = React.useRef<(() => void) | null>(null)
  const priorityRef = React.useRef(priority)
  priorityRef.current = priority

  const releaseSlot = React.useCallback(() => {
    releaseRef.current?.()
    releaseRef.current = null
  }, [])

  React.useEffect(() => {
    releaseSlot()
    setDeferredSrc(null)
    setLoadedSrc(null)
    setVisibleSrc(null)
    if (!src) return
  }, [kind, releaseSlot, src])

  React.useEffect(() => {
    if (!src || loadedSrc === src || deferredSrc === src || visibleSrc === src) return undefined
    if (!placeholderElement) return undefined
    return observeDeferredNodeMediaVisibility(placeholderElement, () => setVisibleSrc(src))
  }, [deferredSrc, loadedSrc, placeholderElement, src, visibleSrc])

  React.useEffect(() => {
    if (!src || visibleSrc !== src) return undefined
    let cancelled = false
    let cancelQueuedSlot: (() => void) | null = null
    const cancelPaintWait = scheduleAfterCanvasShellPaint(() => {
      if (cancelled) return
      cancelQueuedSlot = requestDeferredNodeMediaSlot(
        kind,
        (release) => {
          if (cancelled) {
            release()
            return
          }
          releaseRef.current = release
          setDeferredSrc(src)
        },
        priorityRef.current,
      )
    })

    return () => {
      cancelled = true
      cancelPaintWait()
      cancelQueuedSlot?.()
      releaseSlot()
    }
  }, [kind, releaseSlot, src, visibleSrc])

  const placeholderRef = React.useCallback((element: HTMLDivElement | null) => {
    setPlaceholderElement(element)
  }, [])

  const markLoaded = React.useCallback(() => {
    setLoadedSrc(deferredSrc)
    releaseSlot()
  }, [deferredSrc, releaseSlot])

  const markFailed = React.useCallback(() => {
    setLoadedSrc(deferredSrc)
    releaseSlot()
  }, [deferredSrc, releaseSlot])

  return {
    deferredSrc,
    loading: Boolean(src && loadedSrc !== src),
    placeholderRef,
    markLoaded,
    markFailed,
  }
}

export const DeferredNodeMediaPlaceholder = React.forwardRef<HTMLDivElement, { className?: string }>(
  function DeferredNodeMediaPlaceholder({ className }, ref): JSX.Element {
  return (
    <div
      ref={ref}
      className={cn('generation-canvas-v2-node__media-loading', className)}
      aria-hidden="true"
    />
  )
  },
)

export type DeferredNodeImageProps = Omit<NomiImageProps, 'src'> & {
  src: string
  priority?: boolean
  placeholderClassName?: string
}

export function DeferredNodeImage({
  src,
  priority = false,
  placeholderClassName,
  className,
  onLoad,
  onError,
  ...props
}: DeferredNodeImageProps): JSX.Element {
  const media = useDeferredNodeMediaSrc({ src, kind: 'image', priority })
  return (
    <>
      {media.loading ? <DeferredNodeMediaPlaceholder ref={media.placeholderRef} className={placeholderClassName} /> : null}
      {media.deferredSrc ? (
        <NomiImage
          {...props}
          src={media.deferredSrc}
          className={cn(className, media.loading && 'opacity-0')}
          onLoad={(event) => {
            media.markLoaded()
            onLoad?.(event)
          }}
          onError={(event) => {
            media.markFailed()
            onError?.(event)
          }}
        />
      ) : null}
    </>
  )
}

export type DeferredNodeVideoProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  src: string
  priority?: boolean
  placeholderClassName?: string
}

function releaseVideoElement(video: HTMLVideoElement | null): void {
  if (!video) return
  video.pause()
  video.removeAttribute('src')
  try {
    video.load()
  } catch {
    /* Some test DOMs do not implement media loading. */
  }
}

export function DeferredNodeVideo({
  src,
  priority = false,
  placeholderClassName,
  className,
  onLoadedMetadata,
  onError,
  ...props
}: DeferredNodeVideoProps): JSX.Element {
  const media = useDeferredNodeMediaSrc({ src, kind: 'video', priority })
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const setVideoRef = React.useCallback((element: HTMLVideoElement | null) => {
    if (videoRef.current && videoRef.current !== element) {
      releaseVideoElement(videoRef.current)
    }
    videoRef.current = element
  }, [])

  React.useEffect(() => {
    return () => releaseVideoElement(videoRef.current)
  }, [])

  return (
    <>
      {media.loading ? <DeferredNodeMediaPlaceholder ref={media.placeholderRef} className={placeholderClassName} /> : null}
      {media.deferredSrc ? (
        <video
          {...props}
          ref={setVideoRef}
          src={media.deferredSrc}
          className={cn(className, media.loading && 'opacity-0')}
          onLoadedMetadata={(event) => {
            media.markLoaded()
            onLoadedMetadata?.(event)
          }}
          onError={(event) => {
            media.markFailed()
            onError?.(event)
          }}
        />
      ) : null}
    </>
  )
}

export function __resetDeferredNodeMediaQueueForTests(): void {
  for (const entry of activeMediaEntries) {
    if (entry.autoReleaseTimer) clearTimeout(entry.autoReleaseTimer)
  }
  activeMediaEntries.clear()
  for (const kind of Object.keys(mediaQueues) as DeferredNodeMediaKind[]) {
    for (const entry of mediaQueues[kind]) {
      if (entry.autoReleaseTimer) clearTimeout(entry.autoReleaseTimer)
    }
    mediaQueues[kind] = []
    activeMediaCounts[kind] = 0
    mediaLimits[kind] = DEFAULT_MEDIA_LIMITS[kind]
  }
  nextMediaQueueId = 1
}

export function __setDeferredNodeMediaLimitForTests(kind: DeferredNodeMediaKind, limit: number): void {
  mediaLimits[kind] = Math.max(1, Math.floor(limit))
  drainDeferredMediaQueue(kind)
}
