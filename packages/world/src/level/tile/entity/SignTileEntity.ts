// 1:1 移植自 src/world/level/tile/entity/SignTileEntity.h 与 SignTileEntity.cpp（S11 阶段 A，部分移植）。
// 部分：getUpdatePacket 构造 SignUpdatePacket（网络未移植）→ DEFERRED(Network)。
// std::string::resize 截断写成 slice（按 UTF-16 码元；告示牌文字只有 ASCII，与按字节截断相同）。
import type { CompoundTag } from '@mcpe/nbt';
import type { Level } from '../../Level';
import { Tile } from '../Tile';
import { TileEntity, TileEntityType } from './TileEntity';
import { TileEntityRendererId } from './TileEntityRendererId';

export class SignTileEntity extends TileEntity {
  static readonly MAX_LINE_LENGTH = 15;
  static readonly NUM_LINES = 4;

  messages: string[] = new Array<string>(SignTileEntity.NUM_LINES).fill('');
  selectedLine = -1;
  private editable = true;

  constructor() {
    super(TileEntityType.Sign);
    this.rendererId = TileEntityRendererId.TR_SIGN_RENDERER;
  }

  override save(tag: CompoundTag): boolean {
    if (!super.save(tag)) return false;
    tag.putString('Text1', this.messages[0]!);
    tag.putString('Text2', this.messages[1]!);
    tag.putString('Text3', this.messages[2]!);
    tag.putString('Text4', this.messages[3]!);
    return true;
  }

  override load(tag: CompoundTag): void {
    this.editable = false;
    super.load(tag);
    this.messages[0] = tag.getString('Text1');
    this.messages[1] = tag.getString('Text2');
    this.messages[2] = tag.getString('Text3');
    this.messages[3] = tag.getString('Text4');
    for (let i = 0; i < SignTileEntity.NUM_LINES; i++)
      if (this.messages[i]!.length > SignTileEntity.MAX_LINE_LENGTH) this.messages[i] = this.messages[i]!.slice(0, SignTileEntity.MAX_LINE_LENGTH);
  }

  shouldSave(): boolean {
    return true;
  }

  isEditable(): boolean {
    return this.editable;
  }

  setEditable(isEditable: boolean): void {
    this.editable = isEditable;
  }

  override getUpdatePacket(): unknown {
    // DEFERRED(Network): return new SignUpdatePacket(x, y, z, messages);
    return null;
  }

  override setLevelAndPos(level: Level | null, x: number, y: number, z: number): void {
    super.setLevelAndPos(level, x, y, z);
    if (level!.getTile(x, y, z) !== Tile.sign.id) {
      this.remove = true;
    }
  }
}
