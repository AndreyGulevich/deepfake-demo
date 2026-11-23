# HifiFace 256

Локальный процесс для неофициальной модели GuijiAI, опубликованной в [каталоге FaceFusion](https://github.com/facefusion/facefusion/blob/master/facefusion/processors/modules/face_swapper/core.py). Лицензия модели в каталоге указана как Unknown. Веса хранятся вне проекта. У весов ArcFace действуют отдельные [условия InsightFace](https://github.com/deepinsight/insightface#license).

Запустите из корня проекта `yarn start:hififace`. Используется Python из окружения Deep-Live-Cam. Переменная `HIFIFACE_PYTHON` позволяет выбрать собственный Python 3.11+ с numpy, opencv-python и onnxruntime. Сервис использует CPU. Проверка готовности доступна на `http://127.0.0.1:8771/health`. Поле swappedFrames считает завершённые подмены после прогрева.

Для ручной установки поместите [hififace_unofficial_256.onnx](https://huggingface.co/facefusion/models-3.1.0/resolve/main/hififace_unofficial_256.onnx) и [crossface_hififace.onnx](https://huggingface.co/facefusion/models-3.4.0/resolve/main/crossface_hififace.onnx) в `~/.cache/deepfake-demo/hififace` или каталог `HIFIFACE_MODELS`. Для установленной в демке модели buffalo_l используется `~/.cache/deepfake-demo/deeplivecam-models/buffalo_l/w600k_r50.onnx`, для YuNet — `~/.cache/deepfake-demo/FTCN/checkpoints/yunet.onnx`. Пути к этим двум файлам можно задать через `HIFIFACE_ARCFACE` и `HIFIFACE_YUNET`. При старте сервис сверяет SHA-256 всех четырёх файлов и обрабатывает контрольный кадр.

В демке выберите фото с одним лицом в общем блоке фотографий, затем выберите HifiFace в блоке генератора и включите его. Без фото используется синтетический портрет. Кадры, в которых найдено ровно одно лицо, обрабатываются моделью. Остальные кадры передаются как есть.
