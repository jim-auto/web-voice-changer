let audioContext;

export function getSupportedRecorderOptions() {
  if (typeof MediaRecorder === 'undefined') {
    return undefined;
  }

  const mimeTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];

  const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType } : undefined;
}

export function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('This browser does not support the Web Audio API.');
    }

    audioContext = new AudioContextClass();
  }

  return audioContext;
}

export class AudioRecorder {
  constructor({ onTick } = {}) {
    this.onTick = onTick;
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.startedAt = 0;
    this.timerId = 0;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support microphone recording.');
    }

    if (typeof MediaRecorder === 'undefined') {
      throw new Error('This browser does not support MediaRecorder.');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const context = getAudioContext();
    if (context.state === 'suspended') {
      await context.resume();
    }

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream, getSupportedRecorderOptions());

    this.mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    });

    this.startedAt = performance.now();
    this.timerId = window.setInterval(() => {
      this.onTick?.((performance.now() - this.startedAt) / 1000);
    }, 100);

    this.mediaRecorder.start();
  }

  async stop() {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      throw new Error('Recorder is not active.');
    }

    const stopped = new Promise((resolve, reject) => {
      this.mediaRecorder.addEventListener(
        'stop',
        () => {
          resolve();
        },
        { once: true },
      );

      this.mediaRecorder.addEventListener(
        'error',
        (event) => {
          reject(event.error || new Error('Recording failed.'));
        },
        { once: true },
      );
    });

    this.mediaRecorder.stop();
    await stopped;

    window.clearInterval(this.timerId);
    this.timerId = 0;
    this.onTick?.((performance.now() - this.startedAt) / 1000);

    const blob = new Blob(this.chunks, {
      type: this.mediaRecorder.mimeType || 'audio/webm',
    });

    this.stopTracks();
    const decoded = await decodeAudioBlob(blob);

    return {
      blob,
      arrayBuffer: await blob.arrayBuffer(),
      audioBuffer: decoded.audioBuffer,
      samples: decoded.samples,
      sampleRate: decoded.sampleRate,
      duration: decoded.duration,
    };
  }

  cancel() {
    window.clearInterval(this.timerId);
    this.timerId = 0;
    this.stopTracks();
  }

  stopTracks() {
    for (const track of this.stream?.getTracks() || []) {
      track.stop();
    }

    this.stream = null;
  }
}

export async function decodeAudioBlob(blob) {
  const context = getAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
  const samples = extractMonoSamples(audioBuffer);

  return {
    audioBuffer,
    samples,
    sampleRate: audioBuffer.sampleRate,
    duration: audioBuffer.duration,
  };
}

export function extractMonoSamples(audioBuffer) {
  if (audioBuffer.numberOfChannels === 1) {
    return new Float32Array(audioBuffer.getChannelData(0));
  }

  const samples = new Float32Array(audioBuffer.length);

  for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex += 1) {
    const channel = audioBuffer.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < channel.length; sampleIndex += 1) {
      samples[sampleIndex] += channel[sampleIndex] / audioBuffer.numberOfChannels;
    }
  }

  return samples;
}

export async function playFloat32Audio(samples, sampleRate) {
  if (!samples?.length) {
    throw new Error('There is no audio to play.');
  }

  const context = getAudioContext();

  if (context.state === 'suspended') {
    await context.resume();
  }

  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(clampSamples(samples), 0);

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);

  await new Promise((resolve) => {
    source.addEventListener('ended', resolve, { once: true });
    source.start();
  });
}

export function clampSamples(samples) {
  const clamped = new Float32Array(samples.length);

  for (let index = 0; index < samples.length; index += 1) {
    clamped[index] = Math.max(-1, Math.min(1, samples[index]));
  }

  return clamped;
}

export function drawWaveform(canvas, samples, options = {}) {
  const context = canvas.getContext('2d');
  const cssWidth = canvas.clientWidth || 640;
  const cssHeight = canvas.clientHeight || 180;
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.floor(cssWidth * pixelRatio);
  const height = Math.floor(cssHeight * pixelRatio);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.clearRect(0, 0, width, height);
  context.fillStyle = options.background || '#f0f3ef';
  context.fillRect(0, 0, width, height);

  context.strokeStyle = options.grid || '#cdd6d0';
  context.lineWidth = 1 * pixelRatio;
  context.beginPath();
  context.moveTo(0, height / 2);
  context.lineTo(width, height / 2);
  context.stroke();

  if (!samples?.length) {
    return;
  }

  const samplesPerPixel = Math.max(1, Math.floor(samples.length / width));
  context.strokeStyle = options.color || '#2f6f5e';
  context.lineWidth = 1.5 * pixelRatio;
  context.beginPath();

  for (let pixel = 0; pixel < width; pixel += 1) {
    const start = pixel * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, samples.length);
    let min = 1;
    let max = -1;

    for (let index = start; index < end; index += 1) {
      const value = samples[index];
      if (value < min) min = value;
      if (value > max) max = value;
    }

    const yMin = ((1 - min) / 2) * height;
    const yMax = ((1 - max) / 2) * height;

    context.moveTo(pixel, yMin);
    context.lineTo(pixel, yMax);
  }

  context.stroke();
}
