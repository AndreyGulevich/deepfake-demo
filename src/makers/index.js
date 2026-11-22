import {factory} from '../catalog.js';
import ghost from './ghostv2/index.js';
import server from './deepfacelive/index.js';
import deepLiveCam from './deeplivecam/index.js';
export default factory([server,deepLiveCam,ghost]);
