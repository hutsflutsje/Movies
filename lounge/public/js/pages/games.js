// Games hub. The catalog lives in /games/games.json, so adding a game = adding one entry there.
import { addHistory, emptyState, errorView, h, icon, setTitle, skeleton } from '../lib.js';
import { gameCard } from '../cards.js';

let catalog = null;

export async function loadGames() {
  if (catalog) return catalog;
  const res = await fetch('/games/games.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load the games list');
  catalog = await res.json();
  return catalog;
}

export async function render(view, route) {
  const id = route.parts[0];
  if (id) return renderGame(view, id);

  setTitle('Games');
  const grid = h('div', { class: 'grid grid-game' }, skeleton('game', 6));
  view.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Games'), h('p', null, 'Original browser games that run right on this site. Keyboard, mouse and touch all work.'))),
    grid,
  );
  try {
    const list = await loadGames();
    grid.replaceChildren(...list.map(gameCard));
    if (!list.length) grid.append(emptyState('No games yet', 'Add some to public/games/games.json.'));
  } catch (err) {
    grid.replaceChildren(errorView(err, () => location.reload()));
  }
}

async function renderGame(view, id) {
  let game;
  try {
    game = (await loadGames()).find((g) => g.id === id);
  } catch (err) {
    view.append(errorView(err, () => location.reload()));
    return;
  }
  if (!game) {
    view.append(emptyState('Game not found', null, h('a', { class: 'btn btn-ghost', href: '#/games' }, 'All games')));
    return;
  }
  setTitle(game.title);
  addHistory({ kind: 'game', id: game.id, title: game.title, subtitle: 'Game', thumb: game.cover });

  const external = game.type === 'embed';
  const frame = h('iframe', {
    src: game.src,
    title: game.title,
    allow: 'fullscreen; autoplay; gamepad; screen-wake-lock',
    allowfullscreen: true,
    ...(external ? { sandbox: 'allow-scripts allow-same-origin allow-popups allow-forms allow-pointer-lock', referrerpolicy: 'strict-origin-when-cross-origin' } : {}),
  });
  frame.addEventListener('load', () => {
    try {
      frame.focus();
      frame.contentWindow?.focus();
    } catch {
      /* cross-origin */
    }
  });
  const wrap = h('div', { class: 'game-frame-wrap' }, frame);

  const fullscreen = () => {
    const el = wrap;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => window.open(game.src, '_blank'));
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else window.open(game.src, '_blank');
  };

  view.append(
    h(
      'div',
      { class: 'game-stage' },
      h(
        'div',
        { class: 'game-bar' },
        h('a', { class: 'icon-btn', href: '#/games', 'aria-label': 'All games', title: 'All games' }, icon('back', 18)),
        h('h1', null, game.title),
        h('button', { class: 'btn btn-ghost btn-sm', 'aria-label': 'Restart', onclick: () => (frame.src = game.src) }, icon('reload', 16), h('span', { class: 'btn-label' }, 'Restart')),
        h('button', { class: 'btn btn-primary btn-sm', 'aria-label': 'Fullscreen', onclick: fullscreen }, icon('fullscreen', 16), h('span', { class: 'btn-label' }, 'Fullscreen')),
      ),
      wrap,
      game.controls && h('p', { class: 'game-help' }, h('strong', null, 'Controls: '), game.controls),
    ),
  );

  const onKey = (e) => {
    // Stop arrow keys/space from scrolling the page while playing.
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code) && !e.target.closest('input, textarea, select')) e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
