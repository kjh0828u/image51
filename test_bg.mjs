import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.allowRemoteModels = true;

async function test() {
    console.log("Loading model...");
    const pipe = await pipeline('image-segmentation', 'briaai/RMBG-1.4');
    console.log("Model loaded");

    // We don't have an image, let's just inspect the model pipeline
    console.log("Pipeline keys:", Object.keys(pipe));
}

test().catch(console.error);
