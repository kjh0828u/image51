import { pipeline, env, RawImage } from '@huggingface/transformers';

env.allowLocalModels = false;
env.allowRemoteModels = true;

async function test() {
    console.log("Loading model...");
    // RMBG-1.4 requires the 'refs/pr/17' revision sometimes in v2, but v3 might be different.
    // Let's use it as is first.
    let pipe = await pipeline('image-segmentation', 'briaai/RMBG-1.4');

    // Create a dummy image 32x32 blank
    const data = new Uint8Array(32 * 32 * 4);
    for (let i = 0; i < data.length; i++) data[i] = 255;
    const img = new RawImage(data, 32, 32, 4);

    console.log("Running pipeline...");
    const results = await pipe(img);

    console.log("Result:", results);
    if (results.length > 0) {
        console.log("First mask label:", results[0].label);
        console.log("First mask keys:", Object.keys(results[0]));
        if (results[0].mask) {
            console.log("Mask object keys:", Object.keys(results[0].mask));
        }
    } else {
        console.log("Keys:", Object.keys(results));
    }
}

test().catch(console.error);
