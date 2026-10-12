import { AudioEngine } from './AudioEngine';
import { Sfx } from './Sfx';
import { Music } from './Music';
import { EngineSound } from './EngineSound';

export class Audio {
  readonly engine = new AudioEngine();
  readonly sfx = new Sfx(this.engine);
  readonly music = new Music(this.engine);
  readonly car = new EngineSound(this.engine);
}
