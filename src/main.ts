import './ui/styles.css';
import { Game } from './core/Game';

const game = new Game();
(window as unknown as { game: Game }).game = game;
game.boot().catch((e) => console.error(e));
