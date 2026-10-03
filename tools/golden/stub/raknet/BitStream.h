// raknet/BitStream.h 的替身，只给 harness_regionfile 用。
//
// 为什么不用真身：RegionFile 只用到 BitStream 的三个成员 —— 构造 (data, length, copy=false)、
// GetData()、GetNumberOfBytesUsed()；而真的 BitStream.h 会把整个 RakNet 拖进来（SocketIncludes.h、
// winsock2/arpa-inet 等网络头文件）。这符合 golden-sample skill 里写的
// 「只用到一个类的少数外部成员：在 harness 里直接给出这几个成员的定义，不链接整个 .cpp」。
//
// 语义与 RakNet 对齐：copy=false 表示借用外部缓冲区、不拷贝；GetData() 返回缓冲区首址；
// GetNumberOfBytesUsed() 返回长度。RegionFile 只读这么多字节，从不越界。
// BitStream 自己的字节布局另有 B2 的单元测试与源码依据（WriteBits 的 memcpy 分支），不在这里重复验证。
#pragma once

#include <cassert>
#include <cstring>

namespace RakNet {

class BitStream {
public:
    BitStream() : data(0), length(0), owned(false) {}

    /** 对应 RakNet 的 BitStream(unsigned char* _data, unsigned int lengthInBytes, bool _copyData) */
    BitStream(unsigned char* _data, unsigned int lengthInBytes, bool copyData)
        : data(_data), length(lengthInBytes), owned(false) {
        if (copyData) {
            data = new unsigned char[lengthInBytes];
            memcpy(data, _data, lengthInBytes);
            owned = true;
        }
    }

    ~BitStream() {
        if (owned) delete[] data;
    }

    unsigned char* GetData() const { return data; }
    unsigned int GetNumberOfBytesUsed() const { return length; }

private:
    unsigned char* data;
    unsigned int length;
    bool owned;

    BitStream(const BitStream&);
    BitStream& operator=(const BitStream&);
};

} // namespace RakNet
