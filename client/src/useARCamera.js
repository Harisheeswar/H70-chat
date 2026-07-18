import { useEffect, useRef, useState } from 'react';

// Lazy-load three.js only when anime3d filter is active
export function useARCamera(videoRef, canvasRef, activeFilter) {
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    // anime3d filter is removed — this hook is now a no-op stub
    // kept for backward compatibility
    return () => {};
  }, [activeFilter]);
  return { isReady };
}
