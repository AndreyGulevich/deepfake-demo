# Getting Started · Deepfake Demo

Начните с локальной камеры и одного браузерного детектора. Так можно проверить обработку видео ещё до установки Python, подключения генератора и первого звонка.

## 1. Установите приложение

Понадобятся Git, Node.js 22.22.2, Yarn Classic 1.22.22 и браузер с поддержкой WebRTC и WebAssembly. Для первого скачивания зависимостей и весов нужен интернет. Docker и соседний проект Vinteo Frontend для запуска не требуются.

```sh
git clone https://github.com/AndreyGulevich/deepfake-demo.git
cd deepfake-demo
node --version
corepack enable
corepack prepare yarn@1.22.22 --activate
yarn --version
yarn install --frozen-lockfile
```

Если скачали ZIP, распакуйте его, откройте терминал в папке с `package.json` и начните с проверки Node. Если Yarn Classic уже установлен, пропустите две команды Corepack. Все следующие команды запускайте из корня проекта.

## 2. Проверьте детектор без звонка

```sh
yarn model:detector
yarn dev:web
```

Откройте [localhost:3003](http://localhost:3003), разрешите доступ к камере и убедитесь, что видите себя в исходящем видео. Выберите поток **«Исходящий · после генератора»**, детектор **Deep-Fake-Detector-v2** и включите его. Посмотрите прямо в камеру. При обнаружении лица появится оценка в процентах. Для этого сценария микрофон можно выключить. Чтобы добавить второй браузерный детектор, выполните `yarn model:mtl`. Обе команды подготовки сверяют SHA-256 и кладут ONNX и WASM в `public/models/`.

Остановите Vite сочетанием **Ctrl+C** перед переходом к обычному запуску на том же порту.

## 3. Добавьте генератор и локальные детекторы

Простой первый генератор — **DeepFaceLive Face Animator**. На macOS с установленным Python 3.11 выполните команду ниже. На Windows установите 64-битный Python 3.11 с Python Launcher и выполните просто `yarn setup:deepfacelive`. Установщик создаст окружение и подготовит веса. [Происхождение и условия модели](integrations/deepfacelive/MODEL.md).

```sh
DEMO_PYTHON=python3.11 yarn setup:deepfacelive
yarn start
```

В блоке фотографии выберите фронтальное фото с одним лицом. Включите камеру, выберите **DeepFaceLive · Face Animator (LIA)** и включите генератор. Подвигайте головой и проверьте, что портрет движется в исходящем видео. Выключение генератора возвращает обычную камеру. Для смены модели сначала выключите соответствующий генератор или детектор.

Остальные модели устанавливаются по отдельности. Для команд в формате shell ниже подходят macOS и Linux. На Windows используйте PowerShell-инструкции там, где они приведены. Весь набор локальных моделей проверялся разработчиками преимущественно на Apple Silicon. Полная установка на Windows и Linux требует проверки на целевой машине.

| Модель | Что подготовить один раз | Порт |
| --- | --- | --- |
| DeepFaceLive · LIA | Python 3.11 и команда выше | 8765 |
| Deep-Live-Cam · InSwapper | Python 3.12, C++ toolchain, закреплённый checkout, InSwapper и buffalo_l. Сначала изучите [условия весов](integrations/deeplivecam/TERMS.md), затем выполните [установку для своей ОС](integrations/deeplivecam/INSTALL.md). | 8766 |
| FTCN+TT | [Установка FTCN](integrations/ftcn/README.md) создаёт Python-окружение, скачивает сеть и детектор лица YuNet. Для первой оценки держите в кадре одно лицо на протяжении 32 кадров. | 8767 |
| GhostV2 · FakeFace Test Camera | Нужен отдельный комплект FakeFace Test Camera 1.0.0 от его владельца. Публичный клон содержит адаптер. Если комплект у вас есть, [подготовьте каталог, ссылку на модели и окружение OpenVINO](README.md#fakeface-test-camera--ghostv2). | 8768 |
| AltFreezing | Выполните [установку AltFreezing](integrations/altfreezing/README.md) и отдельно скачайте авторский checkpoint. Если уже установлен FTCN, используйте его Python. При отдельном venv экспортируйте `ALTFREEZING_PYTHON` в том же терминале, откуда запускаете студию. | 8769 |
| SBI FF-c23 | [Инструкция SBI](integrations/sbi/README.md) включает зависимости, веса FF-c23, YuNet и проверку на фотографии. | 8770 |
| HifiFace 256 | Подготовьте окружение Deep-Live-Cam, ArcFace из buffalo_l и YuNet из шага FTCN. Затем установите [два файла HifiFace](integrations/hififace/README.md). Веса неофициальные, проверьте права на своё использование. | 8771 |
| HyperSwap 1c 256 | Использует те же Python, ArcFace и YuNet. Создайте каталог `~/.cache/deepfake-demo/hyperswap/` и сохраните туда [hyperswap_1c_256.onnx](https://huggingface.co/facefusion/models-3.3.0/resolve/main/hyperswap_1c_256.onnx). [Условия весов](https://github.com/facefusion/facefusion-labs/blob/master/hyperswap/LICENSE.md). | 8772 |
| LivePortrait | Выполните команды следующего раздела. | 8773 |

Если пошаговая инструкция заканчивается командой `yarn start:<модель>`, дождитесь готовности и нажмите Ctrl+C в этом терминале. После установки нужных моделей один `yarn start` запускает их вместе. При использовании нестандартных путей задайте переменные окружения перед каждым запуском студии.

### LivePortrait на macOS с Apple Silicon

Нужны Git, curl и Python 3.12. Следующие команды создают отдельное окружение и раскладывают файлы по путям, которые проверяет адаптер. Если уже установили FTCN, последний файл YuNet у вас есть.

```sh
base="$HOME/.cache/deepfake-demo"
lp="$base/liveportrait"
mkdir -p "$lp" "$base/FTCN/checkpoints"
python3.12 -m venv "$lp/venv"
"$lp/venv/bin/python" -m pip install torch==2.15.0 numpy==2.5.5 scipy==1.18.1 PyYAML==6.0.4 onnxruntime==1.32.0 opencv-python-headless==5.1.0.95
git clone --filter=blob:none --sparse https://github.com/KlingAIResearch/LivePortrait.git "$lp/upstream"
git -C "$lp/upstream" sparse-checkout set src/modules src/config
git -C "$lp/upstream" checkout --detach 9b294b3d0536135442ea73cb01e6cb3ca7029dd3
for name in warping_module spade_generator; do
  curl -fL "https://huggingface.co/KwaiVGI/LivePortrait/resolve/main/liveportrait/base_models/$name.pth" -o "$lp/$name.pth" || break
done
for name in live_portrait_feature_extractor live_portrait_motion_extractor; do
  curl -fL "https://huggingface.co/facefusion/models-3.0.0/resolve/main/$name.onnx" -o "$lp/$name.onnx" || break
done
curl -fL https://media.githubusercontent.com/media/opencv/opencv_zoo/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_detection_yunet/face_detection_yunet_2023mar.onnx -o "$base/FTCN/checkpoints/yunet.onnx"
yarn start:liveportrait
```

Служба проверяет веса и выполняет пробную анимацию. Откройте [статус LivePortrait](http://127.0.0.1:8773/health) и проверьте `ready`. [Описание работы адаптера](README.md#liveportrait).

## 4. Ежедневный запуск и первый звонок

- **Браузер.** `yarn start` поднимает студию на [localhost:3003](http://localhost:3003), пытается запустить девять локальных служб и выводит результат по каждой. Подготовленные службы доступны для выбора. Уже запущенные используются повторно. Ctrl+C завершает процессы, которые запустила эта команда.
- **Только интерфейс.** `yarn dev:web` запускает Vite. Откройте адрес вручную. Этот режим подходит для браузерных детекторов и уже работающих служб.
- **Electron.** `yarn start:electron` собирает интерфейс и открывает окно. Для локальных моделей оставьте `yarn start` в первом терминале либо отдельно запустите нужные службы. Подготовьте браузерные модели до сборки.
- **Звонок.** Введите адрес своего доступного Vinteo-сервера и номер конференции с разрешённым гостевым входом. Предзаполненные значения — `msk.vinteo.com` и `1111`. Разрешите камеру и микрофон, начните звонок и проверьте входящее видео. Чтобы анализировать его, выключите детектор, выберите входящий поток и включите детектор снова.

## Если что-то не заработало

| Симптом | Что проверить |
| --- | --- |
| Порт 3003 занят | Завершите предыдущий запуск демки в его терминале. Порт фиксирован, Vite сообщает о конфликте. |
| Модель недоступна в списке | Для браузерной модели повторите команду подготовки и обновите страницу. Для локальной откройте `http://127.0.0.1:<порт>/health`. Если соединение отклонено, запустите отдельную службу из корня, например `yarn start:ftcn`, и прочитайте первую ошибку в терминале. Если служба отвечает, проверьте `ready` и `reason`. После исправления откройте список повторно. |
| Камера пуста или нет оценки | Проверьте разрешение в браузере и ОС, выбранное устройство и исходящее превью. Для теста без звонка выберите исходящий поток, держите одно лицо в кадре. |
| Ошибка загрузки или SHA-256 | Проверьте доступ к источнику и точную версию файла. Облачное хранилище иногда сохраняет HTML-страницу вместо весов. Повторите загрузку из ссылки интеграции. |

Для проверки самого приложения выполните `yarn test` и `yarn build`. Доступность конкретной модели проверяется её службой и обработкой видео в интерфейсе.
