// 1:1 移植自 src/world/entity/ai/Sensing.h（任务单 H11）：每刻清空的“看得见/看不见”缓存，避免同一刻对同一目标重复做视线检测
import type { Entity } from '../Entity';
import type { Mob } from '../Mob';

export class Sensing {
  private mob: Mob;
  private seen = new Set<Entity>();
  private unseen = new Set<Entity>();

  constructor(mob: Mob) {
    this.mob = mob;
  }

  tick(): void {
    this.seen.clear();
    this.unseen.clear();
  }

  canSee(target: Entity): boolean {
    if (this.seen.has(target)) return true;
    if (this.unseen.has(target)) return false;
    const canSee = this.mob.canSee(target);
    if (canSee) this.seen.add(target);
    else this.unseen.add(target);
    return canSee;
  }
}
