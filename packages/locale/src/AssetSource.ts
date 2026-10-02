// NEW（S11，决策 D11 修订）：I18n::loadLanguage(AppPlatform*, …) 只用到 AppPlatform::readAssetFile。
// AppPlatform 在 client 包，locale 不能依赖它；这里给出结构类型，client 的 AppPlatform 在结构上满足它。
export interface AssetBlob {
  data: Uint8Array | null;
  size: number;
}

export interface AssetSource {
  readAssetFile(filename: string): AssetBlob;
}
