# DeepFaceLive Face Animator

This adapter uses the original split ONNX generator shipped in DeepFaceLive commit `fc7b787bda2b8c186e142c52857458eea3a935ed`. The Face Animator backend creates an LIA instance, extracts the initial driver motion, and calls the generator to animate the source image. The demo uses this model locally through ONNX Runtime. [Upstream backend](https://github.com/iperov/DeepFaceLive/blob/fc7b787bda2b8c186e142c52857458eea3a935ed/apps/DeepFaceLive/backend/FaceAnimator.py) · [Upstream wrapper and model files](https://github.com/iperov/DeepFaceLive/tree/fc7b787bda2b8c186e142c52857458eea3a935ed/modelhub/onnx/LIA)

## Installation

From the project root, run `python integrations/deepfacelive/prepare.py` with Python 3. The installer downloads four files from the pinned GitHub revision into a temporary staging file. It verifies each size and Git blob ID, checks the combined SHA-256, then installs the model at `~/.cache/deepfake-demo/deepfacelive/generator.onnx`. A repeated run verifies the cached model offline. Use `--model PATH` to select a destination or `--parts-dir PATH` to assemble the official parts offline. Model size is 192,555,477 bytes. [Pinned tree](https://api.github.com/repos/iperov/DeepFaceLive/git/trees/fc7b787bda2b8c186e142c52857458eea3a935ed?recursive=1)

| Part | Bytes | Upstream Git blob ID |
| --- | ---: | --- |
| 0 | 50,331,648 | `f55aea4cd26c543cc58ca6c2840ebfbf26c72c40` |
| 1 | 50,331,648 | `ae9a2531400a6507c99b1f49fc9e8060bf0e62f6` |
| 2 | 50,331,648 | `d3adc9022cd908282a5f02b13644bac0f515104c` |
| 3 | 41,560,533 | `1f8acbc698aec8a35c35871fde78e4967291c160` |

SHA-256 of the unmodified assembled file is `a4b316e832bc781093d15bb2e87493008430cd8973ec19e67d48906fa2248003`.

## Attribution and terms

Yaohui Wang, Di Yang, François Brémond and Antitza Dantcheva created Latent Image Animator. Their LIA repository publishes a Creative Commons Attribution–NonCommercial 4.0 International license. DeepFaceLive identifies their project as the source of its LIA implementation. [LIA project](https://github.com/wyhsirius/LIA/tree/b9f15fb70a3b7704576491ef8f4fd6fc4ad557d9) · [LIA license](https://github.com/wyhsirius/LIA/blob/b9f15fb70a3b7704576491ef8f4fd6fc4ad557d9/LICENSE.md)

Iperov's DeepFaceLive repository carries GPLv3. Its model directory supplies the binary in four parts without a separate ONNX-specific license or checkpoint provenance notice. Treat use here as local, noncommercial evaluation. Obtain rights from the relevant holders before commercial use or redistribution of the weights. The application package excludes the model. [DeepFaceLive license](https://github.com/iperov/DeepFaceLive/blob/fc7b787bda2b8c186e142c52857458eea3a935ed/LICENSE) · [Model directory](https://github.com/iperov/DeepFaceLive/tree/fc7b787bda2b8c186e142c52857458eea3a935ed/modelhub/onnx/LIA)
