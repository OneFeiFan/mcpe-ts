// 诊断用：harness 撞到陷阱替身（ud2）时打印出错地址；用 nm -C <harness> | grep <地址> 查出是哪个函数，再把它所在的 .cpp 加进 build.sh 的源码列表。
#include <signal.h>
#include <unistd.h>
#include <cstdio>
#include <cstdlib>
static void h(int, siginfo_t* si, void*) { char b[64]; int n = snprintf(b, 64, "SIGILL at %p\n", si->si_addr); write(2, b, n); _exit(4); }
__attribute__((constructor(101))) static void install() { struct sigaction sa = {}; sa.sa_sigaction = h; sa.sa_flags = SA_SIGINFO; sigaction(SIGILL, &sa, 0); }
