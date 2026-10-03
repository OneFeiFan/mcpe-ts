// platform/log.h 的替身，只给 harness_regionfile 用。
//
// 真的 log.h 在 PLATFORM_WEB / ANDROID 等分支下走 __LOG_PUBLISH 或 __android_log_print，
// 会拖进平台相关的头文件。RegionFile 只用 LOGI 打一句 I/O 失败诊断，harness 里不需要它出声。
#pragma once

#define LOGI(...) ((void)0)
#define LOGE(...) ((void)0)
#define LOGW(...) ((void)0)
#define LOGV(...) ((void)0)
