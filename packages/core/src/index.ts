/**
 * 拾穗核心（shisui-core）—— 纯函数，零依赖，零 DOM，零 IO。
 *
 * 这里放的是「跟界面无关」的那部分：中文口语时间怎么归一化、
 * 一段通知怎么拆成待办、待办之间怎么体检冲突。
 * 应用层（AGPL）通过普通 import 使用它；任何别的项目也可以。
 */
export * from './types'
export * from './time'
export * from './ruleParser'
export * from './conflict'
export * from './format'
export * from './merge'
export * from './samples'
