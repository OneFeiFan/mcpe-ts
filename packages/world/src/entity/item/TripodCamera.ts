// FORWARD-DECL(TripodCamera)：对应 C++ 的 class TripodCamera（拍照用的实体，Level.h、LevelListener.h 里只有前向声明）。
// 本轮只作为 LevelListener.takePicture 的参数类型出现。
import type { Entity } from '../Entity';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TripodCamera extends Entity {}
