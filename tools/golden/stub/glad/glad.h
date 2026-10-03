/* 黄金样本 harness 用的替身：只提供类型，让 client 头文件能被编译（initTiles/initItems 不调用任何 GL 函数） */
#pragma once
typedef unsigned int GLuint; typedef int GLint; typedef float GLfloat; typedef unsigned int GLenum; typedef unsigned char GLboolean;
typedef int GLsizei; typedef void GLvoid; typedef unsigned int GLbitfield; typedef float GLclampf; typedef unsigned char GLubyte;
typedef double GLdouble; typedef short GLshort; typedef signed char GLbyte; typedef unsigned short GLushort; typedef int GLfixed; typedef long GLsizeiptr; typedef long GLintptr;
#define GL_TRIANGLES 0x0004
#define GL_TEXTURE_2D 0
void glBindTexture(...);
void glColor4f(...);
void glPushMatrix(...);
void glTranslatef(...);
void glPopMatrix(...);
