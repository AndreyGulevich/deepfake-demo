# MTL Face Auth

[Author and model card](https://huggingface.co/shahriarhd/mtl-face-auth). Model metadata specifies MIT. The adapter uses model_best.onnx at revision bbae7482f28a9d7142a8f122a3bce105106df669. Its SHA-256 is e0223a229e2100def4c5d638bee16f8a385f048676c0ca155c5cb819ce50a138. Install with yarn model:mtl. To install offline, pass the model file path to that command.

The browser worker evaluates eight decoded RGB face crops using ImageNet normalization, then applies sigmoid once to deepfake_logit. The stream adapter uses the studio's pico tracker and pads each face crop by 15% per side. A missing detection resets the clip. Local WASM inference runs only while this detector is selected and enabled.

[Author's configuration](https://huggingface.co/shahriarhd/mtl-face-auth/blob/bbae7482f28a9d7142a8f122a3bce105106df669/config.json) and [reference web implementation](https://huggingface.co/spaces/shahriarhd/mtl-face-auth-web/blob/main/mtl-onnx.js).
