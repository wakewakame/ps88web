console.log("Hello, World!");

let wave = [];
let count = 0;

const audio = (ctx) => {
  wave = wave.concat([...ctx.audio[0]]).slice(-1024);
  for (ch = 0; ch < ctx.audio.length; ch++) {
    for (i = 0; i < ctx.audio[ch].length; i++) {
      if (ch === 0) {
        count += 1;
        ctx.audio[ch][i] = Math.sin(440 * 2 * Math.PI * count / ctx.sampleRate) * 0.1;
      } else {
        ctx.audio[ch][i] = ctx.audio[0][i];
      }
    }
  }
};

const gui = (ctx) => {
  const w = [...Array(ctx.w)].map((_, x) => {
    const wi = Math.floor(wave.length * x / ctx.w);
    const y = wave[wi] * 500.0 + ctx.h * 0.5;
    return [x, y];
  });
  ctx.addShape(w, {stroke: 0xFFFFFF});

  ctx.addText("Hello, World!", ctx.mouse.x, ctx.mouse.y, {
    size: 48,
    color: ctx.mouse.pressedL ? 0xFF0000 : 0xFFFFFF,
  });
};

setProcessor(audio, gui);
