import {factory} from '../catalog.js';
import client from './classifier/index.js';
import server from './ftcn/index.js';
import altFreezing from './altfreezing/index.js';
import sbi from './sbi/index.js';
import mtl from './mtl/index.js';
export default factory([client, server, mtl, altFreezing, sbi]);
