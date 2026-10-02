// ADAPTED(ESM)：把全部标签类注入 Tag 的工厂（见 Tag.ts 顶部说明）。由 index.ts 第一行导入。
import { ByteArrayTag } from "./ByteArrayTag";
import { ByteTag } from "./ByteTag";
import { CompoundTag } from "./CompoundTag";
import { DoubleTag } from "./DoubleTag";
import { EndTag } from "./EndTag";
import { FloatTag } from "./FloatTag";
import { IntTag } from "./IntTag";
import { ListTag } from "./ListTag";
import { LongTag } from "./LongTag";
import { ShortTag } from "./ShortTag";
import { StringTag } from "./StringTag";
import { registerTagClasses } from "./Tag";

registerTagClasses({ EndTag, ByteTag, ShortTag, IntTag, LongTag, FloatTag, DoubleTag, ByteArrayTag, StringTag, ListTag, CompoundTag });
