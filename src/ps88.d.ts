/**
 * PS88 API object.
 *
 * @example Generate a sine wave at 440 Hz.
 * ```js
 * // Elapsed time in seconds
 * let time = 0;
 *
 * // Register the audio callback function
 * ps88.audio((ctx) => {
 *   // Length of the output waveform
 *   const length = ctx.audio[0]?.length ?? 0;
 *
 *   for (let i = 0; i < length; i++) {
 *     // Generate a 440 Hz sine wave
 *     let wave = Math.sin(time * 440 * 2 * Math.PI);
 *
 *     // Output the same waveform to every channel
 *     for (let ch of ctx.audio) {
 *       ch[i] = wave;
 *     }
 *     time += 1 / ctx.sampleRate;
 *   }
 * });
 * ```
 */
export declare const ps88: PS88;

declare global {
  const ps88: PS88;
}

/**
 * PS88 API object.
 */
export declare interface PS88 {
  /**
   * Register an audio-related callback function.
   * The callback primarily generates the audio waveform that is sent to the speakers.
   * It can also receive microphone and MIDI input.
   *
   * @example Generate a sine wave at 440 Hz.
   * ```ts
   * // Elapsed time in seconds
   * let time = 0;
   *
   * // Register the audio callback function
   * ps88.audio((ctx) => {
   *   // Length of the output waveform
   *   const length = ctx.audio[0]?.length ?? 0;
   *
   *   for (let i = 0; i < length; i++) {
   *     // Generate a 440 Hz sine wave
   *     let wave = Math.sin(time * 440 * 2 * Math.PI);
   *
   *     // Output the same waveform to every channel
   *     for (let ch of ctx.audio) {
   *       ch[i] = wave;
   *     }
   *     time += 1 / ctx.sampleRate;
   *   }
   * });
   * ```
   */
  audio(func: AudioFunc): void;

  /**
   * Register a GUI-related callback function.
   * The callback uses the provided context to describe shapes that will be rendered on the screen.
   *
   * @example Draw a rectangle that follows the mouse cursor.
   * ```ts
   * ps88.gui((ctx) => {
   *   const path = [
   *     [ctx.mouse.x - 50, ctx.mouse.y - 50],
   *     [ctx.mouse.x + 50, ctx.mouse.y - 50],
   *     [ctx.mouse.x + 50, ctx.mouse.y + 50],
   *     [ctx.mouse.x - 50, ctx.mouse.y + 50],
   *   ];
   *   ctx.addPolygon(path, { fill: 0x0000ffff });
   * });
   * ```
   */
  gui(func: GuiFunc): void;

  /**
   * Save data that persists after you close the program.
   * The data that can be stored is `Uint8Array`, `string`, `null`, or `undefined`.
   *
   * @example Save and load a Uint8Array.
   * ```ts
   * ps88.save(new Uint8Array([1, 2, 3, 4]));
   * const data = ps88.load();
   * console.log(data.toString()); // "1,2,3,4"
   * ```
   */
  save(data: SaveData): void;

  /**
   * Load data that was saved with `ps88.save()`.
   *
   * @returns The data that was saved, or `null` or `undefined` if no data was saved.
   */
  load(): SaveData;
}

export declare type AudioFunc = (ctx: AudioContext) => void;

export declare interface AudioContext {
  /**
   * Audio waveform for each channel.
   *
   * You can edit these Float32Arrays, and the arrays will be output to the speakers as they are.
   * The array is initialized with the input waveform from the microphone.
   */
  audio: Float32Array[];

  /**
   * MIDI events.
   *
   * These events are typically used to generate the audio waveform.
   * You can also edit this array, and the changes will be propagated to subsequent audio processing.
   */
  midi: NoteEvent[];

  /**
   * Sample rate of the audio.
   */
  sampleRate: number;

  /**
   * DAW playback position in sample units.
   *
   * When not playing, this value is always 0.
   */
  posSamples: number;

  /**
   * BPM set in the DAW.
   *
   * This value may be 0.
   */
  bpm: number;
}

export declare type NoteEvent = NoteOn | NoteOff;

export declare type NoteOn = {
  type: "NoteOn";
  timing: number;
  channel: number;
  note: number;
  velocity: number;
};

export declare type NoteOff = {
  type: "NoteOff";
  timing: number;
  channel: number;
  note: number;
  velocity: number;
};

export declare type GuiFunc = (ctx: GuiContext) => void;

export declare interface GuiContext {
  /**
   * Width of the drawing area.
   */
  w: number;

  /**
   * Height of the drawing area.
   */
  h: number;

  /**
   * Mouse state.
   */
  mouse: {
    /**
     * X coordinate of the mouse cursor.
     */
    x: number;

    /**
     * Y coordinate of the mouse cursor.
     */
    y: number;

    /**
     * Whether the left mouse button is pressed.
     */
    pressedL: boolean;

    /**
     * Whether the right mouse button is pressed.
     */
    pressedR: boolean;
  };

  /**
   * Add a polygon to the drawing area.
   */
  addPolygon: (
    path: [number, number][],
    options?: {
      fill?: number;
      stroke?: number;
      strokeWidth?: number;
      strokeClosed?: boolean;
    },
  ) => void;

  /**
   * Add text to the drawing area.
   */
  addText: (
    text: string,
    x: number,
    y: number,
    options?: {
      size?: number;
      color?: number;
    },
  ) => void;
}

export declare type SaveData = Uint8Array | string | null | undefined;
