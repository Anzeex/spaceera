import './styles/main.css';
import { createGame } from './core/game.js';

const game = createGame(document.getElementById('app'));
game.start();