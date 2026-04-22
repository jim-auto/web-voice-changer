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

export function getModelProfile(overrides = {}) {
  return {
    ...identityModelProfile,
    ...overrides,
    preprocess: overrides.preprocess ?? identityModelProfile.preprocess,
    resolveInputName: overrides.resolveInputName ?? identityModelProfile.resolveInputName,
    resolveOutputName: overrides.resolveOutputName ?? identityModelProfile.resolveOutputName,
    resolveInputShape: overrides.resolveInputShape ?? identityModelProfile.resolveInputShape,
    postprocess: overrides.postprocess ?? identityModelProfile.postprocess,
  };
}

export function toFloat32Array(data) {
  if (data instanceof Float32Array) {
    return data;
  }

  return Float32Array.from(data);
}
