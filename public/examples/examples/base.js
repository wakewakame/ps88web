let note = {
  current: { note: 0, velo: 0 },
  target: { note: 0, velo: 0 },
  omega: 0,
  v: 0,
};
let buffer = [];
ps88.audio((ctx) => {
  try {
    // MIDI の記録
    if (ctx.midi.length > 0) {
      for (let msg of ctx.midi) {
        if (msg.type === "NoteOn") {
          note.target.note = msg.note;
          note.target.velo = msg.velocity;
          if (note.current.velo < 0.01) {
            note.current.note = note.target.note;
          }
        }
        if (msg.type === "NoteOff") {
          if (note.target.note === msg.note) {
            note.target.velo = 0;
          }
        }
      }
    }

    // 波形の生成
    for (let i = 0; i < ctx.audio[0]?.length ?? 0; i++) {
      // 現在の音高と音量を目標に近づける
      note.current.note += (note.target.note - note.current.note) * 0.001;
      note.current.velo += (note.target.velo - note.current.velo) * 0.01;
      // 矩形波
      note.v +=
        note.omega % 1 < 0.1 ? (1.0 - note.v) * 0.2 : (0.0 - note.v) * 0.05;
      let v = note.v * note.current.velo * 0.8;
      for (let ch of ctx.audio) {
        ch[i] += v;
      }
      let freq = 440 * Math.pow(2, (note.current.note - 69) / 12);
      note.omega += freq / ctx.sampleRate;
    }

    // 描画用にバッファリング
    if (ctx.audio.length > 0) {
      buffer = buffer.concat([...ctx.audio[0]]).slice(-1024);
    }
  } catch (e) {
    console.error(e);
  }
});

ps88.gui((ctx) => {
  try {
    // 波形の描画
    let wave = [];
    for (let x = 0; x <= ctx.w; x++) {
      const i = ((buffer.length - 2) * x) / ctx.w;
      const i1 = Math.max(Math.floor(i), 0);
      const i2 = Math.min(i1 + 1, buffer.length - 1);
      const p = i - i1;
      const v = buffer[i1] * (1 - p) + buffer[i2] * p;
      const y = ctx.h * (0.75 - 0.5 * v);
      wave.push([x, y]);
    }
    ctx.addPolygon(wave, { stroke: 0xffffffff, strokeWidth: 1 });
  } catch (e) {
    console.error(e);
  }
});
