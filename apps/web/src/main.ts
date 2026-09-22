import { GameSimulation } from '@mcpe/simulation';

const simulation = new GameSimulation({ seed: 12345 });
const status = document.querySelector<HTMLParagraphElement>('#status');
const tickButton = document.querySelector<HTMLButtonElement>('#tick');
const ticks20Button = document.querySelector<HTMLButtonElement>('#ticks20');

function updateStatus(): void {
  if (status) {
    status.textContent = `Runtime OK · tick=${simulation.clock.tick}`;
  }
}

tickButton?.addEventListener('click', () => {
  simulation.tick();
  updateStatus();
});

ticks20Button?.addEventListener('click', () => {
  simulation.runTicks(20);
  updateStatus();
});

updateStatus();
