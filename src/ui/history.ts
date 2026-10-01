import { useCallback, useState } from 'react'
import type { Composition } from '../music/types'

export function useCompositionHistory(initial: Composition) {
  const [present, setPresent] = useState(initial)
  const [past, setPast] = useState<Composition[]>([])
  const [future, setFuture] = useState<Composition[]>([])

  const commit = useCallback((next: Composition | ((current: Composition) => Composition)) => {
    setPresent((current) => {
      const value = typeof next === 'function' ? next(current) : next
      if (value === current) return current
      setPast((items) => [...items.slice(-39), current])
      setFuture([])
      return value
    })
  }, [])

  const replace = useCallback((next: Composition) => {
    setPresent(next)
    setPast([])
    setFuture([])
  }, [])

  const undo = useCallback(() => {
    setPast((items) => {
      const previous = items.at(-1)
      if (!previous) return items
      setPresent((current) => {
        setFuture((futureItems) => [current, ...futureItems].slice(0, 40))
        return previous
      })
      return items.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setFuture((items) => {
      const next = items[0]
      if (!next) return items
      setPresent((current) => {
        setPast((pastItems) => [...pastItems.slice(-39), current])
        return next
      })
      return items.slice(1)
    })
  }, [])

  return { composition: present, commit, replace, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 }
}
