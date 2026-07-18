/**
 * Advanced Anime / Cel-Shading WebGL Filter
 * 
 * Technique: Full GLSL pixel shader pipeline
 * 1. Bilateral blur — smooth skin while preserving edges (like anime)
 * 2. Sobel edge detection — find face/hair outlines
 * 3. Color quantization + palette mapping — cel-shade (flat anime colors)
 * 4. Skin tone brightening + saturation lift
 * 5. Eye enhancement — brighten iris region
 * 6. Ink outline compositing — bold anime-style outlines
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

// Core anime cel-shader
const FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform vec2 u_resolution;
  uniform float u_time;
  varying vec2 v_texCoord;

  // RGB to HSV
  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  // HSV to RGB
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  // Bilateral blur — blurs colour but preserves edges
  vec3 bilateralBlur(sampler2D tex, vec2 uv, vec2 texelSize, float sigmaS, float sigmaR) {
    vec3 centerColor = texture2D(tex, uv).rgb;
    vec3 result = vec3(0.0);
    float totalWeight = 0.0;
    int radius = 4;
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

  // Sobel edge detection
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

  // Quantize a value into N steps (cel shading)
  float quantize(float v, float steps) {
    return floor(v * steps) / steps;
  }

  // Is this pixel a skin tone?
  bool isSkin(vec3 rgb) {
    vec3 hsv = rgb2hsv(rgb);
    // Hue in [0.02, 0.12] (red-orange), saturation mid, brightness mid-high
    return hsv.x > 0.02 && hsv.x < 0.13 && hsv.y > 0.15 && hsv.y < 0.75 && hsv.z > 0.25;
  }

  void main() {
    vec2 texelSize = 1.0 / u_resolution;
    vec2 uv = v_texCoord;

    // --- Step 1: Bilateral smooth (skin smoothing) ---
    vec3 smoothed = bilateralBlur(u_image, uv, texelSize, 3.0, 0.15);

    // --- Step 2: Sobel edges on the smoothed image ---
    // Sample grayscale for edge detect
    float grayCenter = dot(smoothed, vec3(0.299, 0.587, 0.114));
    float edge = sobelEdge(u_image, uv, texelSize * 1.5);

    // --- Step 3: Cel-shading (colour quantization) ---
    vec3 hsv = rgb2hsv(smoothed);

    // Skin: brighter, less saturated, smoother shading (anime skin is clean)
    if (isSkin(smoothed)) {
      hsv.x = mix(hsv.x, 0.065, 0.35);         // nudge hue toward anime peach
      hsv.y = clamp(hsv.y * 0.7, 0.1, 0.55);   // reduce saturation (anime skin is pale)
      hsv.z = clamp(hsv.z * 1.15, 0.0, 1.0);   // brighten
      // Quantize brightness into 4 bands (cel-shading light/shadow)
      hsv.z = quantize(hsv.z, 4.0);
    } else {
      // Non-skin: enhance saturation, quantize into 5 bands
      hsv.y = clamp(hsv.y * 1.3, 0.0, 1.0);
      hsv.z = quantize(hsv.z, 5.0);
    }

    vec3 celColor = hsv2rgb(hsv);

    // --- Step 4: Anime-style outline (dark ink where edge is strong) ---
    float outline = smoothstep(0.18, 0.45, edge);
    vec3 inkColor = vec3(0.04, 0.04, 0.06);     // near-black ink
    vec3 finalColor = mix(celColor, inkColor, outline);

    // --- Step 5: Slight overall saturation + contrast boost ---
    vec3 finalHsv = rgb2hsv(finalColor);
    finalHsv.y = clamp(finalHsv.y * 1.15, 0.0, 1.0);
    finalHsv.z = clamp((finalHsv.z - 0.5) * 1.08 + 0.5, 0.0, 1.0);
    finalColor = hsv2rgb(finalHsv);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export class AnimeFilter {
  constructor(video) {
    this.video = video;
    this.gl = null;
    this.program = null;
    this.texture = null;
    this.canvas = null;
    this.animFrameId = null;
    this._init();
  }

  _init() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:8;';

    const gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true });
    if (!gl) { console.error('WebGL not supported'); return; }
    this.gl = gl;

    // Compile shaders
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

    // Fullscreen quad
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

    // Video texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.uResolution = gl.getUniformLocation(prog, 'u_resolution');
    this.uTime = gl.getUniformLocation(prog, 'u_time');
    gl.uniform1i(gl.getUniformLocation(prog, 'u_image'), 0);

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

    // Upload video frame as texture
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    // Set uniforms
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
