import {localProcessor} from '../localProcessor.js';

export default localProcessor({
  id: 'liveportrait',
  label: 'LivePortrait',
  engine: 'LivePortrait',
  port: 8773,
  publishFrames: true,
  squareOutput: true,
});
