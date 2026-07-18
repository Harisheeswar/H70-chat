/**
 * Advanced Anime / Cel-Shading WebGL Filter — 6 distinct styles
 *
 * One shared GLSL pipeline (bilateral blur, Sobel edges, skin detection,
 * HSV quantization) with a `u_style` uniform that branches the final
 * composition into 6 visually distinct anime looks. Switching styles is a
 * uniform update (setStyle), not a WebGL context rebuild, so it's instant.
 *
 * Styles:
 *  0 — Classic Cel     : bold black ink outlines, 4/5-band flat shading
 *  1 — Soft Pastel      : shoujo-style — pale palette, soft brown outline, glow
 *  2 — Neon Cyberpunk   : high contrast, glowing cyan/magenta rim light outlines
 *  3 — Retro 90s        : warm/sepia tint, film grain, softer outlines
 *  4 — Painterly        : heavy blur, minimal outline, smooth pastel gradients
 *  5 — Manga Screentone : desaturated B&W, ink outlines, halftone dot shading
 */

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_style;
  varying vec2 v_texCoord;

  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec3 bilateralBlur(sampler2D tex, vec2 uv, vec2 texelSize, float sigmaS, float sigmaR) {
    vec3 centerColor = texture2D(tex, uv).rgb;
    vec3 result = vec3(0.0);
    float totalWeight = 0.0;
    for (int x = -4; x <= 4; x++) {
      for (int y = -4; y <= 4; y++) {
        vec2 offset = vec2(float(x), float(y)) * texelSize;
        vec3 sampleColor = texture2D(tex, uv + offset).rgb;
        float spatialW = exp(-(float(x*x + y*y)) / (2.0 * sigmaS * sigmaS));
        float colorDiff = length(sampleColor - centerColor);
        float rangeW = exp(-(colorDiff * colorDiff) / (2.0 * sigmaR * sigmaR));
        float weight = spatialW * rangeW;
        result += sampleColor * weight;
        totalWeight += weight;
      }
    }
    return result / totalWeight;
  }

  float sobelEdge(sampler2D tex, vec2 uv, vec2 texelSize) {
    float gx =
      -1.0 * texture2D(tex, uv + vec2(-texelSize.x, -texelSize.y)).r +
      -2.0 * texture2D(tex, uv + vec2(-texelSize.x,  0.0)).r +
      -1.0 * texture2D(tex, uv + vec2(-texelSize.x,  texelSize.y)).r +
       1.0 * texture2D(tex, uv + vec2( texelSize.x, -texelSize.y)).r +
       2.0 * texture2D(tex, uv + vec2( texelSize.x,  0.0)).r +
       1.0 * texture2D(tex, uv + vec2( texelSize.x,  texelSize.y)).r;
    float gy =
      -1.0 * texture2D(tex, uv + vec2(-texelSize.x, -texelSize.y)).r +
      -2.0 * texture2D(tex, uv + vec2( 0.0,         -texelSize.y)).r +
      -1.0 * texture2D(tex, uv + vec2( texelSize.x, -texelSize.y)).r +
       1.0 * texture2D(tex, uv + vec2(-texelSize.x,  texelSize.y)).r +
       2.0 * texture2D(tex, uv + vec2( 0.0,          texelSize.y)).r +
       1.0 * texture2D(tex, uv + vec2( texelSize.x,  texelSize.y)).r;
    return clamp(sqrt(gx*gx + gy*gy) * 3.5, 0.0, 1.0);
  }

  float quantize(float v, float steps) {
    return floor(v * steps) / steps;
  }

  bool isSkin(vec3 rgb) {
    vec3 hsv = rgb2hsv(rgb);
    return hsv.x > 0.02 && hsv.x < 0.13 && hsv.y > 0.15 && hsv.y < 0.75 && hsv.z > 0.25;
  }

  // Halftone / screentone dot pattern used by the manga style
  float screentone(vec2 fragCoord, float brightness, float dotSize) {
    vec2 cell = mod(fragCoord, dotSize) - dotSize * 0.5;
    float dist = length(cell);
    float radius = (1.0 - brightness) * (dotSize * 0.5);
    return 1.0 - smoothstep(radius - 1.0, radius + 1.0, dist);
  }

  void main() {
    vec2 texelSize = 1.0 / u_resolution;
    vec2 uv = v_texCoord;
    int style = int(u_style + 0.5);

    // --- Shared prep: smoothing + edges (every style needs some of this) ---
    float blurSigmaS = (style == 4) ? 5.0 : 3.0;
    vec3 smoothed = bilateralBlur(u_image, uv, texelSize, blurSigmaS, 0.15);
    float edge = sobelEdge(u_image, uv, texelSize * 1.5);
    vec3 hsv = rgb2hsv(smoothed);
    bool skin = isSkin(smoothed);

    vec3 finalColor;

    if (style == 1) {
      // ---------------- Soft Pastel / Shoujo ----------------
      if (skin) {
        hsv.x = mix(hsv.x, 0.06, 0.4);
        hsv.y = clamp(hsv.y * 0.5, 0.06, 0.4);
        hsv.z = clamp(hsv.z * 1.22, 0.0, 1.0);
        hsv.z = quantize(hsv.z, 3.0);
      } else {
        hsv.y = clamp(hsv.y * 0.85, 0.0, 1.0);
        hsv.z = clamp(hsv.z * 1.08, 0.0, 1.0);
        hsv.z = quantize(hsv.z, 4.0);
      }
      vec3 cel = hsv2rgb(hsv);
      float outline = smoothstep(0.28, 0.55, edge);
      vec3 ink = vec3(0.42, 0.30, 0.30); // soft warm brown, not black
      finalColor = mix(cel, ink, outline * 0.6);
      // gentle glow: brighten everything slightly, lift shadows
      finalColor = clamp(finalColor * 1.05 + 0.03, 0.0, 1.0);

    } else if (style == 2) {
      // ---------------- Neon Cyberpunk ----------------
      hsv.y = clamp(hsv.y * 1.5, 0.0, 1.0);
      hsv.z = quantize(hsv.z, 5.0);
      vec3 cel = hsv2rgb(hsv);
      // darken the base for contrast against neon lines
      cel *= 0.75;
      float outline = smoothstep(0.12, 0.35, edge);
      // Neon rim color cycles between cyan and magenta across the frame
      vec3 neon = mix(vec3(0.1, 0.9, 1.0), vec3(1.0, 0.15, 0.85), sin(uv.x * 6.0 + u_time * 0.5) * 0.5 + 0.5);
      finalColor = mix(cel, neon, outline);
      // extra glow bloom near edges
      finalColor += neon * outline * 0.35;
      finalColor = clamp(finalColor, 0.0, 1.0);

    } else if (style == 3) {
      // ---------------- Retro 90s VHS Anime ----------------
      // slight chromatic aberration
      float caShift = texelSize.x * 1.5;
      float rCh = texture2D(u_image, uv + vec2(caShift, 0.0)).r;
      float bCh = texture2D(u_image, uv - vec2(caShift, 0.0)).b;
      vec3 ca = vec3(rCh, smoothed.g, bCh);
      vec3 hsv2 = rgb2hsv(ca);
      hsv2.y = clamp(hsv2.y * 0.9, 0.0, 1.0);
      hsv2.z = quantize(hsv2.z, 5.0);
      vec3 cel = hsv2rgb(hsv2);
      // warm sepia tint
      cel = mix(cel, cel * vec3(1.08, 0.98, 0.82), 0.35);
      float outline = smoothstep(0.22, 0.5, edge);
      vec3 ink = vec3(0.15, 0.1, 0.08);
      finalColor = mix(cel, ink, outline * 0.75);
      // film grain
      float grain = (rand(uv * u_resolution + u_time) - 0.5) * 0.06;
      finalColor += grain;
      // vignette
      float vig = smoothstep(0.9, 0.35, length(uv - 0.5));
      finalColor *= mix(0.7, 1.0, vig);
      finalColor = clamp(finalColor, 0.0, 1.0);

    } else if (style == 4) {
      // ---------------- Painterly Watercolor ----------------
      hsv.y = clamp(hsv.y * 0.8, 0.0, 1.0);
      hsv.z = quantize(hsv.z, 8.0); // many bands = smooth painted gradients, not flat cel
      vec3 cel = hsv2rgb(hsv);
      // very light, soft edge — more like a pencil sketch than ink
      float outline = smoothstep(0.35, 0.65, edge);
      vec3 ink = vec3(0.25, 0.22, 0.28);
      finalColor = mix(cel, ink, outline * 0.25);
      // soft overall brightness lift + slight desaturation for a wash look
      vec3 fh = rgb2hsv(finalColor);
      fh.y = clamp(fh.y * 0.92, 0.0, 1.0);
      fh.z = clamp(fh.z * 1.05 + 0.02, 0.0, 1.0);
      finalColor = hsv2rgb(fh);

    } else if (style == 5) {
      // ---------------- Manga Screentone (B&W) ----------------
      float gray = dot(smoothed, vec3(0.299, 0.587, 0.114));
      gray = clamp(gray * 1.15, 0.0, 1.0);
      float toned = mix(gray, screentone(gl_FragCoord.xy, gray, 5.0), 0.55);
      float outline = smoothstep(0.2, 0.45, edge);
      float base = mix(1.0, 0.08, outline); // white paper, black ink
      float mixed = min(toned, base);
      finalColor = vec3(mixed);

    } else {
      // ---------------- Style 0: Classic Cel (default) ----------------
      if (skin) {
        hsv.x = mix(hsv.x, 0.065, 0.35);
        hsv.y = clamp(hsv.y * 0.7, 0.1, 0.55);
        hsv.z = clamp(hsv.z * 1.15, 0.0, 1.0);
        hsv.z = quantize(hsv.z, 4.0);
      } else {
        hsv.y = clamp(hsv.y * 1.3, 0.0, 1.0);
        hsv.z = quantize(hsv.z, 5.0);
      }
      vec3 cel = hsv2rgb(hsv);
      float outline = smoothstep(0.18, 0.45, edge);
      vec3 ink = vec3(0.04, 0.04, 0.06);
      finalColor = mix(cel, ink, outline);
      vec3 fh = rgb2hsv(finalColor);
      fh.y = clamp(fh.y * 1.15, 0.0, 1.0);
      fh.z = clamp((fh.z - 0.5) * 1.08 + 0.5, 0.0, 1.0);
      finalColor = hsv2rgb(fh);
    }

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export const ANIME_STYLES = [
  { id: 0, key: 'anime_classic', name: 'Classic Cel', emoji: '🎨' },
  { id: 1, key: 'anime_soft', name: 'Soft Pastel', emoji: '🌸' },
  { id: 2, key: 'anime_neon', name: 'Neon Cyber', emoji: '🌃' },
  { id: 3, key: 'anime_retro', name: 'Retro 90s', emoji: '📼' },
  { id: 4, key: 'anime_paint', name: 'Painterly', emoji: '🖌️' },
  { id: 5, key: 'anime_manga', name: 'Manga B&W', emoji: '⚫' },
];

export function animeStyleIdFromKey(key) {
  const found = ANIME_STYLES.find(s => s.key === key);
  return found ? found.id : 0;
}

export class AnimeFilter {
  constructor(video, styleId = 0) {
    this.video = video;
    this.gl = null;
    this.program = null;
    this.texture = null;
    this.canvas = null;
    this.animFrameId = null;
    this.styleId = styleId;
    this._init();
  }

  _init() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:8;';

    const gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true });
    if (!gl) { console.error('WebGL not supported'); return; }
    this.gl = gl;

    const vs = this._compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = this._compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(prog));
      return;
    }
    this.program = prog;
    gl.useProgram(prog);

    const positions = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
    const texCoords = new Float32Array([0,1, 1,1, 0,0, 1,0]);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuf);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    const texLoc = gl.getAttribLocation(prog, 'a_texCoord');
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.uResolution = gl.getUniformLocation(prog, 'u_resolution');
    this.uTime = gl.getUniformLocation(prog, 'u_time');
    this.uStyle = gl.getUniformLocation(prog, 'u_style');
    gl.uniform1i(gl.getUniformLocation(prog, 'u_image'), 0);
    gl.uniform1f(this.uStyle, this.styleId);

    this._render();
  }

  _compile(type, src) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  // Switch styles instantly — just a uniform update, no context rebuild.
  setStyle(styleId) {
    this.styleId = styleId;
    if (this.gl && this.uStyle) {
      this.gl.uniform1f(this.uStyle, styleId);
    }
  }

  _render() {
    const gl = this.gl;
    const video = this.video;
    if (!gl || !video || video.readyState < 2) {
      this.animFrameId = requestAnimationFrame(() => this._render());
      return;
    }

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      gl.viewport(0, 0, w, h);
    }

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    gl.uniform2f(this.uResolution, w, h);
    gl.uniform1f(this.uTime, performance.now() / 1000);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    this.animFrameId = requestAnimationFrame(() => this._render());
  }

  getCanvas() { return this.canvas; }

  destroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.gl && this.texture) this.gl.deleteTexture(this.texture);
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.gl = null;
    this.canvas = null;
  }
}
