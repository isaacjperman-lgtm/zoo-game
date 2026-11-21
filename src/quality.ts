// Graphics quality. "low" is meant for small computers like the Raspberry Pi 5: no shadows, no real-time lamp
// lights, no antialiasing, a 1x pixel ratio, fewer trees and raindrops and a 30 fps cap.
// It is picked automatically on ARM machines and software/mobile GPUs, and can be forced with ?quality=low or
// ?quality=high in the address (remembered for next time), or from the Electron launcher with --quality=low.
export type Quality = 'low' | 'high'

function detect(): Quality {
  try {
    const q = new URLSearchParams(location.search).get('quality')
    if (q === 'low' || q === 'high') {
      localStorage.setItem('zoo-quality', q)
      return q
    }
    const saved = localStorage.getItem('zoo-quality')
    if (saved === 'low' || saved === 'high') return saved
  } catch {
    /* storage may be blocked */
  }
  if (/aarch64|armv|arm64|\bCrOS\b/i.test(navigator.userAgent)) return 'low'
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    const name = ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
    if (/V3D|VideoCore|llvmpipe|SwiftShader|softpipe|Mali|Adreno|PowerVR/i.test(name)) return 'low'
  } catch {
    /* no WebGL info */
  }
  return 'high'
}

const level = detect()
const low = level === 'low'

export const quality = {
  level,
  antialias: !low,
  shadows: !low,
  maxRatio: low ? 1 : Math.min(devicePixelRatio, 2),
  startRatio: low ? 1 : Math.min(devicePixelRatio, 2, 1.75),
  minRatio: low ? 0.5 : 0.7,
  /** 0 = uncapped */
  maxFps: low ? 30 : 0,
  trees: low ? 140 : 380,
  raindrops: low ? 700 : 3200,
  lampLights: low ? 0 : 8,
  gateLights: !low,
}
