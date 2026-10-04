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
/* 模型那一节（harness_model.cpp）要用：ModelPart::render 里有 glRotatef、ChickenModel::render 里有 glScalef。
   都只在 render 路径上，harness 只构造模型、不渲染，所以有声明就够、不需要定义。 */
void glRotatef(...);
void glScalef(...);
