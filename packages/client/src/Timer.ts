// 1:1 移植自 src/client/Timer.h
import { getTimeMs } from '@mcpe/platform';

export class Timer {
  public ticksPerSecond: number;
  public ticks: number;
  public a: number;
  public timeScale: number;
  public passedTime: number;

  private static readonly MAX_TICKS_PER_UPDATE: number = 10;
  private lastTime: number;
  private lastMs: number;
  private lastMsSysTime: number;
  private adjustTime: number;

  public constructor(ticksPerSecond: number) {
    this.ticksPerSecond = ticksPerSecond;
    this.adjustTime = 1.0;
    this.timeScale = 1.0;
    this.passedTime = 0;
    this.ticks = 0;
    this.a = 0;

    this.lastMs = getTimeMs();
    this.lastMsSysTime = this.lastMs;
    this.lastTime = this.lastMs / 1000.0;
  }

  public advanceTime(): void {
    const nowMs = getTimeMs();
    let passedMs = nowMs - this.lastMs;
    const msSysTime = nowMs;
    if (passedMs > 1000) {
      let passedMsSysTime = msSysTime - this.lastMsSysTime;
      if (passedMsSysTime === 0) {
        passedMs = passedMsSysTime = 1;
      }
      const adjustTimeT = passedMs / passedMsSysTime;
      this.adjustTime += (adjustTimeT - this.adjustTime) * 0.2;
      this.lastMs = nowMs;
      this.lastMsSysTime = msSysTime;
    }
    if (passedMs < 0) {
      this.lastMs = nowMs;
      this.lastMsSysTime = msSysTime;
    }
    const now = msSysTime / 1000.0;
    let passedSeconds = (now - this.lastTime) * this.adjustTime;
    this.lastTime = now;
    if (passedSeconds < 0) passedSeconds = 0;
    if (passedSeconds > 1) passedSeconds = 1;
    this.passedTime += passedSeconds * this.timeScale * this.ticksPerSecond;
    this.ticks = Math.trunc(this.passedTime);
    this.passedTime -= this.ticks;
    if (this.ticks > Timer.MAX_TICKS_PER_UPDATE) this.ticks = Timer.MAX_TICKS_PER_UPDATE;
    this.a = this.passedTime;
  }

  // Advances time the max number of ticks per second.
  public advanceTimeQuickly(): void {
    const passedSeconds = Timer.MAX_TICKS_PER_UPDATE / this.ticksPerSecond;
    this.passedTime += passedSeconds * this.timeScale * this.ticksPerSecond;
    this.ticks = Math.trunc(this.passedTime);
    this.passedTime -= this.ticks;
    this.a = this.passedTime;
    this.lastMs = getTimeMs();
    this.lastMsSysTime = this.lastMs;
  }

  public skipTime(): void {
    const nowMs = getTimeMs(); //System.currentTimeMillis();
    let passedMs = nowMs - this.lastMs;
    const msSysTime = nowMs; //System.nanoTime() / 1000000;

    if (passedMs > 1000) {
      let passedMsSysTime = msSysTime - this.lastMsSysTime;
      if (passedMsSysTime == 0) passedMs = passedMsSysTime = 1;

      let adjustTimeT = passedMs / passedMsSysTime;
      this.adjustTime += (adjustTimeT - this.adjustTime) * 0.2;

      this.lastMs = nowMs;
      this.lastMsSysTime = msSysTime;
    }
    if (passedMs < 0) {
      this.lastMs = nowMs;
      this.lastMsSysTime = msSysTime;
    }

    const now = msSysTime / 1000;
    let passedSeconds = (now - this.lastTime) * this.adjustTime;
    this.lastTime = now;

    if (passedSeconds < 0) passedSeconds = 0;
    if (passedSeconds > 1) passedSeconds = 1;

    this.passedTime += passedSeconds * this.timeScale * this.ticksPerSecond;

    this.ticks = 0;
    // 何意味
    // if (this.ticks > Timer.MAX_TICKS_PER_UPDATE) this.ticks = Timer.MAX_TICKS_PER_UPDATE;
    // this.passedTime -= this.ticks;
  }
}
