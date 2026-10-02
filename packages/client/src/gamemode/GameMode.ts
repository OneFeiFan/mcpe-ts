// FORWARD-DECL(GameMode)：对应 src/client/gamemode/GameMode.h。demo 里 gameMode 始终为 null（setIsCreativeMode DEFERRED），
// 只列出 Minecraft.update 里 if (gameMode != NULL) 守卫之内用到的成员。
export interface GameMode {
  render(a: number): void;
}
