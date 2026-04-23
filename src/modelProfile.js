const DEMO_PITCH_RATIO = 1.18;

export const identityModelProfile = Object.freeze({
  expectedSampleRate: null,
  inputName: null,
  outputName: null,
  preprocess({ samples, sampleRate }) {
    return {
      samples: toFloat32Array(samples),
      sampleRate,
    };
  },
  resolveInputName({ session }) {
    return this.inputName || session.inputNames[0];
  },
  resolveOutputName({ session }) {
    return this.outputName || session.outputNames[0];
  },
  resolveInputShape({ session, inputName, samples }) {
    const metadata = session.inputMetadata?.[inputName];
    const dimensions = metadata?.dimensions || metadata?.dims;
    const sampleCount = samples.length;

    if (!Array.isArray(dimensions) || dimensions.length === 0) {
      return [sampleCount];
    }

    return dimensions.map((dimension, index) => {
      const isDynamic =
        typeof dimension === 'string' ||
        dimension === null ||
        dimension === undefined ||
        dimension <= 0;

      if (!isDynamic) {
        return dimension;
      }

      return index === dimensions.length - 1 ? sampleCount : 1;
    });
  },
  postprocess({ outputTensor, sampleRate }) {
    if (!outputTensor?.data) {
      throw new Error('The ONNX model did not return a tensor output.');
    }

    return {
      samples: toFloat32Array(outputTensor.data),
      sampleRate,
    };
  },
});

export const demoModelProfile = Object.freeze({
  ...identityModelProfile,
  postprocess({ outputTensor, sampleRate }) {
    if (!outputTensor?.data) {
      throw new Error('The ONNX model did not return a tensor output.');
    }

    return {
      samples: applyDemoVoiceShift(toFloat32Array(outputTensor.data), DEMO_PITCH_RATIO),
      sampleRate,
    };
  },
});

export function getModelProfile(overrides = {}) {
  return {
    ...demoModelProfile,
    ...overrides,
    preprocess: overrides.preprocess ?? demoModelProfile.preprocess,
    resolveInputName: overrides.resolveInputName ?? demoModelProfile.resolveInputName,
    resolveOutputName: overrides.resolveOutputName ?? demoModelProfile.resolveOutputName,
    resolveInputShape: overrides.resolveInputShape ?? demoModelProfile.resolveInputShape,
    postprocess: overrides.postprocess ?? demoModelProfile.postprocess,
  };
}

export function toFloat32Array(data) {
  if (data instanceof Float32Array) {
    return data;
  }

  return Float32Array.from(data);
}

function applyDemoVoiceShift(samples, ratio) {
  if (!(samples instanceof Float32Array) || samples.length === 0) {
    return samples;
  }

  const outputLength = Math.max(1, Math.round(samples.length / ratio));
  const shifted = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const leftIndex = Math.min(samples.length - 1, Math.floor(sourceIndex));
    const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
    const weight = sourceIndex - leftIndex;
    shifted[index] = samples[leftIndex] * (1 - weight) + samples[rightIndex] * weight;
  }

  return shifted;
}
