// 1:1 移植自 src/client/renderer/Lighting.h 与 Lighting.cpp：设置 GL 光照状态；光照由 GLES1 的着色器计算（见 gl/GLES1.ts）。
import type { Minecraft } from '../Minecraft';
import { OptionId } from '../Options';
import {
  GL_AMBIENT,
  GL_COLOR_MATERIAL,
  GL_DIFFUSE,
  GL_FLAT,
  GL_LIGHT0,
  GL_LIGHT1,
  GL_LIGHT_MODEL_AMBIENT,
  GL_LIGHTING,
  GL_NORMALIZE,
  GL_POSITION,
  GL_SPECULAR,
  glDisable,
  glEnable,
  glLightfv,
  glLightModelfv,
  glShadeModel,
} from './gles';

const f = Math.fround;

export class Lighting {
  static turnOff(): void {
    glDisable(GL_LIGHTING);
    glDisable(GL_LIGHT0);
    glDisable(GL_LIGHT1);
    glDisable(GL_COLOR_MATERIAL);
  }

  static turnOn(minecraft: Minecraft): void {
    if (!minecraft.options.getBooleanValue(OptionId.OPTIONS_NORMAL_LIGHTING)) {
      // if normal lighting is false, then just dont use the lighting system at all like in vanilla - shred
      Lighting.turnOff();
      return;
    }
    glEnable(GL_NORMALIZE);
    glEnable(GL_LIGHTING);
    glEnable(GL_LIGHT0);
    glEnable(GL_LIGHT1);
    glEnable(GL_COLOR_MATERIAL);
    const a = f(0.4);
    const d = f(0.6);
    const s = f(0.0);
    const lightmodel_ambient = [a, a, a, 1.0];
    const diffuse = [d, d, d, 1.0];
    const ambient = [0.0, 0.0, 0.0, 1.0];
    const specular = [s, s, s, 1.0];
    const pos0 = [f(0.16169041989141428), f(0.8084520874101966), f(-0.5659164515496377), 0.0];
    glLightfv(GL_LIGHT0, GL_POSITION, pos0);
    glLightfv(GL_LIGHT0, GL_DIFFUSE, diffuse);
    glLightfv(GL_LIGHT0, GL_AMBIENT, ambient);
    glLightfv(GL_LIGHT0, GL_SPECULAR, specular);
    const pos1 = [f(-0.16169041989141428), f(0.8084520874101966), f(0.5659164515496377), 0.0];
    glLightfv(GL_LIGHT1, GL_POSITION, pos1);
    glLightfv(GL_LIGHT1, GL_DIFFUSE, diffuse);
    glLightfv(GL_LIGHT1, GL_AMBIENT, ambient);
    glLightfv(GL_LIGHT1, GL_SPECULAR, specular);
    glShadeModel(GL_FLAT);
    glLightModelfv(GL_LIGHT_MODEL_AMBIENT, lightmodel_ambient);
  }
}
