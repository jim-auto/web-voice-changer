import { getModelProfile, toFloat32Array } from './modelProfile.js';

const MODEL_URL = new URL(`${import.meta.env.BASE_URL}models/model.onnx`, window.location.href).href;

export class VoiceChanger {
  constructor({ modelUrl = MODEL_URL, allowPassthrough = true, modelProfile } = {}) {
    this.modelUrl = modelUrl;
    this.allowPassthrough = allowPassthrough;
    this.modelProfile = getModelProfile(modelProfile);
    this.ort = null;
    this.session = null;
    this.provider = 'not loaded';
    this.warning = '';
  }

  async load() {
    if (this.session) {
      return this;
    }

    const candidates = [];

    if ('gpu' in navigator) {
      candidates.push({
        provider: 'webgpu',
        loader: () => import('onnxruntime-web/webgpu'),
        executionProviders: ['webgpu'],
      });
    }

    candidates.push({
      provider: 'wasm',
      loader: () => import('onnxruntime-web'),
      executionProviders: ['wasm'],
    });

    const errors = [];

    for (const candidate of candidates) {
      try {
        const ort = await candidate.loader();
        configureRuntime(ort);

        const session = await ort.InferenceSession.create(this.modelUrl, {
          executionProviders: candidate.executionProviders,
          graphOptimizationLevel: 'all',
        });

        this.ort = ort;
        this.session = session;
        this.provider = candidate.provider;
        this.warning = '';
        return this;
      } catch (error) {
        errors.push(`${candidate.provider}: ${error.message}`);
      }
    }

    const message = `ONNX model could not be loaded. ${errors.join(' | ')}`;
    this.warning = message;

    if (!this.allowPassthrough) {
      throw new Error(message);
    }

    this.provider = 'passthrough';
    return this;
  }

  async convert(samples, sampleRate) {
    await this.load();
    const sourceSamples = toFloat32Array(samples);

    if (!this.session || !this.ort) {
      return {
        samples: sourceSamples,
        sampleRate,
        provider: this.provider,
        warning: this.warning,
      };
    }

    try {
      const preparedInput = normalizeProfileAudioPayload(
        this.modelProfile.preprocess({
          samples: sourceSamples,
          sampleRate,
          session: this.session,
          ort: this.ort,
          provider: this.provider,
        }),
        sampleRate,
        'preprocess',
      );
      const inputName = this.modelProfile.resolveInputName({
        session: this.session,
        sampleRate: preparedInput.sampleRate,
        samples: preparedInput.samples,
      });
      const outputName = this.modelProfile.resolveOutputName({
        session: this.session,
        sampleRate: preparedInput.sampleRate,
        samples: preparedInput.samples,
      });
      const inputShape = this.modelProfile.resolveInputShape({
        session: this.session,
        inputName,
        sampleRate: preparedInput.sampleRate,
        samples: preparedInput.samples,
      });
      const inputTensor = new this.ort.Tensor('float32', preparedInput.samples, inputShape);
      const results = await this.session.run({ [inputName]: inputTensor });
      const outputTensor = results[outputName] || Object.values(results)[0];
      const converted = normalizeProfileAudioPayload(
        this.modelProfile.postprocess({
          outputTensor,
          outputs: results,
          session: this.session,
          sampleRate: preparedInput.sampleRate,
          originalSampleRate: sampleRate,
          ort: this.ort,
          provider: this.provider,
        }),
        preparedInput.sampleRate,
        'postprocess',
      );

      return {
        samples: converted.samples,
        sampleRate: converted.sampleRate,
        provider: this.provider,
        warning: '',
      };
    } catch (error) {
      const message = `ONNX inference failed. ${error.message}`;
      this.warning = message;

      if (!this.allowPassthrough) {
        throw new Error(message);
      }

      return {
        samples: sourceSamples,
        sampleRate,
        provider: 'passthrough',
        warning: message,
      };
    }
  }
}

function configureRuntime(ort) {
  if (!ort.env?.wasm) {
    return;
  }

  ort.env.wasm.numThreads = 1;
}

function normalizeProfileAudioPayload(value, fallbackSampleRate, stage) {
  const payload = isAudioPayload(value) ? value : { samples: value, sampleRate: fallbackSampleRate };

  if (payload.samples === undefined) {
    throw new Error(`Model profile ${stage} did not return samples.`);
  }

  return {
    samples: toFloat32Array(payload.samples),
    sampleRate: payload.sampleRate ?? fallbackSampleRate,
  };
}

function isAudioPayload(value) {
  return Boolean(value) && typeof value === 'object' && 'samples' in value;
}
