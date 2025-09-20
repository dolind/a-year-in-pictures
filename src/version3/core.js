// dither_gpu_full_fixed.js
// Fully-GPU dithering pipeline: MinMax → Mega (normalize+dither+LoG+score+fuse) → Diidify
// If diid8x8 is a 2D JS array sized 8x8 with integer thresholds 0..K-1:
import { diid8x8 } from "../common/kernels.js";

const diidFlat = new Uint32Array(64);
for (let col = 0; col < 8; col++) {
  for (let row = 0; row < 8; row++) {
    diidFlat[col * 8 + row] = diid8x8[col][row]; // column-major flatten
  }
}


// ------------------------------ Helpers ------------------------------
const BYTES = { f32: 4, u32: 4 };
const align = (n, a = 256) => ((n + (a - 1)) & ~(a - 1));

const makeBuffer = (device, size, usage) =>
  device.createBuffer({ size: align(size, 256), usage });

const uploadArray = (device, queue, arr, usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) => {
  const buf = device.createBuffer({
    size: align(arr.byteLength, 256),
    usage
  });
  queue.writeBuffer(buf, 0, arr.buffer, arr.byteOffset ?? 0, arr.byteLength);
  return buf;
};


const makeUniformBuffer = (device, bytes) =>
  device.createBuffer({ size: align(bytes, 256), usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

// ------------------------------ Defaults ------------------------------
const DEFAULT_EXPOSURES_ALL = [0, 0.1, -0.1, -0.05, 0.05, 0.15, -0.15, 0.03, -0.03];
const DEFAULT_DIFFS_ALL     = [0.1, 0.3, 0.2, 0.05];

const BAYER_8x8 = new Float32Array([
   0,48,12,60, 3,51,15,63,
  32,16,44,28,35,19,47,31,
   8,56, 4,52,11,59, 7,55,
  40,24,36,20,43,27,39,23,
   2,50,14,62, 1,49,13,61,
  34,18,46,30,33,17,45,29,
  10,58, 6,54, 9,57, 5,53,
  42,26,38,22,41,25,37,21
].map(v => (v + 0.5) * (255/64))); // scale to 0..255

// Example 9x9 LoG kernel; replace with your exact LoG if you like
const LOG_9x9 = new Float32Array(9*9).map((_, i) => {
  const r = Math.floor(i / 9) - 4, c = (i % 9) - 4;
  const d2 = r*r + c*c;
  return Math.exp(-d2/6) * (1 - d2/6);
});

// ------------------------------ WGSL: MinMax Pass 1 ------------------------------
const WGSL_MINMAX_PASS1 = /* wgsl */`
struct Common {
  W:u32,
  H:u32,
  N:u32,
  pad:u32
};

@group(0) @binding(0) var<uniform> P0: Common;
@group(0) @binding(1) var<storage, read> srcRGBA: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> outMinMax: array<vec2<f32>>;

var<workgroup> smin: array<f32, 256>;
var<workgroup> smax: array<f32, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(num_workgroups) numGroups: vec3<u32>
) {
  let N = P0.N;
  let tid = lid.x;
  let group = wid.x;
  let stride = 256u * numGroups.x;

  var localMin = 1e30;
  var localMax = -1e30;

  var i = gid.x;
  loop {
    if (i >= N) { break; }
    let px = srcRGBA[i].rgb;
    let gray = dot(px, vec3<f32>(0.299, 0.587, 0.114)) * 255.0;
    localMin = min(localMin, gray);
    localMax = max(localMax, gray);
    i += stride;
  }

  smin[tid] = localMin;
  smax[tid] = localMax;
  workgroupBarrier();

  var step = 128u;
  loop {
    if (step == 0u) { break; }
    if (tid < step) {
      smin[tid] = min(smin[tid], smin[tid + step]);
      smax[tid] = max(smax[tid], smax[tid + step]);
    }
    step = step / 2u;
    workgroupBarrier();
  }

  if (tid == 0u) {
    outMinMax[group] = vec2<f32>(smin[0], smax[0]);
  }
}
`;

// ------------------------------ WGSL: MinMax Pass 2 ------------------------------
// One workgroup is dispatched; each thread scans chunks and reduces into shared memory.
const WGSL_MINMAX_PASS2 = /* wgsl */`
@group(0) @binding(0) var<storage, read> inMinMax: array<vec2<f32>>;
@group(0) @binding(1) var<storage, read_write> outMinMax: array<vec2<f32>>;

var<workgroup> smin: array<f32, 256>;
var<workgroup> smax: array<f32, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
  let count = arrayLength(&inMinMax);
  let tid = lid.x;

  var mn = 1e30;
  var mx = -1e30;

  var i = tid;
  loop {
    if (i >= count) { break; }
    let v = inMinMax[i];
    mn = min(mn, v.x);
    mx = max(mx, v.y);
    i += 256u;
  }

  smin[tid] = mn;
  smax[tid] = mx;
  workgroupBarrier();

  var step = 128u;
  loop {
    if (step == 0u) { break; }
    if (tid < step) {
      smin[tid] = min(smin[tid], smin[tid + step]);
      smax[tid] = max(smax[tid], smax[tid + step]);
    }
    step = step / 2u;
    workgroupBarrier();
  }

  if (tid == 0u) {
    outMinMax[0] = vec2<f32>(smin[0], smax[0]);
  }
}
`;

// === WGSL_MEGA (drop-in replacement) ===
const WGSL_MEGA = /* wgsl */`
struct Params {
  W:u32, H:u32, N:u32,
  numExposures:u32,
  numDiffs:u32,
  bw:u32,
  inverted:u32,
  K:u32,            // NEW: number of quantization bins (e.g., 18)
};

@group(0) @binding(0) var<uniform> P0: Params;
@group(0) @binding(1) var<storage, read> srcRGBA: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> exposures: array<f32>;
@group(0) @binding(3) var<storage, read> diffs: array<f32>;
@group(0) @binding(4) var<storage, read> kernel: array<f32>;   // 9x9 LoG (row-major)
@group(0) @binding(5) var<storage, read> minmax: array<vec2<f32>>;
@group(0) @binding(6) var<storage, read_write> bestScore: array<f32>;
@group(0) @binding(7) var<storage, read_write> bestImg: array<f32>;

fn idx_of(x:u32, y:u32, W:u32, H:u32) -> u32 {
  return y * W + x; // row-major
}

// CPU-ish grayscale after exposure (blue channel baseline)
fn gray_exposed(px: vec4<f32>, exposure: f32) -> f32 {
  // CPU: base + base * exposure  == base * (1+exposure)
  let base = px.b * 255.0;
  return clamp(base * (1.0 + exposure), 0.0, 255.0);
}

// CPU-ish channel-mix (getChannelPixels)
fn gray_channel_mix(px: vec4<f32>, c:u32, diff: f32, exposure: f32) -> f32 {
  let mainDiff = 1.0 - 2.0 * diff;
  var v = 0.0;
  for (var j:u32=0u; j<3u; j++) {
    let ch = select(select(px.r, px.g, j==1u), px.b, j==2u) * 255.0;
    v += select(diff*ch, mainDiff*ch, j==c);
  }
  v = v * (1.0 + exposure);
  return clamp(v, 0.0, 255.0);
}

// LoG over a candidate **grayscale image** computed on-the-fly
fn lap9x9_at(x:u32, y:u32, W:u32, H:u32, mode:u32, par0:u32, par1:f32, exposure:f32) -> f32 {
  var acc = 0.0;
  for (var ky:u32=0u; ky<9u; ky++) {
    let yy_i = i32(y) + i32(ky) - 4;
    if (yy_i < 0 || yy_i >= i32(H)) { continue; }
    let yy = u32(yy_i);
    for (var kx:u32=0u; kx<9u; kx++) {
      let xx_i = i32(x) + i32(kx) - 4;
      if (xx_i < 0 || xx_i >= i32(W)) { continue; }
      let xx = u32(xx_i);
      let p = srcRGBA[idx_of(xx, yy, W, H)];
      let g = select(
        gray_exposed(p, exposure),                          // mode 0: grayscale exposure
        gray_channel_mix(p, par0, par1, 0.0),               // mode 1: channel mix (diff)
        mode == 1u
      );
      let w = kernel[ky*9u + kx];
      acc += w * g;
    }
  }
  return acc;
}

@compute @workgroup_size(16,16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x;
  let y = gid.y;
  if (x >= P0.W || y >= P0.H) { return; }
  let idx = idx_of(x, y, P0.W, P0.H);

  var bestS = -1.0;
  var bestV = 0.0;

  // Shared constants for scoring
  let sddev = 0.2;
  let med   = 128.0;

  // --- Grayscale exposure candidates (CPU-style: based on blue channel) ---
  for (var ei:u32=0u; ei<P0.numExposures; ei++) {
    let expv = exposures[ei];
    let val  = gray_exposed(srcRGBA[idx], expv);

    // LoG over candidate grayscale image (sampling neighbors)
    let lap = abs(lap9x9_at(x, y, P0.W, P0.H, 0u, 0u, 0.0, expv));

    // well-exposedness (Gaussian around 128)
    let z = (val - med) / 256.0;
    let expo = exp(-(z*z) / (2.0 * sddev * sddev));

    let score = lap * expo;
    if (score >= bestS) {
      bestS = score;
      bestV = val; // store grayscale, 0..255
    }
  }

  // --- Diff/channel candidates (mirror CPU getChannelPixels) ---
  for (var di:u32=0u; di<P0.numDiffs; di++) {
    let diff = diffs[di];
    for (var c:u32=0u; c<3u; c++) {
      let val = gray_channel_mix(srcRGBA[idx], c, diff, 0.0);
      let lap = abs(lap9x9_at(x, y, P0.W, P0.H, 1u, c, diff, 0.0));
      let z = (val - med) / 256.0;
      let expo = exp(-(z*z) / (2.0 * sddev * sddev));
      let score = lap * expo;
      if (score >= bestS) {
        bestS = score;
        bestV = val;
      }
    }
  }

  bestScore[idx] = bestS;
  bestImg[idx]   = bestV; // winner grayscale
}
`;


// === WGSL_DIIDIFY (drop-in replacement) ===
const WGSL_DIIDIFY = /* wgsl */`
// === WGSL_DIIDIFY with palette ===
struct Params {
  W:u32, H:u32, N:u32,
  numExposures:u32,
  numDiffs:u32,
  bw:u32,
  inverted:u32,
  K:u32,
};

@group(0) @binding(0) var<uniform> P0: Params;
@group(0) @binding(1) var<storage, read> bestImg: array<f32>;
@group(0) @binding(2) var<storage, read> minmax: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read> diid8: array<u32>;
@group(0) @binding(4) var<storage, read_write> outRGBA: array<u32>;

fn packRGBA(r:f32, g:f32, b:f32, a:f32) -> u32 {
  let ri = u32(clamp(r,0.0,255.0));
  let gi = u32(clamp(g,0.0,255.0));
  let bi = u32(clamp(b,0.0,255.0));
  let ai = u32(clamp(a,0.0,255.0));
  return (ai<<24u)|(bi<<16u)|(gi<<8u)|ri;
}

@compute @workgroup_size(16,16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x;
  let y = gid.y;
  if (x >= P0.W || y >= P0.H) { return; }
  let idx = y * P0.W + x;

  // normalize + quantize like before
  let mn = minmax[0].x;
  let mx = minmax[0].y;
  let range = max(1e-6, mx - mn);
  var v = (bestImg[idx] - mn) / range * 255.0;
  if (P0.inverted == 1u) { v = 255.0 - v; }

  let K = P0.K;
  let bin = clamp(u32(floor(v * f32(K) / 256.0)), 0u, K-1u);
  let thr = diid8[(x % 8u) * 8u + (y % 8u)];
  var white = (bin + 1u) > thr;

  // palette values
  var r = 126.0;
  var g = 143.0;
  var b = 250.0;
  var gr = 47.0;

  if (P0.bw == 1u) {
    r = 255.0; g = 255.0; b = 255.0; gr = 255.0;
  }

  if (white) {
    outRGBA[idx] = packRGBA(r, g, b, 255.0);
  } else {
    outRGBA[idx] = packRGBA(gr, gr, gr, 255.0);
  }
}

`;


// ------------------------------ Pipeline builder ------------------------------
async function initDitherGPU() {
  if (!navigator.gpu) throw new Error('WebGPU not supported');
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const queue = device.queue;

  const makePipeline = (code, layoutEntries) => {
    const module = device.createShaderModule({ code });
    const bgl = device.createBindGroupLayout({ entries: layoutEntries });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
    const pipeline = device.createComputePipeline({ layout, compute: { module, entryPoint: 'main' } });
    return { pipeline, bgl };
  };

  const minmax1 = makePipeline(WGSL_MINMAX_PASS1, [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
  ]);

  const minmax2 = makePipeline(WGSL_MINMAX_PASS2, [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
  ]);

const mega = makePipeline(WGSL_MEGA, [
  { binding: 0, buffer: { type: 'uniform' },           visibility: GPUShaderStage.COMPUTE },
  { binding: 1, buffer: { type: 'read-only-storage' }, visibility: GPUShaderStage.COMPUTE }, // srcRGBA
  { binding: 2, buffer: { type: 'read-only-storage' }, visibility: GPUShaderStage.COMPUTE }, // exposures
  { binding: 3, buffer: { type: 'read-only-storage' }, visibility: GPUShaderStage.COMPUTE }, // diffs
  { binding: 4, buffer: { type: 'read-only-storage' }, visibility: GPUShaderStage.COMPUTE }, // kernel
  { binding: 5, buffer: { type: 'read-only-storage' }, visibility: GPUShaderStage.COMPUTE }, // minmax
  { binding: 6, buffer: { type: 'storage' },           visibility: GPUShaderStage.COMPUTE }, // bestScore
  { binding: 7, buffer: { type: 'storage' },           visibility: GPUShaderStage.COMPUTE }, // bestImg
]);

const diidify = makePipeline(WGSL_DIIDIFY, [
  { binding: 0, buffer: { type: 'uniform' },           visibility: GPUShaderStage.COMPUTE },
  { binding: 1, buffer: { type: 'read-only-storage' }, visibility: GPUShaderStage.COMPUTE }, // bestImg
  { binding: 2, buffer: { type: 'read-only-storage' }, visibility: GPUShaderStage.COMPUTE }, // minmax
  { binding: 3, buffer: { type: 'read-only-storage' }, visibility: GPUShaderStage.COMPUTE }, // diid8
  { binding: 4, buffer: { type: 'storage' },           visibility: GPUShaderStage.COMPUTE }, // outRGBA
]);

  const diidBuf = uploadArray(
    device,
    queue,
    diidFlat,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  );

  return { device, queue, pipelines: { minmax1, minmax2, mega, diidify }, diidBuf };
}

const gpu = { device: null, queue: null, pipelines: null, diidBuf: null  };
async function ensureGPU() {
  if (!gpu.device) Object.assign(gpu, await initDitherGPU());
  return gpu;
}

// ------------------------------ Exported ditherIt (fully GPU) ------------------------------
export async function ditherIt(imgPixels /* Uint8ClampedArray RGBA */, W, H, {
  exp = 1, color = 1, bw = false, inverted = false,
  exposuresAll = DEFAULT_EXPOSURES_ALL,
  diffsAll = DEFAULT_DIFFS_ALL,
  bayer = BAYER_8x8,
  logKernel = LOG_9x9
} = {}) {
  const { device, queue, pipelines, diidBuf } = await ensureGPU();
  const N = W * H;

  // Convert bytes→f32 (0..1) on CPU for simplicity.
  const f32RGBA = new Float32Array(N * 4);
  for (let i = 0, j = 0; i < imgPixels.length; i += 4, j += 4) {
    f32RGBA[j+0] = imgPixels[i+0] / 255;
    f32RGBA[j+1] = imgPixels[i+1] / 255;
    f32RGBA[j+2] = imgPixels[i+2] / 255;
    f32RGBA[j+3] = imgPixels[i+3] / 255;
  }

  const srcBuf    = uploadArray(device, queue, f32RGBA);
  const bayerBuf  = uploadArray(device, queue, bayer);
  const kernelBuf = uploadArray(device, queue, logKernel);

  const exposures = exposuresAll.slice(0, Math.max(1, (exp - 1) * 2 + 1));
  const diffs     = diffsAll.slice(0, Math.max(0, color - 1));

  // Ensure buffers have at least length 1 (WebGPU binding size cannot be zero)
  const exArr = new Float32Array(Math.max(1, exposures.length));
  if (exposures.length) exArr.set(exposures);
  const dfArr = new Float32Array(Math.max(1, diffs.length));
  if (diffs.length) dfArr.set(diffs);

  const exposuresBuf = uploadArray(device, queue, exArr);
  const diffsBuf     = uploadArray(device, queue, dfArr);

  // Params for both mega and diidify
const paramsBuf = makeUniformBuffer(device, 36); // 9 * 4, aligned anyway
const paramsU32 = new Uint32Array(9);
paramsU32[0] = W;
paramsU32[1] = H;
paramsU32[2] = N;
paramsU32[3] = exposures.length;
paramsU32[4] = diffs.length;
paramsU32[5] = bw ? 1 : 0;
paramsU32[6] = inverted ? 1 : 0;
paramsU32[7] = 18; // K bins to match CPU (normalizeGrays(..., 18, ...))
paramsU32[8] = 0;  // pad
queue.writeBuffer(paramsBuf, 0, paramsU32.buffer);

  // Common for minmax pass1
  const commonBuf = makeUniformBuffer(device, 16);
  const commonU32 = new Uint32Array(4);
  commonU32[0] = W;
  commonU32[1] = H;
  commonU32[2] = N;
  commonU32[3] = 0;
  queue.writeBuffer(commonBuf, 0, commonU32.buffer);

  // MinMax intermediates and outputs
  const wgSize = 256;
  const groupsX = Math.max(1, Math.ceil(N / (wgSize * 4))); // tune stride factor
  const partialMinMax = makeBuffer(device, groupsX * 2 * BYTES.f32, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
  const finalMinMax   = makeBuffer(device, 2 * BYTES.f32, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);

  // Outputs
  const bestScore = makeBuffer(device, N * BYTES.f32, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
  const bestImg   = makeBuffer(device, N * BYTES.f32, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
  const outRGBA   = makeBuffer(device, N * BYTES.u32, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);

  // Zero bestScore/Img quickly via writeBuffer chunks
  const zeroChunk = new Float32Array(Math.min(N, 1 << 15));
  const chunkBytes = zeroChunk.byteLength;
  for (let off = 0; off < N * 4; off += chunkBytes) {
    const len = Math.min(chunkBytes, N * 4 - off);
    queue.writeBuffer(bestScore, off, zeroChunk.buffer, 0, len);
    queue.writeBuffer(bestImg,   off, zeroChunk.buffer, 0, len);
  }

  const encoder = device.createCommandEncoder();

  // ---- MinMax Pass 1
  const bg1 = device.createBindGroup({
    layout: pipelines.minmax1.bgl,
    entries: [
      { binding: 0, resource: { buffer: commonBuf } },
      { binding: 1, resource: { buffer: srcBuf } },
      { binding: 2, resource: { buffer: partialMinMax } }
    ]
  });
  {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipelines.minmax1.pipeline);
    pass.setBindGroup(0, bg1);
    pass.dispatchWorkgroups(groupsX);
    pass.end();
  }

  // ---- MinMax Pass 2 (single workgroup)
  const bg2 = device.createBindGroup({
    layout: pipelines.minmax2.bgl,
    entries: [
      { binding: 0, resource: { buffer: partialMinMax } },
      { binding: 1, resource: { buffer: finalMinMax } }
    ]
  });
  {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipelines.minmax2.pipeline);
    pass.setBindGroup(0, bg2);
    pass.dispatchWorkgroups(1);
    pass.end();
  }

  // ---- Mega kernel
const bgM = device.createBindGroup({
  layout: pipelines.mega.bgl,
  entries: [
    { binding: 0, resource: { buffer: paramsBuf } },
    { binding: 1, resource: { buffer: srcBuf } },
    { binding: 2, resource: { buffer: exposuresBuf } },
    { binding: 3, resource: { buffer: diffsBuf } },
    { binding: 4, resource: { buffer: kernelBuf } },
    { binding: 5, resource: { buffer: finalMinMax } },
    { binding: 6, resource: { buffer: bestScore } },
    { binding: 7, resource: { buffer: bestImg } },
  ]
});
  const gx = Math.ceil(W / 16);
  const gy = Math.ceil(H / 16);
  {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipelines.mega.pipeline);
    pass.setBindGroup(0, bgM);
    pass.dispatchWorkgroups(gx, gy);
    pass.end();
  }

  // ---- Diidify
const bgD = device.createBindGroup({
  layout: pipelines.diidify.bgl,
  entries: [
    { binding: 0, resource: { buffer: paramsBuf } },
    { binding: 1, resource: { buffer: bestImg } },
    { binding: 2, resource: { buffer: finalMinMax } },
    { binding: 3, resource: { buffer: diidBuf } },   // NEW
    { binding: 4, resource: { buffer: outRGBA } },
  ]
});
  {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipelines.diidify.pipeline);
    pass.setBindGroup(0, bgD);
    pass.dispatchWorkgroups(gx, gy);
    pass.end();
  }

  // Readback
  const readBuf = device.createBuffer({
    size: align(N * BYTES.u32, 256),
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });
  encoder.copyBufferToBuffer(outRGBA, 0, readBuf, 0, N * BYTES.u32);

  queue.submit([encoder.finish()]);
  await readBuf.mapAsync(GPUMapMode.READ);
  const out = new Uint8Array(readBuf.getMappedRange().slice(0, N * 4));
  readBuf.unmap();

  // Cleanup (optional)
  [srcBuf, bayerBuf, kernelBuf, exposuresBuf, diffsBuf,
   partialMinMax, finalMinMax, bestScore, bestImg, outRGBA, readBuf].forEach(b => b.destroy?.());

  return out; // RGBA bytes (W*H*4)
}
