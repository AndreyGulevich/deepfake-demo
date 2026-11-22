# SBI FF-c23 · локальный сервер

Детектор анализирует один кадр на CPU в отдельном процессе. OpenCV YuNet находит лицо в RGBA-кадре 320 × 320. При единственном лице адаптер добавляет отступ ⅛ ширины и высоты, приводит фрагмент к RGB 380 × 380 и подаёт значения в диапазоне [0, 1] на EfficientNet-B4 с официальными весами FF-c23. Служба возвращает softmax второго класса. При отсутствии лица или нескольких лицах возвращает `no_track` без оценки. Авторы используют RetinaFace, поэтому опубликованные метрики нельзя переносить на эту демку без отдельного измерения.

Авторы предоставляют код и веса для личного внутреннего некоммерческого исследования. Для коммерческого применения требуется соглашение. Оригинальный код и веса хранятся отдельно от приложения. [Публикация и описание модели](https://github.com/mapooon/SelfBlendedImages#2-pretrained-model), [условия авторов](https://github.com/mapooon/SelfBlendedImages/blob/master/LICENSE), [OpenCV YuNet и лицензия](https://github.com/opencv/opencv_zoo/tree/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_detection_yunet).

## Установка и проверка

Из корня проекта на macOS или Linux с Python 3.12 и curl выполните команды ниже в рамках разрешённого исследовательского использования. На Windows используйте Python 3.12 и интерпретатор окружения из Scripts/python.exe. Каждый файл доступен также по указанным ссылкам для ручной загрузки.

```sh
base="$HOME/.cache/deepfake-demo"
mkdir -p "$base/sbi"
python3.12 -m venv "$base/sbi-venv"
"$base/sbi-venv/bin/python" -m pip install -r integrations/sbi/requirements.txt
curl -fL 'https://drive.usercontent.google.com/download?id=1X0-NYT8KPursLZZdxduRQju6E52hauV0&export=download&confirm=t' -o "$base/sbi/FFc23.tar"
curl -fL https://media.githubusercontent.com/media/opencv/opencv_zoo/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_detection_yunet/face_detection_yunet_2023mar.onnx -o "$base/sbi/yunet.onnx"
"$base/sbi-venv/bin/python" integrations/sbi/test_engine.py
yarn start:sbi
```

Переменная SBI_MODEL_DIR задаёт каталог двух моделей. При старте проверяются SHA-256 файлов, точное соответствие весов архитектуре и работоспособность прямого прохода сети. Тест выполняет инференс на диагностической фотографии демки, проверяет результат для пустого кадра и отказ при неверном размере. Для оценки точности нужен отдельный размеченный набор реальных и синтетических кадров после ВКС.
