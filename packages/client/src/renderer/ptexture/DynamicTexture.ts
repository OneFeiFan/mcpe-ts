import { Tile } from '@mcpe/world';
import type { Textures } from '../Textures';
import { Mth } from '@mcpe/util';

export abstract class DynamicTexture {
  public readonly tex: number;
  public replicate = 1;
  public readonly pixels = new Uint8Array(16 * 16 * 4);

  constructor(tex: number) {
    this.tex = tex;
    this.pixels.fill(0);
  }

  abstract tick(): void;

  bindTexture(tex: Textures): void {
    tex.loadAndBindTexture("terrain.png");
  }
}

export class WaterTexture extends DynamicTexture {
  private current = new Float32Array(256);
  private next = new Float32Array(256);
  private heat = new Float32Array(256);
  private heata = new Float32Array(256);

  constructor() {
    super(Tile.water.tex);
  }

  tick(): void {
    const { heat, heata, pixels } = this;

    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        let pow = 0;
        for (let xx = x - 1; xx <= x + 1; xx++) {
          const xi = xx & 15;
          const yi = y & 15;
          pow += this.current[xi + yi * 16]!;
        }
        this.next[x + y * 16] = pow / 3.3 + heat[x + y * 16]! * 0.8;
      }
    }

    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        heat[x + y * 16]! += heata[x + y * 16]! * 0.05;
        if (heat[x + y * 16]! < 0) heat[x + y * 16] = 0;

        heata[x + y * 16]! -= 0.1;
        if (Mth.random() < 0.05) {
          heata[x + y * 16] = 0.5;
        }
      }
    }

    const tmp = this.next;
    this.next = this.current;
    this.current = tmp;

    for (let i = 0; i < 256; i++) {
      let pow = this.current[i]!;
      if (pow > 1) pow = 1;
      if (pow < 0) pow = 0;

      const pp = pow * pow;
      const r = (32 + pp * 32) | 0;
      const g = (50 + pp * 64) | 0;
      const b = 255;
      const a = (146 + pp * 50) | 0;

      pixels[i * 4 + 0] = r;
      pixels[i * 4 + 1] = g;
      pixels[i * 4 + 2] = b;
      pixels[i * 4 + 3] = a;
    }
  }
}

export class WaterSideTexture extends DynamicTexture {
  private _tickCount = 0;
  private current = new Float32Array(256);
  private next = new Float32Array(256);
  private heat = new Float32Array(256);
  private heata = new Float32Array(256);

  constructor() {
    super(Tile.water.tex + 1);
    this.replicate = 2;
  }

  tick(): void {
    ++this._tickCount;
    const { heat, heata, pixels } = this;

    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        let pow = 0;
        for (let xx = y - 2; xx <= y; xx++) {
          const xi = x & 15;
          const yi = xx & 15;
          pow += this.current[xi + yi * 16]!;
        }
        this.next[x + y * 16] = pow / 3.2 + heat[x + y * 16]! * 0.8;
      }
    }

    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        heat[x + y * 16]! += heata[x + y * 16]! * 0.05;
        if (heat[x + y * 16]! < 0) heat[x + y * 16] = 0;

        heata[x + y * 16]! -= 0.3;
        if (Mth.random() < 0.2) {
          heata[x + y * 16] = 0.5;
        }
      }
    }

    const tmp = this.next;
    this.next = this.current;
    this.current = tmp;

    for (let i = 0; i < 256; i++) {
      let pow = this.current[(i - this._tickCount * 16) & 255]!;
      if (pow > 1) pow = 1;
      if (pow < 0) pow = 0;

      const pp = pow * pow;
      const r = (32 + pp * 32) | 0;
      const g = (50 + pp * 64) | 0;
      const b = 255;
      const a = (146 + pp * 50) | 0;

      pixels[i * 4 + 0] = r;
      pixels[i * 4 + 1] = g;
      pixels[i * 4 + 2] = b;
      pixels[i * 4 + 3] = a;
    }
  }
}

export class LavaTexture extends DynamicTexture {
  private current = new Float32Array(256);
  private next = new Float32Array(256);
  private heat = new Float32Array(256);
  private heata = new Float32Array(256);

  constructor() {
    super(Tile.lava.tex);
  }

  tick(): void {
    const { heat, heata, pixels } = this;

    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        let pow = 0;
        const xxo = (Mth.sin(y * Mth.PI * 2.0 / 16.0) * 1.2) | 0;
        const yyo = (Mth.sin(x * Mth.PI * 2.0 / 16.0) * 1.2) | 0;

        for (let xx = x - 1; xx <= x + 1; xx++) {
          for (let yy = y - 1; yy <= y + 1; yy++) {
            const xi = (xx + xxo) & 15;
            const yi = (yy + yyo) & 15;
            pow += this.current[xi + yi * 16]!;
          }
        }

        this.next[x + y * 16] =
          pow / 10.0 +
          (heat[((x + 0) & 15) + ((y + 0) & 15) * 16]! +
            heat[((x + 1) & 15) + ((y + 0) & 15) * 16]! +
            heat[((x + 1) & 15) + ((y + 1) & 15) * 16]! +
            heat[((x + 0) & 15) + ((y + 1) & 15) * 16]!) / 4.0 * 0.8;

        heat[x + y * 16]! = heat[x + y * 16]! + heata[x + y * 16]! * 0.01;
        if (heat[x + y * 16]! < 0.0) {
          heat[x + y * 16] = 0.0;
        }

        heata[x + y * 16]! = heata[x + y * 16]! - 0.06;
        if (Mth.random() < 0.005) {
          heata[x + y * 16]! = 1.5;
        }
      }
    }

    const tmp = this.next;
    this.next = this.current;
    this.current = tmp;

    for (let i = 0; i < 256; i++) {
      let pow = this.current[i]! * 2.0;
      if (pow > 1) pow = 1;
      if (pow < 0) pow = 0;

      const pp = pow * pow;
      const r = (pow * 100.0 + 155.0) | 0;
      const g = (pp * 255.0) | 0;
      const b = (pp * pp * 128.0) | 0;

      pixels[i * 4 + 0] = r;
      pixels[i * 4 + 1] = g;
      pixels[i * 4 + 2] = b;
      pixels[i * 4 + 3] = 255; // C++: -1 -> unsigned char 255
    }
  }
}

export class LavaSideTexture extends DynamicTexture {
  private _tickCount = 0;
  private current = new Float32Array(256);
  private next = new Float32Array(256);
  private heat = new Float32Array(256);
  private heata = new Float32Array(256);

  constructor() {
    super(Tile.lava.tex + 1);
    this.replicate = 2;
  }

  tick(): void {
    ++this._tickCount;
    const { heat, heata, pixels } = this;

    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        let pow = 0;
        const yl = (Mth.sin(y * Mth.PI * 2.0 / 16.0) * 1.2) | 0;
        const xl = (Mth.sin(x * Mth.PI * 2.0 / 16.0) * 1.2) | 0;

        for (let yy = x - 1; yy <= x + 1; yy++) {
          for (let xx = y - 1; xx <= y + 1; xx++) {
            const xi = (yy + yl) & 15;
            const yi = (xx + xl) & 15;
            pow += this.current[xi + yi * 16]!;
          }
        }

        this.next[x + y * 16] =
          pow / 10.0 +
          (heat[((x + 0) & 15) + ((y + 0) & 15) * 16]! +
            heat[((x + 1) & 15) + ((y + 0) & 15) * 16]! +
            heat[((x + 1) & 15) + ((y + 1) & 15) * 16]! +
            heat[((x + 0) & 15) + ((y + 1) & 15) * 16]!) / 4.0 * 0.8;

        heat[x + y * 16]! = heat[x + y * 16]! + heata[x + y * 16]! * 0.01;
        if (heat[x + y * 16]! < 0.0) {
          heat[x + y * 16]! = 0.0;
        }

        heata[x + y * 16]! = heata[x + y * 16]! - 0.06;
        if (Mth.random() < 0.005) {
          heata[x + y * 16]! = 1.5;
        }
      }
    }

    const tmp = this.next;
    this.next = this.current;
    this.current = tmp;

    for (let i = 0; i < 256; i++) {
      let pow =
        this.current[
          (i - Math.floor(this._tickCount / 3) * 16) & 255
        ]! * 2.0;

      if (pow > 1) pow = 1;
      if (pow < 0) pow = 0;

      const r = (pow * 100.0 + 155.0) | 0;
      const g = (pow * pow * 255.0) | 0;
      const b = (pow * pow * pow * pow * 128.0) | 0;

      pixels[i * 4 + 0] = r;
      pixels[i * 4 + 1] = g;
      pixels[i * 4 + 2] = b;
      pixels[i * 4 + 3] = 255; // C++: -1 -> unsigned char 255
    }
  }
}

export class FireTexture extends DynamicTexture {
  private current = new Float32Array(16 * 20);
  private next = new Float32Array(16 * 20);
  private heat = new Float32Array(16 * 20);
  private heata = new Float32Array(16 * 20);

  constructor(id: number) {
    super(Tile.fire.tex + id * 16);

    // C++ 只初始化了前 256 个，这里全部归零，避免未初始化数据导致不确定
    this.current.fill(0);
    this.next.fill(0);
    this.heat.fill(0);
    this.heata.fill(0);
  }

  tick(): void {
    const { pixels } = this;

    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 20; y++) {
        let count = 18;
        let pow = this.current[x + ((y + 1) % 20) * 16]! * count;

        for (let xx = x - 1; xx <= x + 1; xx++) {
          for (let yy = y; yy <= y + 1; yy++) {
            if (xx >= 0 && yy >= 0 && xx < 16 && yy < 20) {
              pow += this.current[xx + yy * 16]!;
            }
            count++;
          }
        }

        this.next[x + y * 16] = pow / (count * 1.06);

        if (y >= 19) {
          this.next[x + y * 16] =
            Mth.random() * Mth.random() * Mth.random() * 4.0 +
            Mth.random() * 0.1 +
            0.2;
        }
      }
    }

    const tmp = this.next;
    this.next = this.current;
    this.current = tmp;

    for (let i = 0; i < 256; i++) {
      let pow = this.current[i]! * 1.8;
      if (pow > 1.0) pow = 1.0;
      if (pow < 0.0) pow = 0.0;

      const r = (pow * 155.0 + 100.0) | 0;
      const g = (pow * pow * 255.0) | 0;
      const b = (pow ** 10 * 255.0) | 0;

      let a = 255;
      if (pow < 0.5) {
        a = 0;
      }

      pixels[i * 4 + 0] = r;
      pixels[i * 4 + 1] = g;
      pixels[i * 4 + 2] = b;
      pixels[i * 4 + 3] = a;
    }
  }
}
