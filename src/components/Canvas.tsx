import { useEffect, useRef } from 'react';

type CanvasArgs = {
  width: number;
  height: number;
};

const Canvas = ({ width, height }: CanvasArgs) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvasElem = canvas.current;
    if (canvasElem === null) return;

    let mouse = { x: 0, y: 0 };
    const getMousePosition = (e: MouseEvent) => {
      const xFit = canvasElem.clientWidth / canvasElem.clientHeight < width / height;
      const scale = xFit ? width / canvasElem.clientWidth : height / canvasElem.clientHeight;
      const xOffset = xFit ? 0 : (canvasElem.clientWidth - width / scale) / 2;
      const yOffset = xFit ? (canvasElem.clientHeight - height / scale) / 2 : 0;
      mouse = { x: scale * (e.offsetX - xOffset), y: scale * (e.offsetY - yOffset) };
    };
    canvasElem.addEventListener('mousemove', getMousePosition);

    const ctx = canvasElem.getContext('2d')!;
    let ref: null | number = null;
    const loop = () => {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, width, height);
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 20, 0, 2 * Math.PI);
      ctx.fillStyle = '#eee';
      ctx.fill();
      ref = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      canvasElem.removeEventListener('mousemove', getMousePosition);
      if (ref !== null) cancelAnimationFrame(ref);
    };
  }, [width, height]);
  return (
    <canvas ref={canvas} width={`${width}`} height={`${height}`} className="size-full object-contain absolute"></canvas>
  );
};

export default Canvas;
