import { Tag, TAG_Compound } from './Tag';
import { CompoundTag } from './CompoundTag';
import type { IDataInput, IDataOutput } from '@mcpe/util';

export class NbtIo {
  static read(dis: IDataInput): CompoundTag | null {
    const tag = Tag.readNamedTag(dis);
    if (tag !== null && tag.getId() === TAG_Compound) {
      return tag as CompoundTag;
    }
    return null;
  }

  static write(tag: CompoundTag | null, dos: IDataOutput): boolean {
    if (tag === null) return false;
    Tag.writeNamedTag(tag, dos);

    // ====================================================================
    // 复刻 C++ 原代码的 bug：无论写入是否成功，都返回 false。
    //
    // 如果调用方忽略返回值，可以改成 return true。
    // 如果调用方依赖返回值判断成败，必须保持 return false。
    //
    // 建议：先在 C++ 侧搜索 NbtIo::write 的调用点，确认返回值是否被使用。
    // ====================================================================
    return false;
  }
}
