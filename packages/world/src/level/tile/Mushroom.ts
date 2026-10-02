import { Bush } from "./Bush";
import { Level } from "../Level";
import { Tile } from "./Tile";
import { LevelConstants } from "../LevelConstants";
import type { Random } from "@mcpe/util";

export class Mushroom extends Bush {
    /** C++ Mushroom::Mushroom(int id, int tex) */
    constructor(id: number, tex: number) {
        super(id, tex);
        const ss = 0.2;
        this.setShape(0.5 - ss, 0, 0.5 - ss, 0.5 + ss, ss * 2, 0.5 + ss);
        this.setTicking(true);
    }

    /** C++ Mushroom::tick(Level*, int, int, int, Random*) */
    override tick(level: Level, x: number, y: number, z: number, random: Random): void {
        if (random.nextInt(25) === 0) {
            const r = 4;
            let max = 5;
            for (let xx = x - r; xx <= x + r; xx++) {
                for (let zz = z - r; zz <= z + r; zz++) {
                    for (let yy = y - 1; yy <= y + 1; yy++) {
                        if (level.getTile(xx, yy, zz) === this.id && --max <= 0) return;
                    }
                }
            }

            let x2 = x + random.nextInt(3) - 1;
            let y2 = y + random.nextInt(2) - random.nextInt(2);
            let z2 = z + random.nextInt(3) - 1;

            for (let i = 0; i < 4; i++) {
                if (level.isEmptyTile(x2, y2, z2) && this.canSurvive(level, x2, y2, z2)) {
                    x = x2;
                    y = y2;
                    z = z2;
                }
                x2 = x + random.nextInt(3) - 1;
                y2 = y + random.nextInt(2) - random.nextInt(2);
                z2 = z + random.nextInt(3) - 1;
            }

            if (level.isEmptyTile(x2, y2, z2) && this.canSurvive(level, x2, y2, z2)) {
                level.setTile(x2, y2, z2, this.id);
            }
        }
    }

    /** C++ Mushroom::mayPlace(Level*, int, int, int, unsigned char) */
    override mayPlace(level: Level, x: number, y: number, z: number): boolean;
    override mayPlace(level: Level, x: number, y: number, z: number, face: number): boolean;
    override mayPlace(level: Level, x: number, y: number, z: number, face?: number): boolean {
        return super.mayPlace(level, x, y, z, face!) && this.canSurvive(level, x, y, z);
    }

    /** C++ Mushroom::mayPlaceOn(int tile) — public in Mushroom (widened from Bush's protected) */
    override mayPlaceOn(tile: number): boolean {
        return Tile.solid[tile] === true;
    }

    /** C++ Mushroom::canSurvive(Level*, int, int, int) */
    override canSurvive(level: Level, x: number, y: number, z: number): boolean {
        if (y < 0 || y >= LevelConstants.LEVEL_HEIGHT) return false;

        const below = level.getTile(x, y - 1, z);
        return level.getRawBrightness(x, y, z) < 13 && this.mayPlaceOn(below);
    }
}