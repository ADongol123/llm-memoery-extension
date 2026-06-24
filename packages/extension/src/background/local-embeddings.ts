import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

let _pipeline: FeatureExtractionPipeline | null = null;
let _loading: Promise<FeatureExtractionPipeline> | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (_pipeline) return _pipeline;
  if (_loading) return _loading;

  _loading = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
    dtype: "q8" as const,
    device: "wasm" as const,
  }).then((p) => {
    _pipeline = p as FeatureExtractionPipeline;
    _loading = null;
    return _pipeline;
  });

  return _loading;
}

export async function embedTexts(texts: string[]): Promise<Array<number[]>> {
  if (texts.length === 0) return [];

  const extractor = await getPipeline();
  const results: Array<number[]> = [];
  const BATCH = 32;

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const output = await extractor(batch, { pooling: "mean", normalize: true });

    const outputData = output as unknown as { data: Float32Array; dims: number[] };
    const dim = outputData.dims[outputData.dims.length - 1];
    for (let j = 0; j < batch.length; j++) {
      const slice = outputData.data.slice(j * dim, (j + 1) * dim);
      results.push(Array.from(slice));
    }
  }

  return results;
}
