import './styles/main.css';
import './styles/planetGen.css';
import { createGame } from './core/game.js';
import { createPlanetGeneratorPage } from './planetGen/page.js';

const app = document.getElementById('app');
const isPlanetGeneratorRoute = window.location.pathname.replace(/\/+$/, '') === '/planet-gen';

if (isPlanetGeneratorRoute) {
  document.body.classList.add('planet-gen-page');
  createPlanetGeneratorPage(app);
} else {
  document.body.classList.remove('planet-gen-page');
  const game = createGame(app);
  await game.start();
}
