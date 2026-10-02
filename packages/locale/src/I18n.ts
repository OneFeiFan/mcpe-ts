import { Util } from "@mcpe/util";
import { Tile, type ItemInstance } from "@mcpe/world";
import type { AssetSource } from "./AssetSource";



export class I18n {
  private static _strings = new Map<string, string>();

  static loadLanguage(platform: AssetSource, languageCode: string): void {
    this._strings.clear();
    this.fillTranslations(platform, "lang/en_US.lang", true);

    if (languageCode !== "en_US") {
      this.fillTranslations(platform, `lang/${languageCode}.lang`, true);
    }
  }

  // 对应 C++ 的 bool get(id, out&)
  static get(id: string): string;
  static get(id: string, out: { value: string }): boolean;
  static get(id: string, out?: { value: string }): string | boolean {
    const v = this._strings.get(id);
    if (out) {
      if (v !== undefined) {
        out.value = v;
        return true;
      }
      return false;
    }
    return v !== undefined ? v : id + "<";
  }

  static getDescriptionString(item: ItemInstance): string {
    const desc = item.getDescriptionId();
    let s = desc;

    // 特殊物品
	if (item.id == Tile.cloth.id)
		return I18n.get(item.getAuxValue()? "desc.wool" : "desc.woolstring");
	else if (item.id == Tile.fenceGate.id)
		return I18n.get("desc.fence");
	else if (item.id == Tile.stoneSlabHalf.id)
		return I18n.get("desc.slab");

    // 小写
    s = s.toLowerCase();

    // 替换前缀
    if (s.length > 0 && s[0] === "t") {
      s = Util.stringReplace(s, "tile.", "desc.");
    }
    if (s.length > 0 && s[0] === "i") {
      s = Util.stringReplace(s, "item.", "desc.");
    }

    {
      const out = { value: "" };
      if (this.get(s, out)) return out.value;
    }

    // 去掉材质词
    const materials = [
      "wood", "iron", "stone", "diamond", "gold",
      "brick", "emerald", "lapis", "cloth",
    ];
    s = Util.removeAll(s, materials, materials.length);

    {
      const out = { value: "" };
      if (this.get(s, out)) return out.value;
    }

    // 精确映射（注意：用原始 desc，不是小写后的 s）
    const mapping = ["tile.workbench", "craftingtable"];
    for (let i = 0; i < mapping.length; i += 2) {
      if (desc === mapping[i]) {
        const out = { value: "" };
        if (this.get("desc." + mapping[i + 1], out)) {
          return out.value;
        }
      }
    }

    return desc + " : couldn't find desc";
  }

  private static fillTranslations(
    platform: AssetSource,
    filename: string,
    overwrite: boolean,
  ): void {
    const blob = platform.readAssetFile(filename);
    if (!blob || !blob.data || blob.size <= 0) return;

    // 注意：C++ 里 std::string(data, blob.size) 是按字节构造字符串。
    // 这里按 UTF-8 解码；如果 C++ 侧混入了非 UTF-8 字节，需要换成字节通道。
    const text = new TextDecoder().decode(blob.data);

    for (const line of text.split("\n")) {
      const spos = line.indexOf("=");
      if (spos === -1) continue;

      const key = Util.stringTrim(line.substring(0, spos));

      // ============================================================
      // C++ 原代码在这里用 std::map::insert，不会覆盖已存在的 key。
      // 结果是：loadLanguage 先加载 en_US 再加载 languageCode，
      // 目标语言的翻译永远不生效——这是确定的 bug。
      //
      // 第三档允许自由处理，这里改为 Map.set 以修正。
      // 若要严格复刻 C++ bug，改回：
      //   if (!overwrite && this._strings.has(key)) continue;
      //   if (!this._strings.has(key)) this._strings.set(key, value);
      // ============================================================
      if (!overwrite && this._strings.has(key)) {
        continue;
      }

      const value = Util.stringTrim(line.substring(spos + 1));
      this._strings.set(key, value);
    }
  }
}