import { useEffect, useRef } from 'react';

type CanvasArgs = {
  width: number;
  height: number;
  onMouse?: (event: "up" | "down" | "move", x: number, y: number) => void;
  onDraw?: () => any[];
};

export const Canvas = ({ width, height, onMouse, onDraw }: CanvasArgs) => {
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
    const mouseUp = () => { onMouse?.('up', mouse.x, mouse.y); };
    const mouseDown = () => { onMouse?.('down', mouse.x, mouse.y); };
    const mouseMove = (event: MouseEvent) => { getMousePosition(event); onMouse?.('move', mouse.x, mouse.y); };
    canvasElem.addEventListener('mouseup', mouseUp);
    canvasElem.addEventListener('mousedown', mouseDown);
    canvasElem.addEventListener('mousemove', mouseMove);

    const ctx = canvasElem.getContext('2d')!;
    let ref: null | number = null;
    const loop = () => {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, width, height);
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 20, 0, 2 * Math.PI);
      ctx.fillStyle = '#eee';
      ctx.fill();
      const shapes = (onDraw?.() ?? []);
      shapes.map((shape) => Object.entries(shape)).forEach((elem) => elem.map(([key, value]: any) => {
        if (key === "Polygon") {
          if (value.shape !== undefined) {
            ctx.beginPath();
            for (let i: number = 0; i < value.shape.length / 2; i++) {
              const x = value.shape[i * 2];
              const y = value.shape[i * 2 + 1];
              if (i === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
            }
          }
          if (value.fill !== undefined) {
            ctx.fillStyle = `#${value.fill.toString(16).padStart(6, '0')}`;
            ctx.fill();
          }
          if (value.stroke !== undefined) {
            ctx.strokeStyle = `#${value.stroke.toString(16).padStart(6, '0')}`;
            ctx.lineWidth = value.stroke_width ?? 1;
            ctx.stroke();
          }
        }
        if (key === "Text") {
          // TODO
        }
      }));
      ref = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      canvasElem.removeEventListener('mouseup', mouseUp);
      canvasElem.removeEventListener('mousedown', mouseDown);
      canvasElem.removeEventListener('mousemove', mouseMove);
      if (ref !== null) cancelAnimationFrame(ref);
    };
  }, [width, height]);
  return (
    <canvas ref={canvas} width={`${width}`} height={`${height}`} className="size-full object-contain absolute"></canvas>
  );
};
