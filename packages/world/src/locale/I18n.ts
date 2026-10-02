// FORWARD-DECL(I18n)：对应 src/locale/I18n.h。
// S11 由你完整移植：用真正的 class I18n 整体替换本文件（决策 D11：放在 packages/world/src/locale/）。
// loadLanguage 的平台参数类型用 ./AssetSource 的接口（AppPlatform 在 client 包，world 不能依赖它）。
export class I18n {
  static get(id: string): string {
    throw new Error(`I18n 尚未移植（S11 阶段 B）：get(${id})`);
  }
}
