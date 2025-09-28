import { useEffect, useRef } from "react";
import * as Types from "../controller/AudioControllerTypes";

type CanvasArgs = {
  width: number;
  height: number;
  onDraw?: (
    w: number,
    h: number,
    mouse: { x: number; y: number; pressedL: boolean; pressedR: boolean },
  ) => Types.Shape[];
};

export const Canvas = ({ width, height, onDraw }: CanvasArgs) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvasElem = canvas.current;
    if (canvasElem === null) return;

    const mouse = { x: 0, y: 0, pressedL: false, pressedR: false };
    const pointerUp = (e: PointerEvent) => {
      if (e.button === 0) mouse.pressedL = false;
      if (e.button === 2) mouse.pressedR = false;
    };
    const pointerDown = (e: PointerEvent) => {
      if (e.button === 0) mouse.pressedL = true;
      if (e.button === 2) mouse.pressedR = true;
    };
    const pointerMove = (e: PointerEvent) => {
      const xFit =
        canvasElem.clientWidth / canvasElem.clientHeight < width / height;
      const scale = xFit
        ? width / canvasElem.clientWidth
        : height / canvasElem.clientHeight;
      const xOffset = xFit ? 0 : (canvasElem.clientWidth - width / scale) / 2;
      const yOffset = xFit ? (canvasElem.clientHeight - height / scale) / 2 : 0;
      mouse.x = scale * (e.offsetX - xOffset);
      mouse.y = scale * (e.offsetY - yOffset);
    };
    canvasElem.addEventListener("pointerup", pointerUp);
    canvasElem.addEventListener("pointerdown", pointerDown);
    canvasElem.addEventListener("pointermove", pointerMove);

    const ctx = canvasElem.getContext("2d")!;
    let ref: null | number = null;
    const loop = () => {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, width, height);
      const shapes = onDraw?.(width, height, mouse) ?? [];
      for (let i = 0; i < shapes.length; i++) {
        const shape = shapes[i];
        if (Types.isShapePolygon(shape)) {
          ctx.beginPath();
          for (let j = 0; j < shape.path.length; j++) {
            const [x, y] = shape.path[j];
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
            ctx.fillStyle = `#${shape.fill.toString(16).padStart(8, "0")}`;
            ctx.fill();
          }
          if (shape.stroke != undefined && shape.strokeWidth !== 0) {
            ctx.strokeStyle = `#${shape.stroke.toString(16).padStart(8, "0")}`;
            ctx.lineWidth = shape.strokeWidth ?? 1;
            ctx.stroke();
          }
          continue;
        }
        if (Types.isShapeText(shape)) {
          ctx.font = `${shape.size ?? 16}px "Roboto Mono"`;
          ctx.fillStyle = `#${shape.color?.toString(16).padStart(8, "0") ?? "fff"}`;
          ctx.fillText(shape.text, shape.x, shape.y);
          continue;
        }
        console.assert(false, "unknown shape type", shape);
      }
      ref = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      canvasElem.removeEventListener("pointerup", pointerUp);
      canvasElem.removeEventListener("pointerdown", pointerDown);
      canvasElem.removeEventListener("pointermove", pointerMove);
      if (ref !== null) cancelAnimationFrame(ref);
    };
  }, [width, height, onDraw]);
  return (
    <canvas
      ref={canvas}
      width={`${width}`}
      height={`${height}`}
      className="size-full object-contain absolute"
      style={{ imageRendering: "pixelated" }}
    ></canvas>
  );
};
