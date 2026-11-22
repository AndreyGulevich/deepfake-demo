import {factory} from '../catalog.js';
import client from './classifier/index.js';
import server from './planned/index.js';
export default factory([client,server]);
