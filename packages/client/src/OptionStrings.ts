// 1:1 移植自 src/client/OptionStrings.h 与 OptionStrings.cpp。
// Audio_Music、Audio_Sound、Tweaks_Sprint、Tweaks_BarOnTop 在头文件里有声明、在 .cpp 里没有定义（一用就链接失败），这里不导出。
export class OptionStrings {
  static readonly Multiplayer_Username = 'mp_username';
  static readonly Multiplayer_ServerVisible = 'mp_server_visible_default';
  static readonly Graphics_Fancy = 'gfx_fancygraphics';
  static readonly Graphics_LowQuality = 'gfx_lowquality';
  static readonly Graphics_Vsync = 'gfx_vsync';
  static readonly Graphics_GUIScale = 'gfx_guiscale';
  static readonly Graphics_SmoothLightning = 'gfx_smoothlightning';
  static readonly Graphics_Anaglyph = 'gfx_anaglyph';
  static readonly Graphics_ViewBobbing = 'gfx_viewbobbing';
  static readonly Controls_Sensitivity = 'ctrl_sensitivity';
  static readonly Controls_InvertMouse = 'ctrl_invertmouse';
  static readonly Controls_UseTouchScreen = 'ctrl_usetouchscreen';
  static readonly Controls_UseTouchJoypad = 'ctrl_usetouchjoypad';
  static readonly Controls_IsLefthanded = 'ctrl_islefthanded';
  static readonly Controls_FeedbackVibration = 'feedback_vibration';
  static readonly Controls_AutoJump = 'ctrl_autojump';
  static readonly Game_DifficultyLevel = 'game_difficulty';
}
