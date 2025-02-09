import { useEffect, useRef } from "react";
import * as Types from "../controller/AudioControllerTypes";

type CanvasArgs = {
  width: number;
  height: number;
  onMouse?: (event: Types.MouseEvent, x: number, y: number) => void;
  onDraw?: (w: number, h: number) => Types.Shape[];
};

export const Canvas = ({ width, height, onMouse, onDraw }: CanvasArgs) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvasElem = canvas.current;
    if (canvasElem === null) return;

    let mouse = { x: 0, y: 0 };
    const getMousePosition = (e: MouseEvent): { x: number, y: number } => {
      const xFit = canvasElem.clientWidth / canvasElem.clientHeight < width / height;
      const scale = xFit ? width / canvasElem.clientWidth : height / canvasElem.clientHeight;
      const xOffset = xFit ? 0 : (canvasElem.clientWidth - width / scale) / 2;
      const yOffset = xFit ? (canvasElem.clientHeight - height / scale) / 2 : 0;
      return { x: scale * (e.offsetX - xOffset), y: scale * (e.offsetY - yOffset) };
    };
    const mouseUp = (e: MouseEvent) => {
      if (e.button === 0) onMouse?.("upL", mouse.x, mouse.y);
      if (e.button === 2) onMouse?.("upR", mouse.x, mouse.y);
    };
    const mouseDown = (e: MouseEvent) => {
      if (e.button === 0) onMouse?.("dwL", mouse.x, mouse.y);
      if (e.button === 2) onMouse?.("dwR", mouse.x, mouse.y);
    };
    const mouseMove = (e: MouseEvent) => {
      mouse = getMousePosition(e);
      onMouse?.("move", mouse.x, mouse.y);
    };
    canvasElem.addEventListener("mouseup", mouseUp);
    canvasElem.addEventListener("mousedown", mouseDown);
    canvasElem.addEventListener("mousemove", mouseMove);

    const ctx = canvasElem.getContext("2d")!;
    let ref: null | number = null;
    const loop = () => {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, width, height);
      const shapes = onDraw?.(width, height) ?? [];
      for (let i = 0; i < shapes.length; i++) {
        const shape = shapes[i];
        if (Types.isShapePolygon(shape)) {
          ctx.beginPath();
          for (let j = 0; j < shape.shape.length; j++) {
            const [x, y] = shape.shape[j];
            if (j === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          if (shape.strokeClosed ?? false) {
            ctx.closePath();
          }
          if (shape.fill != undefined) {
            ctx.fillStyle = `#${shape.fill.toString(16).padStart(6, "0")}`;
            ctx.fill();
          }
          if (shape.stroke != undefined && shape.strokeWidth !== 0) {
            ctx.strokeStyle = `#${shape.stroke.toString(16).padStart(6, "0")}`;
            ctx.lineWidth = shape.strokeWidth ?? 1;
            ctx.stroke();
          }
          continue;
        }
        if (Types.isShapeText(shape)) {
          ctx.font = `${shape.size ?? 16}px "Roboto Mono"`;
          ctx.fillStyle = `#${shape.color?.toString(16).padStart(6, "0") ?? "fff"}`;
          ctx.fillText(shape.text, shape.x, shape.y);
          continue;
        }
        console.assert(false, "unknown shape type", shape);
      }
      ref = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      canvasElem.removeEventListener("mouseup", mouseUp);
      canvasElem.removeEventListener("mousedown", mouseDown);
      canvasElem.removeEventListener("mousemove", mouseMove);
      if (ref !== null) cancelAnimationFrame(ref);
    };
  }, [width, height, onMouse, onDraw]);
  return (
    <canvas ref={canvas} width={`${width}`} height={`${height}`} className="size-full object-contain absolute"></canvas>
  );
};
