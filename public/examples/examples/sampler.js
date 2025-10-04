"use strict";
const keyboard = new Map();
const record = new Float32Array(48000);
let prePressed = false;
let stop = false;

ps88.audio((ctx) => {
  for (let event of ctx.midi) {
    if (event.type === "NoteOn") {
      keyboard.set(event.note, { time: 0, ...event });
    }
    if (event.type === "NoteOff") {
      keyboard.delete(event.note);
    }
  }

  const length = ctx.audio[0]?.length ?? 0;
  if (!stop) {
    record.copyWithin(0, length);
  }
  const recordOffset = Math.max(record.length - length, 0);
  for (let i = 0; i < length; i++) {
    let wave = 0;
    for (let key of keyboard.values()) {
      if (i < key.timing || !stop) {
        continue;
      }
      wave += 0.2 * record[Math.min(Math.floor(key.time), record.length - 1)];
      key.time += 1 * Math.pow(2, (key.note - 69) / 12);
    }
    if (!stop) {
      record[recordOffset + i] = 0;
    }
    for (let ch of ctx.audio) {
      if (!stop) {
        record[recordOffset + i] += ch[i] / ctx.audio.length;
      }
      ch[i] = wave;
    }
  }
});

ps88.gui((ctx) => {
  rect(ctx, 0, 0, ctx.w, ctx.h, 0x000000ff);
  circle(ctx, ctx.w / 2, (ctx.h * 6) / 7, 30, 0xfc7a1eff);
  rect(
    ctx,
    (ctx.w * 1) / 20,
    (ctx.h * 1) / 7,
    (ctx.w * 18) / 20,
    (ctx.h * 4) / 7,
    undefined,
    0xfc7a1eff,
    2,
  );
  graph(
    ctx,
    record,
    3,
    0,
    (ctx.h * 1) / 7,
    ctx.w,
    (ctx.h * 4) / 7,
    0xfc7a1eff,
    3,
  );
  const clicked = ctx.mouse.pressedL && !prePressed;
  if (clicked) {
    stop = !stop;
  }
  prePressed = ctx.mouse.pressedL;
});

const rect = (ctx, x, y, w, h, fill, stroke, strokeWidth) => {
  const path = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  ctx.addPolygon(path, { fill, stroke, strokeWidth, strokeClosed: true });
};

const circle = (ctx, x, y, r, fill, stroke, strokeWidth) => {
  const div = 32;
  const path = [...Array(div)].map((_, i) => {
    const t = (2 * Math.PI * i) / div;
    return [x + r * Math.cos(t), y + r * Math.sin(t)];
  });
  ctx.addPolygon(path, { fill, stroke, strokeWidth });
};

const graph = (ctx, wave, gain, x, y, w, h, stroke, strokeWidth) => {
  const path = [];
  for (let x2 = 0; x2 <= w; x2++) {
    const i = Math.floor(((wave.length - 1) * x2) / w);
    const y2 = (gain * wave[i] * 0.5 + 0.5) * h;
    path.push([x + x2, y + y2]);
  }
  ctx.addPolygon(path, { stroke, strokeWidth });
};
