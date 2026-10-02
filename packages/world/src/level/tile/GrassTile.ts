import { Random } from "@mcpe/util";
import { Material } from "../material/Material";
import { GrassColor } from "../GrassColor";
import { Level } from "../Level";
import { type LevelSource } from "../LevelSource";
import { Tile } from "./Tile";

export class GrassTile extends Tile {
    static readonly MIN_BRIGHTNESS = 4;

    constructor(id: number) {
        super(id, Material.dirt);
        this.tex = 3;
        this.setTicking(true);
    }

    /** C++ getTexture(int face, int data)。GrassTile 没有重写 getTexture(int face)：那个仍是 Tile 的版本，返回 tex（= 3） */
    override getTextureForData(face: number, _data: number): number {
        if (face === 1) return 0;
        if (face === 0) return 2;
        return 3;
    }

    /** C++ getTexture(LevelSource* level, int x, int y, int z, int face) */
    override getTextureAt(level: LevelSource, x: number, y: number, z: number, face: number): number {
        if (face === 1) return 0;
        if (face === 0) return 2;
        const above = level.getMaterial(x, y + 1, z);
        if (above === Material.topSnow || above === Material.snow) return 4 * 16 + 4;
        return 3;
    }

    override getColor(level: LevelSource, x: number, y: number, z: number): number {
        if (!GrassColor.useTint) {
            return 0x339933;
        }

        const bs = level.getBiomeSource()!;
        bs.getBiomeBlock(x, z, 1, 1);
        const temp = bs.temperatures![0];
        const rain = bs.downfalls![0];

        return GrassColor.get(temp!, rain!);
    }

    override tick(level: Level, x: number, y: number, z: number, random: Random): void {
        if (level.isClientSide) return;

        if (level.getRawBrightness(x, y + 1, z) < GrassTile.MIN_BRIGHTNESS &&
            level.getMaterial(x, y + 1, z)!.blocksLight()) {
            if (random.nextInt(4) !== 0) return;
            level.setTile(x, y, z, Tile.dirt.id);
        } else {
            if (level.getRawBrightness(x, y + 1, z) >= (Level.MAX_BRIGHTNESS - 6)) {
                const xt = x + random.nextInt(3) - 1;
                const yt = y + random.nextInt(5) - 3;
                const zt = z + random.nextInt(3) - 1;
                if (level.getTile(xt, yt, zt) === Tile.dirt.id &&
                    level.getRawBrightness(xt, yt + 1, zt) >= GrassTile.MIN_BRIGHTNESS &&
                    !level.getMaterial(xt, yt + 1, zt)!.blocksLight()) {
                    level.setTile(xt, yt, zt, Tile.grass.id);
                }
            }
        }
    }

    override getResource(data: number, random: Random): number {
        return Tile.dirt.getResource(0, random);
    }
}