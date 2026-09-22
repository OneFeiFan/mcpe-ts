import { GameSimulation } from '@mcpe/simulation';

const simulation = new GameSimulation({ seed: 12345 });
simulation.start();

console.log('MCPE TS server runtime started');

let lastLoggedTick = 0;

const interval = setInterval(() => {
  simulation.tick();

  if (simulation.clock.tick - lastLoggedTick >= 20) {
    lastLoggedTick = simulation.clock.tick;
    console.log(`tick=${simulation.clock.tick}`);
  }
}, 1000 / simulation.clock.tickRate);

process.on('SIGINT', () => {
  clearInterval(interval);
  console.log('server runtime stopped');
  process.exit(0);
});
