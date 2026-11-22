# Локальный FTCN+TT

В списке «Детектор» выберите FTCN и включите переключатель. Для проверки без звонка подходит исходящий поток. Служба принимает по одному клипу из 32 декодированных кадров на 127.0.0.1:8767. YuNet находит пять точек лица в каждом кадре. Служба применяет общее выравнивание FTCN и передаёт 32 RGB-кадра 224 × 224 официальной сети FTCN+TT на CPU. При потере лица или обнаружении нескольких лиц процент скрывается. Процент — выход sigmoid на текущем клипе. Калибровка на ВКС и сравнение с оригинальной обработкой RetinaFace не проводились.

## Подготовка на macOS или Linux

Из корня Deepfake Demo, с Git, curl и Python 3.12:

```sh
base="$HOME/.cache/deepfake-demo"
mkdir -p "$base"
git clone https://github.com/yinglinzheng/FTCN "$base/FTCN"
git -C "$base/FTCN" checkout 853256a888bd5c4879955c06a4c5a666740f91a4
python3.12 -m venv "$base/ftcn-venv"
"$base/ftcn-venv/bin/pip" install setuptools wheel
"$base/ftcn-venv/bin/pip" install --no-build-isolation -r integrations/ftcn/requirements.txt
mkdir -p "$base/FTCN/checkpoints"
curl -fL https://github.com/yinglinzheng/FTCN/releases/download/weights/ftcn_tt.pth -o "$base/FTCN/checkpoints/ftcn_tt.pth"
curl -fL https://media.githubusercontent.com/media/opencv/opencv_zoo/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_detection_yunet/face_detection_yunet_2023mar.onnx -o "$base/FTCN/checkpoints/yunet.onnx"
yarn start:ftcn
```

При запуске служба проверяет ревизию, SHA-256 обоих файлов, соответствие параметров сети и выполняет пробный расчёт. Откройте список реализаций заново, чтобы обновить доступность. Переменные FTCN_REPO и FTCN_PYTHON позволяют указать свои пути. На Windows путь к интерпретатору окружения заканчивается на Scripts/python.exe. Разработческий сервер интерфейса запускается отдельно через yarn start.

Исходники сторонней сети и веса находятся в пользовательском кеше, кадры обрабатываются в памяти. Авторы FTCN предоставляют веса для воспроизведения исследования. Отдельная лицензия на распространение сети и весов в закреплённом репозитории не указана. [Репозиторий и чекпойнт](https://github.com/yinglinzheng/FTCN), [публикация ICCV](https://openaccess.thecvf.com/content/ICCV2021/html/Zheng_Exploring_Temporal_Coherence_for_More_General_Video_Face_Forgery_Detection_ICCV_2021_paper.html), [модель YuNet и лицензия](https://github.com/opencv/opencv_zoo/tree/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_detection_yunet).
