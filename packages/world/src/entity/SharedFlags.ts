// 1:1 移植自 src/world/entity/SharedFlags.h
export namespace SharedFlagsInformation {
  export enum SharedFlags {
    FLAG_ONFIRE = 0,
    FLAG_SNEAKING = 1,
    FLAG_RIDING = 2,
    FLAG_SPRINTING = 3,
    FLAG_USINGITEM = 4,
  }

  // C++: typedef char SharedFlagsInformationType;
  export type SharedFlagsInformationType = number;

  // C++: static const unsigned int DATA_SHARED_FLAGS_ID = 0;
  export const DATA_SHARED_FLAGS_ID = 0;

  // 便于直接写 SharedFlagsInformation.FLAG_ONFIRE
  export const FLAG_ONFIRE = SharedFlags.FLAG_ONFIRE;
  export const FLAG_SNEAKING = SharedFlags.FLAG_SNEAKING;
  export const FLAG_RIDING = SharedFlags.FLAG_RIDING;
  export const FLAG_SPRINTING = SharedFlags.FLAG_SPRINTING;
  export const FLAG_USINGITEM = SharedFlags.FLAG_USINGITEM;
}
