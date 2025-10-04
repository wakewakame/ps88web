"use strict";

const keyboard = new Map();
const record = new Float32Array(48000 * 5);
let rec = false;
let start = 0;
let end = record.length;
let pitch = 0.0;

ps88.audio((ctx) => {
  for (let event of ctx.midi) {
    if (event.type === "NoteOn") {
      keyboard.set(event.note, { time: start, ...event });
    }
    if (event.type === "NoteOff") {
      keyboard.delete(event.note);
    }
  }

  const length = ctx.audio[0]?.length ?? 0;
  if (rec) { record.copyWithin(0, length); }
  const recordOffset = Math.max(record.length - length, 0);
  for (let i = 0; i < length; i++) {
    let wave = 0;
    for (let key of keyboard.values()) {
      if (i < key.timing || rec) { continue; }
      wave += 1.0 * record[Math.min(Math.floor(key.time), record.length - 1, end)];
      key.time += 1 * Math.pow(2, (key.note - 69 + pitch) / 12);
    }
    if (rec) { record[recordOffset + i] = 0; }
    for (let ch of ctx.audio) {
      if (rec) { record[recordOffset + i] += ch[i] / ctx.audio.length; }
      ch[i] = wave;
    }
  }
});

// ================================
// math utility
// ================================

/**
 * @description 2 次元ベクトル
 */
const vec2 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
    mul: (a, b) => [a[0] * b[0], a[1] * b[1]],
    div: (a, n) => [a[0] / n, a[1] / n],
    len: (a) => Math.hypot(a[0], a[1]),

    /**
     * @description ベクトル長が 1 になるよう正規化
     */
    unit: (a) => {
        const len = len(a);
        return (len > 1e-6) ? div(a, len) : [1, 0];
    },

    /**
     * @description ベクトルを回転
     */
    rot: (a, r) => {
        const [cos, sin] = [Math.cos(r), Math.sin(r)];
        return [a[0] * cos - a[1] * sin, a[0] * sin + a[1] * cos];
    },

    /**
     * @description ベクトルを 90 度単位で回転
     */
    rot90: (a, r) => {
        return [
            [a[0], a[1]],
            [-a[1], a[0]],
            [-a[0], -a[1]],
            [a[1], -a[0]],
        ][Math.floor(r) - Math.floor(r / 4) * 4];
    },

    get_rot: (a) => Math.atan2(a.y, a.x),

    /**
     * @description 直線と直線の交点を取得
     */
    intersection: (ap, av, bp, bv) => {
        //            ap + s*av = bp + t*bv
        // <=>      s*av - t*bv = bp - ap
        // <=> [av bv] [s -t]^T = bp - ap
        // <=>         [s -t]^T = [av bv]^-1 (bp - ap)
        const bpap = sub(bp, ap);
        const det = av[0] * bv[1] - av[1] * bv[0];
        const s = (bv[1] * bpap[0] - bv[0] * bpap[1]) / det;
        return s;
    },

    /**
     * @description 点 p に最も近い線分上の点を取得
     */
    nearest: (lp, lv, p) => {
        const s = vec2.intersection(lp, lv, p, vec2.rot90(lv, 1));
        return Number.isNaN(s) ? 0 : Math.max(0, Math.min(1, s));
    },
};

// ================================
// shape utility
// ================================

const shapes = {
    /**
     * @description 角の丸い四角形を生成
     * @param {number} w 幅
     * @param {number} h 高さ
     * @param {number} r1 角の半径
     * @param {number} r2 角の鋭さ ( r2=(2**0.5-1)*4/3 で円弧になる )
     * @param {number} div 角の分割数 ( div >= 0 )
     */
    smooth_rect: (cx, cy, w, h, r1, r2, div) => {
        console.assert(div >= 0, "div must be non-negative");
        const w_half = w / 2;
        const h_half = h / 2;
        const r = r1 * (1 - r2);
        const corner = shapes.bezier([0, r1], [0, r], [r, 0], [r1, 0], div);
        return [
            ...corner.map(p => vec2.add(vec2.rot90(p, 0), [cx - w_half, cy - h_half])),
            ...corner.map(p => vec2.add(vec2.rot90(p, 1), [cx + w_half, cy - h_half])),
            ...corner.map(p => vec2.add(vec2.rot90(p, 2), [cx + w_half, cy + h_half])),
            ...corner.map(p => vec2.add(vec2.rot90(p, 3), [cx - w_half, cy + h_half])),
        ];
    },

    /**
     * @description 正円を生成
     * @param {number} r 半径
     * @param {number} div 頂点数 ( div >= 0 )
     */
    circle: (r, div) => {
        console.assert(div >= 0, "div must be non-negative");
        return [...Array(div)].map((_, i) => (
            [r * Math.cos(2 * Math.PI * i / div), r * Math.sin(2 * Math.PI * i / div)]
        ));
    },

    /**
     * @description ベジェ曲線を生成
     * @param {math.vec2} p1 始点
     * @param {math.vec2} p2 始点側の制御点
     * @param {math.vec2} p3 終点側の制御点
     * @param {math.vec2} p4 終点
     * @param {number} div 分割数 ( div >= 0 )
     * @returns {math.vec2}
     */
    bezier: (p1, p2, p3, p4, div) => {
        console.assert(div >= 0, "div must be non-negative");
        return [...Array(div + 2)].map((_, i) => {
            const t = i / (div + 1);
            const u = 1 - t;
            const uu = u * u;
            const uuu = uu * u;
            const tt = t * t;
            const ttt = tt * t;
            return [
                uuu * p1[0] + 3 * uu * t * p2[0] + 3 * u * tt * p3[0] + ttt * p4[0],
                uuu * p1[1] + 3 * uu * t * p2[1] + 3 * u * tt * p3[1] + ttt * p4[1],
            ];
        });
    },

    /**
     * @description 点 p が図形 shape の内側にあるかどうか判定
     */
    inside: (shape, p) => {
        let count = 0;
        for (let i = 0; i < shape.length; i++) {
            const [p1, p2] = [shape[i], shape[(i + 1) % shape.length]];
            const t = (p[1] - p1[1]) / (p2[1] - p1[1]);
            if (0 <= t && t < 1) {
                const x = p1[0] * (1 - t) + p2[0] * t;
                if (p[0] < x) {
                    count++;
                }
            }
        }
        return count % 2 === 1;
    },
};

/* ==== 図形描画関数 ==== */
const rect = (ctx, x, y, w, h, fill, stroke, strokeWidth) => {
    const path = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    ctx.addPolygon(path, { fill, stroke, strokeWidth, strokeClosed: true });
};

const circle = (ctx, x, y, r, fill, stroke, strokeWidth) => {
    const div = 24;
    const path = [...Array(div)].map((_, i) => {
        const t = i * 2 * Math.PI / div;
        return [x + r * Math.cos(t), y + r * Math.sin(t)];
    });
    ctx.addPolygon(path, { fill, stroke, strokeWidth, strokeClosed: true });
};

const graph = (ctx, wave, gain, x, y, w, h, stroke, strokeWidth) => {
    const path = [];
    for (let x2 = 0; x2 <= w; x2 += 1/4) {
        const i = Math.floor(((wave.length - 1) * x2) / w);
        const y2 = (gain * wave[i] * 0.5 + 0.5) * h;
        path.push([x + x2, y + y2]);
    }
    ctx.addPolygon(path, { stroke, strokeWidth });
};

/* ==== UI コンポーネント ==== */
const drag = (left, top, right, bottom, ix, iy) => {
    let [x, y] = [ix ?? (left + right) * 0.5, iy ?? (top + bottom) * 0.5];
    let pressed = null;
    let r = 10;
    return {
        get: () => ([x, y]),
        draw: (ctx) => {
            const hit = ((x - ctx.mouse.x) ** 2 + (y - ctx.mouse.y) ** 2) ** 0.5 < r;
            pressed = ctx.mouse.pressedL ? pressed ?? {x: x - ctx.mouse.x, y: y - ctx.mouse.y, hit} : null;
            const drag = (pressed?.hit ?? false);
            const rTarget = drag ? 9 : hit ? 10 : 8;
            r += (rTarget - r) * 0.4;
            if (drag) {
                x = Math.max(left, Math.min(right, ctx.mouse.x + pressed.x));
                y = Math.max(top, Math.min(bottom, ctx.mouse.y + pressed.y));
            }
            circle(ctx, x, y, r, 0xffffffff);
            return [x, y];
        },
    };
};

const drag2 = (path, left, top, right, bottom, ix, iy) => {
    let [x, y] = [ix ?? (left + right) * 0.5, iy ?? (top + bottom) * 0.5];
    let pressed = null;
    let scale = 1.0;
    return {
        get: () => ([x, y]),
        draw: (ctx) => {
            const p = path.map(p => vec2.add(vec2.mul(p, [scale, scale]), [x, y]));
            const hit = shapes.inside(p, [ctx.mouse.x, ctx.mouse.y]);
            pressed = ctx.mouse.pressedL ? pressed ?? {x: x - ctx.mouse.x, y: y - ctx.mouse.y, hit} : null;
            const drag = (pressed?.hit ?? false);
            const scaleTarget = drag ? 0.9 : hit ? 1.1 : 1;
            scale += (scaleTarget - scale) * 0.4;
            if (drag) {
                x = Math.max(left, Math.min(right, ctx.mouse.x + pressed.x));
                y = Math.max(top, Math.min(bottom, ctx.mouse.y + pressed.y));
            }
            ctx.addPolygon(p, { fill: 0xffffffff, strokeClosed: true });
            return [x, y];
        },
    };
};

const button = (x, y) => {
    let prePressed;
    //let rec = false;
    let hitanim = 0;
    let recanim = 0;
    return {
        get: () => ({x, y}),
        draw: (ctx) => {
            const click = ctx.mouse.pressedL && !prePressed;
            prePressed = ctx.mouse.pressedL;
            const w = (64 * (1 - recanim) + 48 * recanim) * (1 + 0.11 * hitanim);
            const r2 = (2**0.5-1)*4/3 * (1 - recanim) + 1 * recanim;
            const path = shapes.smooth_rect(x, y, w, w, w*0.5, r2, 6);
            const hit = shapes.inside(path, [ctx.mouse.x, ctx.mouse.y]);
            rec = (hit && click) ? !rec : rec;
            hitanim += ((hit ? 1 : 0) - hitanim) * 0.4;
            recanim += ((rec ? 1 : 0) - recanim) * 0.25;
            ctx.addPolygon(path, { fill: 0xff0000ff, stroke: 0xffffffff, strokeWidth: 2, strokeClosed: true });
            return [x, y];
        },
    };
};

const t1 = drag2([[0, 0], [-9, 9], [-9, 24], [9, 24], [9, 9]], 50, 240, 590, 240, 50, 240);
const t2 = drag2([[0, 0], [-9, 9], [-9, 24], [9, 24], [9, 9]], 50, 240, 590, 240, 590, 240);
const b = button(320, 360);
const p1 = drag(100, 440, 540, 440);
ps88.gui((ctx) => {
    rect(ctx, 0, 0, ctx.w, ctx.h, 0x000000ff);
    graph(ctx, record, 3, 50, 0, 540, 240, 0xffffffff, 1);
    rect(ctx, 0, 0, t1.get()[0], 480, 0x000000bb);
    rect(ctx, t2.get()[0], 0, 640-t2.get()[0], 480, 0x000000bb);
    t1.draw(ctx);
    t2.draw(ctx);
    start = Math.floor((t1.get()[0] - 50) * record.length / 540);
    end = Math.floor((t2.get()[0] - 50) * record.length / 540);
    b.draw(ctx);
    p1.draw(ctx);
    pitch = (p1.get()[0] - 100 - 220) * 12 / 440;
    rect(ctx, 100, 439, 440, 2, 0xffffffff);
    ctx.addText("pitch", 40, 445, {size: 16, color: 0xffffffff});
});
