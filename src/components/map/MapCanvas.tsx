import { useEffect, useRef } from 'react';
import type { SimConfig } from '../../sim/config';
import type { ScenarioResult } from '../../sim/simulate';
import { useStore } from '../../store';
import { H, W, drawBackground, drawFrame } from './renderer';

/** Canvas that redraws every animation frame from the shared timeline without React re-renders. */
export function MapCanvas({ result, config, blockIds, awayIdx }: { result: ScenarioResult; config: SimConfig; blockIds: string[]; awayIdx: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const bg = document.createElement('canvas');
    let scale = 1;
    let lastT = -1;
    let raf = 0;
    const away = new Set(awayIdx);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      scale = (cssW / W) * dpr;
      canvas.width = Math.round(W * scale);
      canvas.height = Math.round(H * scale);
      bg.width = canvas.width;
      bg.height = canvas.height;
      const b = bg.getContext('2d')!;
      b.setTransform(scale, 0, 0, scale, 0, 0);
      drawBackground(b, config, blockIds, away);
      lastT = -1;
    };
    const loop = () => {
      const t = useStore.getState().t;
      if (t !== lastT) {
        drawFrame(ctx, bg, result, config, t, scale);
        lastT = t;
      }
      raf = requestAnimationFrame(loop);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [result, config, blockIds, awayIdx]);
  return <canvas ref={ref} className="block aspect-[1000/620] w-full rounded-xl" />;
}
