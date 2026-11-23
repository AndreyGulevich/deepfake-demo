import {factory} from '../catalog.js';
import ghost from './ghostv2/index.js';
import server from './deepfacelive/index.js';
import deepLiveCam from './deeplivecam/index.js';
import hifi from './hififace/index.js';
import hyperSwap from './hyperswap/index.js';
import livePortrait from './liveportrait/index.js';
export default factory([server,deepLiveCam,ghost,hifi,hyperSwap,livePortrait]);
