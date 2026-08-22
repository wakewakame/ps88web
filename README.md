# PS88 web

[English](README.md) | [日本語](README.ja.md)

A synthesizer that lets you describe waveforms in JavaScript.
It runs in both the browser and as a VST3 plugin.

<p align="center">
  <img src="./public/logo.svg" width="160">
</p>

- Try it in the browser: https://wakewakame.github.io/ps88web
- VST3 version: https://github.com/wakewakame/ps88

# Usage

To play a 440 Hz sine wave, write code like the example below.

```js
// Elapsed time in seconds
let time = 0;

// Register the audio callback function
ps88.audio((ctx) => {
  // Length of the output waveform
  const length = ctx.audio[0]?.length ?? 0;

  for (let i = 0; i < length; i++) {
    // Generate a 440 Hz sine wave
    let wave = Math.sin(time * 440 * 2 * Math.PI);

    // Output the same waveform to every channel
    for (let ch of ctx.audio) {
      ch[i] = wave;
    }
    time += 1 / ctx.sampleRate;
  }
});
```

You can also use microphone and MIDI input, and even render GUIs.

- [API docs](https://wakewakame.github.io/ps88web/docs/variables/ps88.html)
- [examples](https://wakewakame.github.io/ps88web/examples/index.html)

# Let an AI write the code

Open the chat panel from the ✨ button in the toolbar and ask for what you want,
for example "make it a sawtooth synth". The code you get back is applied to the
editor right away, so the sound changes immediately.

The AI runs on your own account, so you need to bring an API key. Any of these
will work:

- ChatGPT (OpenAI)
- Gemini (Google)
- Claude (Anthropic)
- OpenRouter
- Anything with an OpenAI-compatible API (Ollama, LM Studio, and so on)

Note that API access is billed separately from subscription plans such as
ChatGPT Plus. PS88 web has no server of its own, so your key goes straight from
the browser to the provider you picked — it never reaches PS88 web.

# Run locally

```sh
git clone https://github.com/wakewakame/ps88web.git
cd ps88web
npm install
npm run dev
```
