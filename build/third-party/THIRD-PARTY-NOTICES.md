# Third-Party Notices

Familiar includes the following third-party software and model assets for local speaker
diarization.

## FluidAudio

- Component: FluidAudio 0.15.4
- Revision: `b9d43724cbdb5a980e441fd54180964e94d470f7`
- Source: <https://github.com/FluidInference/FluidAudio>
- License: Apache License 2.0
- License copy: `licenses/FluidAudio-APACHE-2.0.txt`

Familiar links the upstream FluidAudio Swift package into its speech helper. Familiar does not
modify the FluidAudio source files.

## FluidInference Speaker Diarization CoreML Model

- Component: `FluidInference/speaker-diarization-coreml`
- Revision: `1ed7a662fdc7109e36d822db793ee6eebdaf8594`
- Source: <https://huggingface.co/FluidInference/speaker-diarization-coreml>
- License: CC-BY-4.0
- License: <https://creativecommons.org/licenses/by/4.0/legalcode>
- Parent model: <https://huggingface.co/pyannote/speaker-diarization-community-1>

Fluid Inference converted and optimized the pyannote `speaker-diarization-community-1` pipeline
for Core ML. Familiar redistributes the pinned segmentation, filter-bank, embedding, PLDA, and
parameter assets without modifying their contents. Familiar selects only the files required by
FluidAudio's offline diarization pipeline.
