import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

export function useViewportHeight() {
  const [viewportHeight, setViewportHeight] = React.useState<number>(0)

  React.useEffect(() => {
    const updateHeight = () => {
      setViewportHeight(window.innerHeight)
    }

    // Set initial height
    updateHeight()

    // Listen for resize events
    window.addEventListener('resize', updateHeight)
    
    // Listen for orientation changes
    window.addEventListener('orientationchange', updateHeight)

    return () => {
      window.removeEventListener('resize', updateHeight)
      window.removeEventListener('orientationchange', updateHeight)
    }
  }, [])

  return viewportHeight
}

export function useSafeAreaInsets() {
  const [safeAreaInsets, setSafeAreaInsets] = React.useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  })

  React.useEffect(() => {
    const updateSafeAreaInsets = () => {
      const style = getComputedStyle(document.documentElement)
      setSafeAreaInsets({
        top: parseInt(style.getPropertyValue('--sat') || '0'),
        right: parseInt(style.getPropertyValue('--sar') || '0'),
        bottom: parseInt(style.getPropertyValue('--sab') || '0'),
        left: parseInt(style.getPropertyValue('--sal') || '0'),
      })
    }

    // Set initial values
    updateSafeAreaInsets()

    // Listen for resize events
    window.addEventListener('resize', updateSafeAreaInsets)
    
    // Listen for orientation changes
    window.addEventListener('orientationchange', updateSafeAreaInsets)

    return () => {
      window.removeEventListener('resize', updateSafeAreaInsets)
      window.removeEventListener('orientationchange', updateSafeAreaInsets)
    }
  }, [])

  return safeAreaInsets
}
