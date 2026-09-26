import { Mth } from "./Mth";

export class Color {

    private colour: number;

    // 重载签名 1：对应 0-255 整数模式 / 0.0-1.0 浮点模式
    constructor(r: number, g: number, b: number);
    // 重载签名 2：内部使用，用于强制指定模式
    constructor(r: number, g: number, b: number, forceInt: boolean);
    /**
      * 智能推断构造函数，用法与 C++ 相同:
      * new Color(1.0, 0.5, 0.0) -> 浮点模式
      * new Color(255, 128, 0)   -> 整型模式
      * 
      * @param _forceInt 仅供内部方法使用的隐藏参数，外部调用可忽略
      */
    constructor(r: number, g: number, b: number, forceInt?: boolean) {
        let isFloat: boolean;

        if (forceInt !== undefined) {
            isFloat = !forceInt;
        } else {
            // 只要带有小数，或者全在 0~1 范围内，就判定为 float 模式
            isFloat =
                !Number.isInteger(r) ||
                !Number.isInteger(g) ||
                !Number.isInteger(b) ||
                (r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1);
        }

        if (isFloat) {
            if (r < 0.0 || r > 1.0 || g < 0.0 || g > 1.0 || b < 0.0 || b > 1.0) {
                throw new Error("IllegalArgumentException: r, g, b values must be between 0.0 and 1.0, inclusive");
            }
            this.colour = ((0xFF << 24) | (Math.trunc(r * 255) << 16) | (Math.trunc(g * 255) << 8) | Math.trunc(b * 255));
        } else {
            this.colour = ((0xFF << 24) | ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF));
        }
    }

    public static getHSBColor(hue: number, saturation: number, brightness: number): Color {
        let r = 0, g = 0, b = 0;

        if (saturation === 0) {
            r = g = b = Math.trunc(brightness * 255.0 + 0.5);
        } else {
            const h = (hue - Mth.floor(hue)) * 6.0;
            const f = h - Mth.floor(h);
            const p = brightness * (1.0 - saturation);
            const q = brightness * (1.0 - saturation * f);
            const t = brightness * (1.0 - (saturation * (1.0 - f)));

            switch (Math.trunc(h)) {
                case 0:
                    r = Math.trunc(brightness * 255.0 + 0.5);
                    g = Math.trunc(t * 255.0 + 0.5);
                    b = Math.trunc(p * 255.0 + 0.5);
                    break;
                case 1:
                    r = Math.trunc(q * 255.0 + 0.5);
                    g = Math.trunc(brightness * 255.0 + 0.5);
                    b = Math.trunc(p * 255.0 + 0.5);
                    break;
                case 2:
                    r = Math.trunc(p * 255.0 + 0.5);
                    g = Math.trunc(brightness * 255.0 + 0.5);
                    b = Math.trunc(t * 255.0 + 0.5);
                    break;
                case 3:
                    r = Math.trunc(p * 255.0 + 0.5);
                    g = Math.trunc(q * 255.0 + 0.5);
                    b = Math.trunc(brightness * 255.0 + 0.5);
                    break;
                case 4:
                    r = Math.trunc(t * 255.0 + 0.5);
                    g = Math.trunc(p * 255.0 + 0.5);
                    b = Math.trunc(brightness * 255.0 + 0.5);
                    break;
                case 5:
                    r = Math.trunc(brightness * 255.0 + 0.5);
                    g = Math.trunc(p * 255.0 + 0.5);
                    b = Math.trunc(q * 255.0 + 0.5);
                    break;
            }
        }

        // 内部转换出的 r,g,b 是 0-255 的整数，强制使用 int 模式防止被推断误判
        return new Color(r, g, b, true);
    }

    public getRGB(): number {
        return this.colour;
    }
}