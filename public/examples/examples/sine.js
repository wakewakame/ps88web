// Elapsed time in seconds
let time = 0;

// Register the audio callback function
ps88.audio((ctx) => {
  // Length of the output waveform
  const length = ctx.audio[0]?.length ?? 0;

  for (let i = 0; i < length; i++) {
    // Generate a 440 Hz sine wave
    let wave = 0.1 * Math.sin(time * 440 * 2 * Math.PI);

    // Output the same waveform to every channel
    for (let ch of ctx.audio) {
      ch[i] = wave;
    }
    time += 1 / ctx.sampleRate;
  }
});
