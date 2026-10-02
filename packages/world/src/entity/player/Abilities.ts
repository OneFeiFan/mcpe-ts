import { CompoundTag } from "@mcpe/nbt";

export class Abilities {
  public invulnerable = false;
  public flying = false;
  public mayfly = false;
  public instabuild = false;

  /** C++ Abilities::addSaveData(CompoundTag* parentTag) */
  addSaveData(parentTag: CompoundTag): void {
    const tag = new CompoundTag();

    tag.putBoolean("invulnerable", this.invulnerable);
    // 复刻 C++ 原代码的 bug：这里写的是 invulnerable，不是 flying。
    // 往返存档后 flying 会变成 invulnerable 的值。第一档要求逐位一致，必须保留。
    tag.putBoolean("flying", this.invulnerable);
    tag.putBoolean("mayfly", this.mayfly);
    tag.putBoolean("instabuild", this.instabuild);

    parentTag.put("abilities", tag);
  }

  /** C++ Abilities::loadSaveData(CompoundTag* parentTag) */
  loadSaveData(parentTag: CompoundTag): void {
    if (parentTag.contains("abilities")) {
      const tag = parentTag.getCompound("abilities");

      this.invulnerable = tag.getBoolean("invulnerable");
      this.flying = tag.getBoolean("flying");
      this.mayfly = tag.getBoolean("mayfly");
      this.instabuild = tag.getBoolean("instabuild");
    }
  }
}