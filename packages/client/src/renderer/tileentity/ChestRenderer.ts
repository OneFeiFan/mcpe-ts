/**
 * 1:1 移植自 src/client/renderer/tileentity/ChestRenderer.h 与 ChestRenderer.cpp（带开盖动画的箱子模型）。
 * ⚠ 原版行为：这一版 C++ 里**没有任何方块实体使用它**——ChestTileEntity 构造函数里的 `rendererId = TR_CHEST_RENDERER;`
 *   被注释掉了（ChestTileEntity.cpp:16），ChestTile 的 `SHAPE_ENTITYTILE_ANIMATED` 也被注释掉（ChestTile.cpp:29）。
 *   世界里的箱子按普通方块画（ChestTile 的六面贴图）。这里照 C++ 移植并在分派器里注册，但正常游戏中不会被调用。
 *   它用的 item/chest.png 不在材质包里，也就没有加进预加载表。
 */
import { Mth } from '@mcpe/util';
import { type ChestTile, type ChestTileEntity, type TileEntity } from '@mcpe/world';
import { ChestModel } from '../../model/ChestModel';
import {
  glColor4f2,
  glPopMatrix2,
  glPushMatrix2,
  glRotatef2,
  glScalef2,
  glTranslatef2,
} from '../gles';
import { TileEntityRenderer } from './TileEntityRenderer';

const f = Math.fround;

export class ChestRenderer extends TileEntityRenderer {
  private chestModel = new ChestModel();

  render(entity: TileEntity, x: number, y: number, z: number, a: number): void {
    const chest = entity as ChestTileEntity;
    let data = 0;
    if (chest.level) {
      const tile = chest.getTile();
      data = chest.getData();
      if (tile !== null && data === 0) {
        (tile as ChestTile).recalcLockDir(chest.level, chest.x, chest.y, chest.z);
        data = chest.getData();
      }
      chest.checkNeighbors();
    }
    if (chest.n !== null || chest.w !== null) return;
    const model = this.chestModel;
    this.bindTexture('item/chest.png');
    glPushMatrix2();
    glColor4f2(1, 1, 1, 1);
    glTranslatef2(x, y + 1, z + 1);
    glScalef2(1, -1, -1);
    glTranslatef2(0.5, 0.5, 0.5);
    let rot = 0;
    if (data === 2) rot = 180;
    if (data === 3) rot = 0;
    if (data === 4) rot = 90;
    if (data === 5) rot = -90;
    if (data === 2 && chest.e !== null) {
      glTranslatef2(1, 0, 0);
    }
    if (data === 5 && chest.s !== null) {
      glTranslatef2(0, 0, -1);
    }
    glRotatef2(rot, 0, 1, 0);
    glTranslatef2(-0.5, -0.5, -0.5);
    let open = f(chest.oOpenness + (chest.openness - chest.oOpenness) * a);
    // 原样保留：上面 n、w 不为空时已经 return，这两段在 C++ 里也走不到（类型收窄后 TS 认为它们是 never，经一次重新读取保留代码）
    const nb = (chest as ChestTileEntity).n as ChestTileEntity | null;
    const wb = (chest as ChestTileEntity).w as ChestTileEntity | null;
    if (nb !== null) {
      const open2 = f(nb.oOpenness + (nb.openness - nb.oOpenness) * a);
      if (open2 > open) open = open2;
    }
    if (wb !== null) {
      const open2 = f(wb.oOpenness + (wb.openness - wb.oOpenness) * a);
      if (open2 > open) open = open2;
    }
    open = f(1 - open);
    open = f(1 - f(f(open * open) * open));
    model.lid.xRot = -f(f(open * Mth.PI) / 2);
    model.render();
    glPopMatrix2();
    glColor4f2(1, 1, 1, 1);
  }
}
